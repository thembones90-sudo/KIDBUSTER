'use strict';
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-license-routes.cjs ===');

  process.env.KIDBUSTER_TEST_KV = '1';

  const svc = await import('../api/_lib/license-service.js');
  const licensing = await import('../api/_lib/licensing.js');
  const { __resetForTests } = await import('../api/_lib/kv-client.js');
  const statusHandler = await import('../api/license-status.js');
  const recoverHandler = await import('../api/license-recover.js');
  const adminCreateLicenseHandler = await import('../api/admin-create-license.js');

  async function send(handler, { method = 'POST', headers = {}, body = {} } = {}){
    const req = { method, headers, body };
    let statusCode = null;
    let jsonBody = null;
    const res = {
      status(code){ statusCode = code; return res; },
      json(bodyJson){ jsonBody = bodyJson; return res; }
    };
    await handler.default(req, res);
    return { statusCode, jsonBody };
  }

  console.log('\n1) license-recover: finds an existing key by normalized email');
  {
    __resetForTests();
    const key = await svc.getOrCreateFreeLicense('recover@example.com');
    const result = await send(recoverHandler, { body: { email: ' Recover@Example.com ' } });
    check('recover returns 200 for a known email', result.statusCode === 200);
    check('recover returns the same existing license key', result.jsonBody.licenseKey === key);
  }

  console.log('\n2) license-recover: validates bad or unknown email');
  {
    __resetForTests();
    const bad = await send(recoverHandler, { body: { email: 'not-an-email' } });
    check('invalid email returns 400', bad.statusCode === 400);

    const missing = await send(recoverHandler, { body: { email: 'missing@example.com' } });
    check('unknown email returns 404', missing.statusCode === 404);
  }

  console.log('\n3) license-status: reports Free usage and remaining monthly allowance, plus every trial protocol\'s status');
  {
    __resetForTests();
    const key = await svc.getOrCreateFreeLicense('status@example.com');
    await svc.recordUsage(key, 'MA');
    await svc.recordUsage(key, 'MA');
    await svc.recordUsage(key, 'BEIDA');
    await svc.recordUsage(key, 'BEIDA');
    await svc.recordUsage(key, 'BEIDA');

    const result = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': key } });
    check('status returns 200 for a real license', result.statusCode === 200);
    check('status reports Free plan and active state', result.jsonBody.plan === 'free' && result.jsonBody.status === 'active');
    check('status includes usage and remaining free reports', result.jsonBody.usageCount === 2 && result.jsonBody.remainingFreeReports === licensing.FREE_MONTHLY_LIMIT - 2);

    const trials = result.jsonBody.trials;
    check('trials object is present and includes every trial-eligible protocol', trials && ['MS', 'FAIRY', 'BLITZ', 'BEIDA', 'OF', 'PREPLY'].every(p => p in trials));
    check('trials object does NOT include MA (the one always-free protocol)', !('MA' in trials));
    check('a fresh protocol (MS) reports 0 used, full remaining', trials.MS.trialUsageCount === 0 && trials.MS.remainingTrialGenerations === licensing.TRIAL_GENERATIONS_PER_PROTOCOL);
    check('Beida, used 3 times, reports that correctly', trials.BEIDA.trialUsageCount === 3 && trials.BEIDA.remainingTrialGenerations === licensing.TRIAL_GENERATIONS_PER_PROTOCOL - 3);
  }

  console.log('\n4) license-status: owner key is Pro forever and usage-free (including every protocol\'s trial)');
  {
    __resetForTests();
    const oldOwnerKeys = process.env.OWNER_LICENSE_KEYS;
    process.env.OWNER_LICENSE_KEYS = 'test_owner_key';

    const result = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': 'test_owner_key' } });
    check('owner key status returns 200', result.statusCode === 200);
    check('owner key reports Pro founder access', result.jsonBody.plan === 'pro' && result.jsonBody.founder === true);
    check('owner key has no Free remaining limit', result.jsonBody.remainingFreeReports === null);
    check('owner key\'s trial protocols all report null remaining (unlimited, not a real count)', result.jsonBody.trials.BEIDA.remainingTrialGenerations === null);

    if(oldOwnerKeys === undefined) delete process.env.OWNER_LICENSE_KEYS;
    else process.env.OWNER_LICENSE_KEYS = oldOwnerKeys;
  }

  console.log('\n5) license-status: missing or invalid key is rejected');
  {
    __resetForTests();
    const missing = await send(statusHandler, { method: 'GET' });
    check('missing key returns 401', missing.statusCode === 401);

    const invalid = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': 'nope' } });
    check('invalid key returns 401', invalid.statusCode === 401);
  }

  console.log('\n6) admin-create-license: owner-only 30-day Pro key creation');
  {
    __resetForTests();
    const oldOwnerKeys = process.env.OWNER_LICENSE_KEYS;
    process.env.OWNER_LICENSE_KEYS = 'test_owner_key';

    const missing = await send(adminCreateLicenseHandler, { body: { email: 'buyer@example.com' } });
    check('creating a manual key without owner key is forbidden', missing.statusCode === 403);

    const normalKey = await svc.getOrCreateFreeLicense('normal@example.com');
    const normalUser = await send(adminCreateLicenseHandler, {
      headers: { 'x-app-key': normalKey },
      body: { email: 'buyer@example.com' }
    });
    check('creating a manual key with a normal key is forbidden', normalUser.statusCode === 403);

    const created = await send(adminCreateLicenseHandler, {
      headers: { 'x-app-key': 'test_owner_key' },
      body: { email: 'Buyer@Example.com' }
    });
    check('owner can create a 30-day manual Pro key', created.statusCode === 200 && created.jsonBody.licenseKey.startsWith('kb_live_'));
    check('manual route always returns 30 days', created.jsonBody.days === 30 && created.jsonBody.manual === true);

    const status = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': created.jsonBody.licenseKey } });
    check('new manual key status is Pro and includes expiry', status.statusCode === 200 && status.jsonBody.plan === 'pro' && typeof status.jsonBody.expiresAt === 'string');
    check('new manual key status shows normalized buyer email', status.jsonBody.email === 'buyer@example.com');

    if(oldOwnerKeys === undefined) delete process.env.OWNER_LICENSE_KEYS;
    else process.env.OWNER_LICENSE_KEYS = oldOwnerKeys;
  }

  return getFailures();
};

if(require.main === module){
  module.exports().then(failures => {
    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  });
}
