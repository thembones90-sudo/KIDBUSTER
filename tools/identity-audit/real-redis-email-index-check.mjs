// Real-Redis compatibility check for the atomic email-index swap (owner
// decision 2026-10-23: mandatory before promoting the guarded implementation).
//
// Runs the PRODUCTION guardedEmailIndexSwap / license-service code through the
// real @vercel/kv client against a DISPOSABLE Upstash database. Only synthetic
// identities are written. Refuses to run unless:
//   - CLASSBUSTER_DISPOSABLE_REDIS=1 is set explicitly,
//   - KV_REST_API_URL is an Upstash HTTPS endpoint, and
//   - the database is (nearly) empty, so a production store can never be used.
// Credentials come from the environment only and are never printed.
//
//   CLASSBUSTER_DISPOSABLE_REDIS=1 KV_REST_API_URL=... KV_REST_API_TOKEN=... \
//     node tools/identity-audit/real-redis-email-index-check.mjs
import crypto from 'node:crypto';

const url = process.env.KV_REST_API_URL || '';
if(process.env.CLASSBUSTER_DISPOSABLE_REDIS !== '1'){ console.log('REFUSED: set CLASSBUSTER_DISPOSABLE_REDIS=1 for a disposable database'); process.exit(2); }
if(!/^https:\/\/[a-z0-9.-]+\.upstash\.io\/?$/.test(url) || !process.env.KV_REST_API_TOKEN){ console.log('REFUSED: KV_REST_API_URL/KV_REST_API_TOKEN must name an Upstash REST endpoint'); process.exit(2); }
delete process.env.KIDBUSTER_TEST_KV; delete process.env.PATHFINDER_V2_LOCAL_DB;
delete process.env.GOOGLE_SHEET_WEBHOOK_URL; delete process.env.RESEND_API_KEY;
process.env.KIDBUSTER_TEST_EMAIL = '1';

const { kv, guardedEmailIndexSwap } = await import('../../api/_lib/kv-client.js');
const lic = await import('../../api/_lib/licensing.js');
const svc = await import('../../api/_lib/license-service.js');

const size = await kv.dbsize();
if(size > 50){ console.log('REFUSED: database holds ' + size + ' keys; this check only runs on a disposable database'); process.exit(2); }

const run = crypto.randomBytes(6).toString('hex');
const results = [];
const check = (name, ok) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name); };
const email = n => `rr-${run}-${n}@example.test`;
const key = n => `kb_live_rr${run}_${n}`;
const free = e => ({ email: e, plan: 'free', status: 'active', paymentCustomerId: null, paymentSubscriptionId: null });
const pro = (e, s) => ({ email: e, plan: 'pro', status: 'active', source: 'subscription', paymentCustomerId: 'cust_' + s, paymentSubscriptionId: s });
const idx = e => 'email:' + lic.normalizeEmail(e);
const holder = async e => lic.getLicenseKeyByEmail(e);

