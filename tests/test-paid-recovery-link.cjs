'use strict';
// Paid-account recovery (2026-10-23 incident). A Pro key issued manually WITHOUT
// an email is activated on a device; when the customer later uses an email
// recovery link, the email index has no paid license, so every link signs them
// into a separate Free account. Reproduces that failure, then verifies the
// owner-only repair (link-email) and the guard that stops a manual key from
// taking over a paying subscriber's recovery email. In-memory KV, test email.
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-paid-recovery-link.cjs ===');
  const saved = { kv: process.env.KIDBUSTER_TEST_KV, mail: process.env.KIDBUSTER_TEST_EMAIL, owner: process.env.OWNER_LICENSE_KEYS };
  process.env.KIDBUSTER_TEST_KV = '1';
  process.env.KIDBUSTER_TEST_EMAIL = '1';
  process.env.OWNER_LICENSE_KEYS = 'test_owner_paid_recovery';
  const OWNER = { 'x-app-key': 'test_owner_paid_recovery' };
  try{
    const svc = await import('../api/_lib/license-service.js');
    const licensing = await import('../api/_lib/licensing.js');
    const { __resetForTests } = await import('../api/_lib/kv-client.js');
    const recoverHandler = await import('../api/license-recover.js');
    const verifyHandler = await import('../api/license-verify.js');
    const statusHandler = await import('../api/license-status.js');
    const lookupHandler = await import('../api/admin-license-lookup.js');
    const emailService = await import('../api/_lib/email-service.js');
    __resetForTests();
    emailService.__resetTestMessages();

    async function send(handler, { method = 'POST', headers = {}, body = {} } = {}){
      let statusCode = null, jsonBody = null;
      const res = { status(code){ statusCode = code; return res; }, json(b){ jsonBody = b; return res; }, setHeader(){} };
      await handler.default({ method, headers, body, query: {} }, res);
      return { statusCode, jsonBody };
    }
    async function recoverViaEmail(email){
      const req = await send(recoverHandler, { body: { email } });
      const messages = emailService.__getTestMessages();
      const token = new URL(messages[messages.length - 1].verificationUrl).searchParams.get('access_token');
      const verified = await send(verifyHandler, { body: { token } });
      return { requested: req.statusCode, ...verified.jsonBody, statusCode: verified.statusCode };
    }
    const link = (licenseKey, email, headers = OWNER) => send(lookupHandler, { headers, body: { action: 'link-email', licenseKey, email } });
    const EMAIL = 'paid.customer@example.com';

    console.log('\n1) The demonstrated failure');
    const { licenseKey: paidKey } = await svc.createManualProLicense({ note: 'sold without an email' });
    const activated = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': paidKey, 'x-installation-id': 'customer-device-1' } });
    check('the manual key activates as Pro on the customer device', activated.statusCode === 200 && activated.jsonBody.plan === 'pro');
    const first = await recoverViaEmail(EMAIL);
    check('email recovery signs the paying customer into a separate FREE account (the bug)', first.statusCode === 200 && first.plan === 'free' && first.licenseKey !== paidKey);
    const again = await recoverViaEmail(EMAIL);
    check('every further recovery link opens the same Free account', again.licenseKey === first.licenseKey && again.plan === 'free');
    const freeKey = first.licenseKey;

    console.log('\n2) Owner repair: link the recovery email to the paid key');
    const before = JSON.stringify(await licensing.getLicense(paidKey));
    check('a non-owner cannot link', (await link(paidKey, EMAIL, { 'x-app-key': freeKey })).statusCode === 403);
    check('a Free key cannot be linked as paid', (await link(freeKey, EMAIL)).statusCode === 400);
    check('an invalid email is refused', (await link(paidKey, 'not-an-email')).statusCode === 400);
    check('an unknown key is refused', (await link('kb_live_does_not_exist', EMAIL)).statusCode === 400);
    const linked = await link(paidKey, ' Paid.Customer@Example.com ');
    check('owner link succeeds and moves the email off the Free account', linked.statusCode === 200 && linked.jsonBody.linked && linked.jsonBody.movedFromFreeAccount);
    check('the paid license record is byte-for-byte unchanged (key, expiry, device claim, ids)', JSON.stringify(await licensing.getLicense(paidKey)) === before);
    check('the Free account record is kept, not deleted', !!(await licensing.getLicense(freeKey)));
    const recovered = await recoverViaEmail(EMAIL);
    check('email recovery now returns the PAID key and Pro plan', recovered.statusCode === 200 && recovered.licenseKey === paidKey && recovered.plan === 'pro');
    const sameDevice = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': paidKey, 'x-installation-id': 'customer-device-1' } });
    check('the original device claim still works after recovery', sameDevice.statusCode === 200 && sameDevice.jsonBody.plan === 'pro');
    check('linking again is a harmless no-op', (await link(paidKey, EMAIL)).jsonBody.unchanged === true);

    console.log('\n3) A paying subscriber can never be taken over');
    const SUB = 'subscriber@example.com';
    await svc.activateOrRenewPro({ email: SUB, paymentCustomerId: 'cust_1', paymentSubscriptionId: 'sub_1' });
    const subKey = await licensing.getLicenseKeyByEmail(SUB);
    const conflict = await link(paidKey, SUB);
    check('linking a manual key to a subscriber email is refused (409)', conflict.statusCode === 409);
    check('the subscriber email still opens the subscription account', await licensing.getLicenseKeyByEmail(SUB) === subKey);
    const issued = await svc.createManualProLicense({ email: SUB, note: 'accidental reuse' });
    check('issuing a manual key with a subscriber email does not move their recovery', issued.emailLinked === false && await licensing.getLicenseKeyByEmail(SUB) === subKey);

    console.log('\n4) Manual re-issue keeps working');
    const OLD = 'returning@example.com';
    const oldKey = (await svc.createManualProLicense({ email: OLD })).licenseKey;
    const newKey = (await svc.createManualProLicense({ email: OLD, note: 'new month' }));
    check('a new manual key for a previous manual customer links their email', newKey.emailLinked === true && await licensing.getLicenseKeyByEmail(OLD) === newKey.licenseKey && newKey.licenseKey !== oldKey);
  }catch(err){
    console.log('  FAIL  unexpected exception: ' + (err && err.stack || err));
    check('suite completed without exception', false);
  }finally{
    for(const [k, v] of [['KIDBUSTER_TEST_KV', saved.kv], ['KIDBUSTER_TEST_EMAIL', saved.mail], ['OWNER_LICENSE_KEYS', saved.owner]]){
      if(v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
