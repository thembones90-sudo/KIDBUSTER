'use strict';
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-license-routes.cjs ===');

  process.env.KIDBUSTER_TEST_KV = '1';
  process.env.KIDBUSTER_TEST_EMAIL = '1';

  const svc = await import('../api/_lib/license-service.js');
  const licensing = await import('../api/_lib/licensing.js');
  const { __resetForTests } = await import('../api/_lib/kv-client.js');
  const signupHandler = await import('../api/license-signup.js');
  const statusHandler = await import('../api/license-status.js');
  const recoverHandler = await import('../api/license-recover.js');
  const verifyHandler = await import('../api/license-verify.js');
  const verification = await import('../api/_lib/account-verification.js');
  const emailService = await import('../api/_lib/email-service.js');
  const adminCreateLicenseHandler = await import('../api/admin-create-license.js');
  const adminLicenseLookupHandler = await import('../api/admin-license-lookup.js');

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

  function tokenFromLastMessage(){
    const messages = emailService.__getTestMessages();
    const url = new URL(messages[messages.length - 1].verificationUrl);
    return url.searchParams.get('access_token');
  }

  console.log('\n1) access requests never disclose an existing key before email verification');
  {
    __resetForTests();
    emailService.__resetTestMessages();
    const key = await svc.getOrCreateFreeLicense('recover@example.com');
    const recover = await send(recoverHandler, { body: { email: ' Recover@Example.com ' } });
    const signup = await send(signupHandler, { body: { email: 'recover@example.com' } });
    check('known-email recovery is accepted without returning a key', recover.statusCode === 202 && !recover.jsonBody.licenseKey);
    check('repeat signup cannot disclose the existing key', signup.statusCode === 202 && !signup.jsonBody.licenseKey && signup.jsonBody.alreadyExisted === undefined);
    check('the stored key is unchanged while verification is pending', await licensing.getLicenseKeyByEmail('recover@example.com') === key);
    check('verification messages target the normalized mailbox', emailService.__getTestMessages().every(message => message.to === 'recover@example.com'));
  }

  console.log('\n2) recovery responses do not enumerate registered email addresses');
  {
    __resetForTests();
    emailService.__resetTestMessages();
    await svc.getOrCreateFreeLicense('known@example.com');
    const bad = await send(recoverHandler, { body: { email: 'not-an-email' } });
    check('invalid email returns 400', bad.statusCode === 400);
    const known = await send(recoverHandler, { body: { email: 'known@example.com' } });
    const unknown = await send(recoverHandler, { body: { email: 'missing@example.com' } });
    check('known and unknown recovery return the same status', known.statusCode === 202 && unknown.statusCode === 202);
    check('known and unknown recovery return the same body', JSON.stringify(known.jsonBody) === JSON.stringify(unknown.jsonBody));
    check('known and unknown requests take the same delivery path', emailService.__getTestMessages().length === 2 && emailService.__getTestMessages()[1].to === 'missing@example.com');
  }

  console.log('\n3) verified signup creates access only after a one-time email token is exchanged');
  {
    __resetForTests();
    emailService.__resetTestMessages();
    const requested = await send(signupHandler, { body: { email: ' New@Example.com ' } });
    check('signup challenge is accepted', requested.statusCode === 202);
    check('no account exists before mailbox verification', await licensing.getLicenseKeyByEmail('new@example.com') === null);
    const token = tokenFromLastMessage();
    const verified = await send(verifyHandler, { body: { token } });
    check('valid verification token returns a newly created Free key', verified.statusCode === 200 && verified.jsonBody.plan === 'free' && verified.jsonBody.licenseKey.startsWith('kb_live_'));
    const replay = await send(verifyHandler, { body: { token } });
    check('verification token is one-time and rejects replay', replay.statusCode === 400 && !replay.jsonBody.licenseKey);
  }

  console.log('\n4) verified recovery preserves the existing key, paid plan, and usage');
  {
    __resetForTests();
    emailService.__resetTestMessages();
    const key = await svc.getOrCreateFreeLicense('paid@example.com');
    await svc.recordUsage(key, 'MA');
    await svc.activateOrRenewPro({ licenseKey: key, email: 'paid@example.com', paymentCustomerId: 'customer_paid', paymentSubscriptionId: 'subscription_paid' });
    const requested = await send(recoverHandler, { body: { email: 'paid@example.com' } });
    const verified = await send(verifyHandler, { body: { token: tokenFromLastMessage() } });
    const license = await licensing.getLicense(key);
    check('paid owner can complete verified recovery', requested.statusCode === 202 && verified.statusCode === 200);
    check('recovery returns the same existing key', verified.jsonBody.licenseKey === key);
    check('recovery preserves Pro entitlement and subscription identity', verified.jsonBody.plan === 'pro' && license.plan === 'pro' && license.paymentSubscriptionId === 'subscription_paid');
    check('recovery preserves existing usage', await licensing.getUsageCount(key, licensing.currentUsagePeriod()) === 1);
  }

  console.log('\n5) expired verification tokens fail closed and are consumed');
  {
    __resetForTests();
    const originalNow = Date.now;
    let now = originalNow();
    Date.now = () => now;
    const issued = await verification.createVerificationToken({ email: 'expired@example.com', intent: 'signup' });
    now = issued.expiresAt + 1;
    const expired = await send(verifyHandler, { body: { token: issued.token } });
    Date.now = originalNow;
    check('expired verification token is rejected', expired.statusCode === 400 && !expired.jsonBody.licenseKey);
    check('expired token cannot create an account', await licensing.getLicenseKeyByEmail('expired@example.com') === null);
  }

  console.log('\n6) identity endpoints are rate limited without leaking account state');
  {
    __resetForTests();
    emailService.__resetTestMessages();
    let last;
    for(let i = 0; i < verification.VERIFICATION_REQUEST_LIMIT + 1; i++){
      last = await send(recoverHandler, { headers: { 'x-forwarded-for': '192.0.2.10' }, body: { email: 'limited@example.com' } });
    }
    check('requests above the verification limit return 429', last.statusCode === 429);
    check('rate-limit response never contains a license key', !last.jsonBody.licenseKey);
  }

  console.log('\n7) missing email-provider configuration fails closed without returning a key');
  {
    __resetForTests();
    emailService.__resetTestMessages();
    const originalTestEmail = process.env.KIDBUSTER_TEST_EMAIL;
    const originalProvider = process.env.EMAIL_PROVIDER;
    const originalApiKey = process.env.RESEND_API_KEY;
    const originalFrom = process.env.PATHFINDER_EMAIL_FROM;
    delete process.env.KIDBUSTER_TEST_EMAIL;
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.PATHFINDER_EMAIL_FROM;
    const unavailable = await send(signupHandler, { body: { email: 'no-provider@example.com' } });
    process.env.KIDBUSTER_TEST_EMAIL = originalTestEmail;
    if(originalProvider === undefined) delete process.env.EMAIL_PROVIDER; else process.env.EMAIL_PROVIDER = originalProvider;
    if(originalApiKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalApiKey;
    if(originalFrom === undefined) delete process.env.PATHFINDER_EMAIL_FROM; else process.env.PATHFINDER_EMAIL_FROM = originalFrom;
    check('unconfigured delivery returns 503 instead of unsafe direct access', unavailable.statusCode === 503 && !unavailable.jsonBody.licenseKey);
    check('failed delivery does not create a Free account', await licensing.getLicenseKeyByEmail('no-provider@example.com') === null);
  }

  console.log('\n8) license-status: reports Free usage and remaining monthly allowance, plus every trial protocol\'s status');
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

  console.log('\n5) license-status: owner key is Pro forever and usage-free (including every protocol\'s trial)');
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

  console.log('\n6) license-status: missing or invalid key is rejected');
  {
    __resetForTests();
    const missing = await send(statusHandler, { method: 'GET' });
    check('missing key returns 401', missing.statusCode === 401);

    const invalid = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': 'nope' } });
    check('invalid key returns 401', invalid.statusCode === 401);
  }

  console.log('\n7) admin-create-license: owner-only 30-day Pro key creation');
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

    const noEmail = await send(adminCreateLicenseHandler, { headers: { 'x-app-key': 'test_owner_key' }, body: {} });
    check('a 30-day key cannot be created without the customer email', noEmail.statusCode === 400 && /email/i.test(noEmail.jsonBody.error));
    const created = await send(adminCreateLicenseHandler, {
      headers: { 'x-app-key': 'test_owner_key' },
      body: { email: 'Buyer@Example.com' }
    });
    check('owner can create a 30-day manual Pro key', created.statusCode === 200 && created.jsonBody.licenseKey.startsWith('kb_live_'));
    check('manual route always returns 30 days', created.jsonBody.days === 30 && created.jsonBody.manual === true);

    const missingInstall = await send(statusHandler, { method: 'GET', headers: { 'x-app-key': created.jsonBody.licenseKey } });
    check('manual key status without browser installation id is rejected', missingInstall.statusCode === 403 && missingInstall.jsonBody.reason === 'missing_installation');

    const status = await send(statusHandler, {
      method: 'GET',
      headers: { 'x-app-key': created.jsonBody.licenseKey, 'x-installation-id': 'anon-route-one' }
    });
    check('new manual key status is Pro and includes expiry', status.statusCode === 200 && status.jsonBody.plan === 'pro' && typeof status.jsonBody.expiresAt === 'string');
    check('new manual key status shows normalized buyer email', status.jsonBody.email === 'buyer@example.com');

    const sameBrowser = await send(statusHandler, {
      method: 'GET',
      headers: { 'x-app-key': created.jsonBody.licenseKey, 'x-installation-id': 'anon-route-one' }
    });
    check('claimed manual key keeps working for the same browser', sameBrowser.statusCode === 200);

    const otherBrowser = await send(statusHandler, {
      method: 'GET',
      headers: { 'x-app-key': created.jsonBody.licenseKey, 'x-installation-id': 'anon-route-two' }
    });
    check('claimed manual key is rejected from a different browser', otherBrowser.statusCode === 403 && otherBrowser.jsonBody.reason === 'key_already_claimed');

    if(oldOwnerKeys === undefined) delete process.env.OWNER_LICENSE_KEYS;
    else process.env.OWNER_LICENSE_KEYS = oldOwnerKeys;
  }

  console.log('\n8) admin-license-lookup: owner-only read-only key inspection');
  {
    __resetForTests();
    const oldOwnerKeys = process.env.OWNER_LICENSE_KEYS;
    process.env.OWNER_LICENSE_KEYS = 'test_owner_key';

    const created = await svc.createManualProLicense({ email: 'lookup@example.com', days: 30 });

    const forbidden = await send(adminLicenseLookupHandler, {
      body: { licenseKey: created.licenseKey }
    });
    check('lookup without owner key is forbidden', forbidden.statusCode === 403);

    const beforeClaim = await send(adminLicenseLookupHandler, {
      headers: { 'x-app-key': 'test_owner_key' },
      body: { licenseKey: created.licenseKey }
    });
    check('owner can inspect an existing manual key', beforeClaim.statusCode === 200 && beforeClaim.jsonBody.exists === true);
    check('lookup does not claim an unused key', beforeClaim.jsonBody.license.claimed === false && beforeClaim.jsonBody.license.claimedInstallationId === null);

    await svc.checkEntitlement(created.licenseKey, 'OF', 'anon-lookup-owner');
    const afterClaim = await send(adminLicenseLookupHandler, {
      headers: { 'x-app-key': 'test_owner_key' },
      body: { licenseKey: created.licenseKey }
    });
    check('lookup shows claimed status after first use', afterClaim.jsonBody.license.claimed === true && afterClaim.jsonBody.license.claimedInstallationId === 'anon-lookup-owner');

    const missing = await send(adminLicenseLookupHandler, {
      headers: { 'x-app-key': 'test_owner_key' },
      body: { licenseKey: 'kb_live_missing' }
    });
    check('lookup for unknown key returns exists:false without throwing', missing.statusCode === 200 && missing.jsonBody.exists === false);

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