try{
  console.log('\n1) Lua decision matrix on real Redis (records written by the app serializer)');
  const matrix = [
    ['absent index, expect absent -> swap', null, null, null, 'unpaid', true],
    ['present index, expect absent -> refuse', 'OLD', null, null, 'unpaid', false],
    ['free holder with JSON null ids -> swap', 'OLD', free('x'), 'OLD', 'unpaid', true],
    ['pro holder -> refuse', 'OLD', { ...free('x'), plan: 'pro' }, 'OLD', 'unpaid', false],
    ['payment customer id -> refuse', 'OLD', { ...free('x'), paymentCustomerId: 'c1' }, 'OLD', 'unpaid', false],
    ['subscription id -> refuse', 'OLD', { ...free('x'), paymentSubscriptionId: 's1' }, 'OLD', 'unpaid', false],
    ['manual holder -> refuse', 'OLD', { ...free('x'), manual: true }, 'OLD', 'unpaid', false],
    ['empty-string ids -> swap', 'OLD', { ...free('x'), paymentCustomerId: '' }, 'OLD', 'unpaid', true],
    ['unicode and nested fields decode -> swap', 'OLD', { ...free('x'), note: 'Čćžšđ – 漢字 "q"', meta: { a: [1, null, { b: true }] } }, 'OLD', 'unpaid', true],
    ['holder changed since read -> refuse', 'OTHER', free('x'), 'OLD', 'unpaid', false],
    ['unpaid: missing holder record -> swap', 'OLD', null, 'OLD', 'unpaid', true],
    ['stale: missing holder record -> swap', 'OLD', null, 'OLD', 'stale', true],
    ['stale: existing free record -> refuse', 'OLD', free('x'), 'OLD', 'stale', false],
    ['nosub: older manual pro -> swap', 'OLD', { ...free('x'), plan: 'pro', manual: true, source: 'manual' }, 'OLD', 'nosub', true],
    ['nosub: pro subscription -> refuse', 'OLD', pro('x', 's1'), 'OLD', 'nosub', false],
    ['nosub: free holder -> swap', 'OLD', free('x'), 'OLD', 'nosub', true]
  ];
  for(const [i, [name, current, record, expected, mode, wantSwap]] of matrix.entries()){
    const e = email('m' + i), oldKey = key('m' + i + 'old'), otherKey = key('m' + i + 'other'), newKey = key('m' + i + 'new');
    const curKey = current === 'OLD' ? oldKey : current === 'OTHER' ? otherKey : null;
    if(curKey) await lic.saveEmailIndex(e, curKey);
    if(record) await lic.saveLicense(oldKey, record);
    const expKey = expected === 'OLD' ? oldKey : null;
    const r = await guardedEmailIndexSwap(idx(e), expKey ? 'license:' + expKey : null, expKey, newKey, mode);
    const after = await holder(e);
    const ok = r.swapped === wantSwap && !r.error && after === (wantSwap ? newKey : curKey) && r.current === (curKey || null);
    check(name, ok);
    if(!ok) console.log('      got ' + JSON.stringify({ swapped: r.swapped, error: !!r.error, sameAsNew: after === newKey, sameAsCur: after === curKey }));
  }

  console.log('\n2) Real concurrency');
  const eRace = email('race');
  const contenders = Array.from({ length: 25 }, (_, n) => key('race' + n));
  const outcomes = await Promise.all(contenders.map(k => guardedEmailIndexSwap(idx(eRace), null, null, k, 'unpaid')));
  const winners = contenders.filter((k, n) => outcomes[n].swapped);
  check('25 concurrent first-claims: exactly one wins and holds the email', winners.length === 1 && await holder(eRace) === winners[0]);

  let invariantOk = true;
  for(let n = 0; n < 12; n++){
    const e = email('wh' + n), w = key('wh' + n + 'w'), m = key('wh' + n + 'm');
    await lic.saveLicense(w, free(e)); await lic.saveEmailIndex(e, w);
    await lic.saveLicense(m, { email: '', plan: 'pro', status: 'active', manual: true, source: 'manual', paymentCustomerId: null, paymentSubscriptionId: null });
    const jobs = [svc.activateOrRenewPro({ licenseKey: w, email: e, paymentCustomerId: 'cust_w' + n, paymentSubscriptionId: 'sub_w' + n }), svc.linkRecoveryEmailToLicense(m, e)];
    await Promise.all(n % 2 ? jobs.reverse() : jobs);
    const rec = await lic.getLicense(w), h = await holder(e);
    if(!(rec.plan === 'pro' && rec.paymentSubscriptionId === 'sub_w' + n && (h === w || rec.emailIndexConflict))) invariantOk = false;
  }
  check('12 concurrent webhook vs owner-repair rounds: the payer is Pro and never silently loses its email', invariantOk);

  const eSign = email('signup');
  const signups = await Promise.all(Array.from({ length: 8 }, () => svc.getOrCreateFreeLicense(eSign)));
  const signupHolder = await holder(eSign);
  check('8 concurrent signups for one email return the single indexed account', signups.every(k => k === signupHolder) && !!(await lic.getLicense(signupHolder)));

  const ePaid = email('paid'), payer = key('paid'), thief = key('thief');
  await lic.saveLicense(payer, pro(ePaid, 'sub_paid')); await lic.saveEmailIndex(ePaid, payer);
  await lic.saveLicense(thief, pro('other-' + ePaid, 'sub_thief'));
  const steal = await Promise.all(Array.from({ length: 6 }, () => svc.claimEmailIndexForPaidLicense(ePaid, thief)));
  check('concurrent claims never take an email from a paying account', steal.every(r => r.ok === false) && await holder(ePaid) === payer);

  console.log('\n3) Fail-safe on a Redis-side error');
  const eErr = email('err'), errOld = key('errold'), errHash = 'license:' + errOld;
  await lic.saveEmailIndex(eErr, errOld);
  await kv.hset(errHash, { not: 'a-string' }); // GET on a hash raises WRONGTYPE inside the script
  const origError = console.error; let logged = '';
  console.error = (...a) => { logged += a.join(' '); };
  let threw = false, r3;
  try{ r3 = await guardedEmailIndexSwap(idx(eErr), errHash, errOld, key('errnew'), 'unpaid'); }catch{ threw = true; }
  console.error = origError;
  check('a script error never throws, never writes and is reported', !threw && r3?.swapped === false && r3?.error === true && await holder(eErr) === errOld && /guarded email-index swap failed/.test(logged));

  console.log('\n4) Full paid webhook on an absent email');
  const eNew = email('new'), kNew = key('new');
  const got = await svc.activateOrRenewPro({ licenseKey: kNew, email: eNew, paymentCustomerId: 'cust_new', paymentSubscriptionId: 'sub_new' });
  const recNew = await lic.getLicense(got);
  check('webhook creates Pro and links the email', recNew?.plan === 'pro' && await holder(eNew) === got && !recNew.emailIndexConflict);
}catch(err){
  console.log('FAIL unexpected exception: ' + (err?.message || err));
  results.push(false);
}finally{
  // Synthetic data only; remove everything this run created.
  let cursor = '0', removed = 0;
  do{
    const [next, keys] = await kv.scan(cursor, { match: '*', count: 500 });
    const mine = keys.filter(k => k.includes(run) || k.startsWith('license:kb_live_') || k.startsWith('email:rr-'));
    if(mine.length){ await kv.del(...mine); removed += mine.length; }
    cursor = String(next);
  }while(cursor !== '0');
  console.log('\ncleanup: removed ' + removed + ' synthetic keys');
}
const failed = results.filter(x => !x).length;
console.log(`\n${results.length - failed}/${results.length} real-Redis checks passed`);
process.exit(failed ? 1 : 0);
