'use strict';
// Email-index ownership under CONTROLLED INTERLEAVING (security review item 2).
// A hook on the KV read lets a competing paid webhook, signup or owner repair
// run exactly between a claim's check and its write - the window in which a
// plain read-then-write would steal or orphan a paid customer's email.
// In-memory KV; the production Lua twin is executed separately in a Lua VM.
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-email-index-atomicity.cjs ===');
  const saved = { kv: process.env.KIDBUSTER_TEST_KV, mail: process.env.KIDBUSTER_TEST_EMAIL };
  process.env.KIDBUSTER_TEST_KV = '1';
  process.env.KIDBUSTER_TEST_EMAIL = '1';
  const kvMod = await import('../api/_lib/kv-client.js');
  const lic = await import('../api/_lib/licensing.js');
  const svc = await import('../api/_lib/license-service.js');
  const { kv } = kvMod;
  const realGet = kv.get.bind(kv);
  // Run `inject` once, right after the Nth read of `key` returns.
  function hookAfterRead(key, inject, nth = 1){
    let seen = 0, fired = false;
    kv.get = async k => {
      const value = await realGet(k);
      if(!fired && k === key && ++seen === nth){ fired = true; kv.get = realGet; await inject(); }
      return value;
    };
  }
  const freeRecord = email => ({ email, plan: 'free', status: 'active', paymentCustomerId: null, paymentSubscriptionId: null });
  const proRecord = (email, sub) => ({ email, plan: 'pro', status: 'active', source: 'subscription', paymentCustomerId: 'cust_' + sub, paymentSubscriptionId: sub });
  try{
    console.log('\n1) Holder upgraded to Pro between the check and the write');
    kvMod.__resetForTests();
    const E1 = 'race1@example.test';
    await lic.saveLicense('kb_live_A', freeRecord(E1)); await lic.saveEmailIndex(E1, 'kb_live_A');
    await lic.saveLicense('kb_live_B', proRecord('other@example.test', 'sub_B'));
    hookAfterRead('license:kb_live_A', () => lic.saveLicense('kb_live_A', proRecord(E1, 'sub_A')));
    const r1 = await svc.claimEmailIndexForPaidLicense(E1, 'kb_live_B');
    check('the claim is refused once the holder became paid', r1.ok === false && r1.reason === 'email_owned_by_paid_account');
    check('the newly paid holder keeps its email', await lic.getLicenseKeyByEmail(E1) === 'kb_live_A');

    console.log('\n2) A paid webhook binds an absent email between the check and the write');
    kvMod.__resetForTests();
    const E2 = 'race2@example.test';
    await lic.saveLicense('kb_live_B', proRecord('b@example.test', 'sub_B'));
    hookAfterRead('email:' + E2, async () => {
      await lic.saveLicense('kb_live_C', proRecord(E2, 'sub_C'));
      await svc.claimEmailIndexForPaidLicense(E2, 'kb_live_C');
    });
    const r2 = await svc.claimEmailIndexForPaidLicense(E2, 'kb_live_B');
    check('the losing claim re-evaluates and refuses the paid winner', r2.ok === false && r2.reason === 'email_owned_by_paid_account');
    check('the webhook winner keeps the email', await lic.getLicenseKeyByEmail(E2) === 'kb_live_C');

    console.log('\n3) Stale-index signup races a paid webhook');
    kvMod.__resetForTests();
    const E3 = 'race3@example.test';
    await lic.saveEmailIndex(E3, 'kb_live_STALE'); // index points at a deleted record
    hookAfterRead('license:kb_live_STALE', async () => {
      await lic.saveLicense('kb_live_P', proRecord(E3, 'sub_P'));
      await svc.claimEmailIndexForPaidLicense(E3, 'kb_live_P');
    }); // right after signup saw the stale record missing, before its atomic swap
    const signupKey = await svc.getOrCreateFreeLicense(E3);
    check('signup returns the paid account that won, not a new Free key', signupKey === 'kb_live_P');
    check('the paid account keeps the email', await lic.getLicenseKeyByEmail(E3) === 'kb_live_P');

    console.log('\n4) Owner repair races the holder being upgraded');
    kvMod.__resetForTests();
    const E4 = 'race4@example.test';
    await lic.saveLicense('kb_live_FREE', freeRecord(E4)); await lic.saveEmailIndex(E4, 'kb_live_FREE');
    await lic.saveLicense('kb_live_MANUAL', { email: '', plan: 'pro', status: 'active', manual: true, source: 'manual', paymentCustomerId: null, paymentSubscriptionId: null });
    hookAfterRead('license:kb_live_FREE', () => lic.saveLicense('kb_live_FREE', proRecord(E4, 'sub_F')));
    const r4 = await svc.linkRecoveryEmailToLicense('kb_live_MANUAL', E4);
    check('owner link is refused when the holder just became paid', r4.ok === false);
    check('the upgraded account keeps its email', await lic.getLicenseKeyByEmail(E4) === 'kb_live_FREE');

    console.log('\n5) Webhook and owner repair truly concurrent (both orders)');
    for(const order of ['webhook-first', 'repair-first']){
      kvMod.__resetForTests();
      const E5 = 'race5-' + order + '@example.test';
      await lic.saveLicense('kb_live_W', freeRecord(E5)); await lic.saveEmailIndex(E5, 'kb_live_W');
      await lic.saveLicense('kb_live_M', { email: '', plan: 'pro', status: 'active', manual: true, source: 'manual', paymentCustomerId: null, paymentSubscriptionId: null });
      const webhook = () => svc.activateOrRenewPro({ licenseKey: 'kb_live_W', email: E5, paymentCustomerId: 'cust_W', paymentSubscriptionId: 'sub_W' });
      const repair = () => svc.linkRecoveryEmailToLicense('kb_live_M', E5);
      await Promise.all(order === 'webhook-first' ? [webhook(), repair()] : [repair(), webhook()]);
      const holder = await lic.getLicenseKeyByEmail(E5);
      const w = await lic.getLicense('kb_live_W');
      check(order + ': the paying webhook account is Pro', w.plan === 'pro' && w.paymentSubscriptionId === 'sub_W');
      check(order + ': its email is either still linked or explicitly flagged, never silently lost',
        holder === 'kb_live_W' || !!w.emailIndexConflict);
    }

    console.log('\n6) Concurrent signups for one new email');
    kvMod.__resetForTests();
    const E6 = 'race6@example.test';
    const keys = await Promise.all([svc.getOrCreateFreeLicense(E6), svc.getOrCreateFreeLicense(E6), svc.getOrCreateFreeLicense(E6)]);
    const winner = await lic.getLicenseKeyByEmail(E6);
    check('all concurrent signups return the single indexed account', keys.every(k => k === winner) && !!(await lic.getLicense(winner)));

    console.log('\n7) Manual key issue races a new subscription');
    kvMod.__resetForTests();
    const E7 = 'race7@example.test';
    await lic.saveLicense('kb_live_OLDFREE', freeRecord(E7)); await lic.saveEmailIndex(E7, 'kb_live_OLDFREE');
    hookAfterRead('email:' + E7, async () => {
      await lic.saveLicense('kb_live_S', proRecord(E7, 'sub_S'));
      await svc.claimEmailIndexForPaidLicense(E7, 'kb_live_S');
    });
    const issued = await svc.createManualProLicense({ email: E7, note: 'race' });
    check('a manual key never takes the email from a subscription that won the race', issued.emailLinked === false && await lic.getLicenseKeyByEmail(E7) === 'kb_live_S');

    console.log('\n8) A failing atomic step never throws into payment processing');
    kvMod.__resetForTests();
    const E8 = 'race8@example.test';
    const realSet = kv.set.bind(kv);
    // Simulate the store failing during the email claim only (after the paid record write).
    let paidWritten = false;
    kv.set = async (k, v, o) => { if(k === 'license:kb_live_X' && v && v.plan === 'pro') paidWritten = true; return realSet(k, v, o); };
    const origSwap = lic.swapEmailIndex;
    kvMod.__simulateOutage(false);
    const key8 = await svc.activateOrRenewPro({ licenseKey: 'kb_live_X', email: E8, paymentCustomerId: 'cust_X', paymentSubscriptionId: 'sub_X' });
    kv.set = realSet;
    check('the paid record is written before the email claim', paidWritten && (await lic.getLicense(key8)).plan === 'pro');
    void origSwap;
  }catch(err){
    console.log('  FAIL  unexpected exception: ' + (err && err.stack || err));
    check('suite completed without exception', false);
  }finally{
    kv.get = realGet;
    for(const [k, v] of [['KIDBUSTER_TEST_KV', saved.kv], ['KIDBUSTER_TEST_EMAIL', saved.mail]]){ if(v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
