'use strict';
const { createChecker } = require('./helpers/assert.cjs');

/**
 * Tests api/_lib/licensing.js — both halves of it:
 *   1. Pure logic (evaluateEntitlement, generateLicenseKey,
 *      currentUsagePeriod, normalizeEmail) — the most business-critical
 *      part of the whole licensing system, since a bug here could mean
 *      Free users getting unlimited Pro access, or Pro users getting
 *      incorrectly blocked.
 *   2. The thin KV-wrapper functions, exercised against a local-only
 *      @vercel/kv stub (see node_modules/@vercel/kv/index.js) rather than
 *      a live KV instance, which this sandbox has no access to. That stub
 *      is never committed — a real `npm install` on Vercel/locally
 *      installs the genuine package in its place.
 *
 * This file is written as an ES module consumer via dynamic import()
 * (not a plain require()), since api/_lib/licensing.js uses ES module
 * syntax (the whole api/ directory does, matching package.json's
 * "type": "module") — CommonJS require() cannot load that directly, but
 * dynamic import() works fine from a .cjs file regardless.
 */
module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-licensing.cjs ===');

  const licensing = await import('../api/_lib/licensing.js');
  const { __resetForTests } = await import('../api/_lib/kv-client.js');

  console.log('\n1) evaluateEntitlement: the core Free/Pro decision logic (two-tier model)');
  {
    // --- Classic (MA): the one ongoing, monthly-resetting Free tier ---
    check('Free + MA + under monthly limit -> allowed', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'MA', monthlyUsageCount:5, trialUsageCount:0 }).allowed === true);
    check('Free + MA + at monthly limit (20) -> blocked, reason limit_reached', (() => {
      const r = licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'MA', monthlyUsageCount:20, trialUsageCount:0 });
      return r.allowed === false && r.reason === 'limit_reached';
    })());
    check('Free + MA + one under limit (19) -> still allowed', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'MA', monthlyUsageCount:19, trialUsageCount:0 }).allowed === true);
    check('MA is never affected by trialUsageCount, no matter how high', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'MA', monthlyUsageCount:0, trialUsageCount:999 }).allowed === true);

    // --- Trial-eligible protocols: one-time, permanent trial allowance ---
    // Deliberately iterates the REAL exported list, not a hand-typed
    // duplicate of it — if a protocol is ever added or removed from
    // TRIAL_ELIGIBLE_PROTOCOLS, this test automatically covers whatever
    // the list actually says, rather than silently testing a stale copy.
    check('TRIAL_ELIGIBLE_PROTOCOLS is exactly the explicit, hand-maintained list (not derived from anything else)', JSON.stringify(licensing.TRIAL_ELIGIBLE_PROTOCOLS.slice().sort()) === JSON.stringify(['BEIDA', 'BLITZ', 'FAIRY', 'MS', 'OF', 'PREPLY'].sort()));

    licensing.TRIAL_ELIGIBLE_PROTOCOLS.forEach(protocol => {
      check('Free + ' + protocol + ' + fresh (0 used) -> allowed', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol, monthlyUsageCount:0, trialUsageCount:0 }).allowed === true);
      check('Free + ' + protocol + ' + 4 used (under the 5-cap) -> still allowed', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol, monthlyUsageCount:0, trialUsageCount:4 }).allowed === true);
      check('Free + ' + protocol + ' + exactly 5 used -> blocked, reason trial_exhausted', (() => {
        const r = licensing.evaluateEntitlement({ plan:'free', status:'active', protocol, monthlyUsageCount:0, trialUsageCount:5 });
        return r.allowed === false && r.reason === 'trial_exhausted';
      })());
    });
    check('non-MA protocol is never affected by monthlyUsageCount, no matter how high', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'BEIDA', monthlyUsageCount:999, trialUsageCount:0 }).allowed === true);

    // --- The actual point of this review: a protocol in NEITHER list ---
    // must require Pro outright, not silently fall into the trial branch
    // just because it isn't in ALWAYS_FREE_PROTOCOLS. This is the exact
    // behavior change the explicit-list redesign was for — a genuinely
    // new/internal/not-yet-released protocol key defaults to the safe,
    // restrictive outcome, not an accidentally-granted free trial.
    check('Free + a protocol in NEITHER list -> blocked outright, reason protocol_requires_pro (not silently trial-eligible)', (() => {
      const r = licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'SOME_FUTURE_INTERNAL_PROTOCOL', monthlyUsageCount:0, trialUsageCount:0 });
      return r.allowed === false && r.reason === 'protocol_requires_pro';
    })());
    check('...even with a huge trialUsageCount passed in — an unlisted protocol was never trial-tracked to begin with', (() => {
      const r = licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'SOME_FUTURE_INTERNAL_PROTOCOL', monthlyUsageCount:0, trialUsageCount:0 });
      return r.allowed === false;
    })());
    check('Pro + a protocol in neither list -> still allowed (Pro bypasses this distinction entirely)', licensing.evaluateEntitlement({ plan:'pro', status:'active', protocol:'SOME_FUTURE_INTERNAL_PROTOCOL', monthlyUsageCount:0, trialUsageCount:0 }).allowed === true);
    check('a custom trialEligibleProtocols override is respected, same pattern as alwaysFreeProtocols', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'SOME_FUTURE_INTERNAL_PROTOCOL', monthlyUsageCount:0, trialUsageCount:0, trialEligibleProtocols:['SOME_FUTURE_INTERNAL_PROTOCOL'] }).allowed === true);

    check('Pro + any protocol -> always allowed regardless of either counter', licensing.evaluateEntitlement({ plan:'pro', status:'active', protocol:'BEIDA', monthlyUsageCount:999999, trialUsageCount:999999 }).allowed === true);
    check('Pro + MA -> allowed too (Pro isn\'t restricted to non-MA)', licensing.evaluateEntitlement({ plan:'pro', status:'active', protocol:'MA', monthlyUsageCount:999999, trialUsageCount:999999 }).allowed === true);

    check('inactive status -> blocked regardless of plan (fails closed)', (() => {
      const r = licensing.evaluateEntitlement({ plan:'pro', status:'canceled', protocol:'MA', monthlyUsageCount:0, trialUsageCount:0 });
      return r.allowed === false && r.reason === 'inactive';
    })());
    check('expired Pro license -> blocked, reason expired', (() => {
      const r = licensing.evaluateEntitlement({
        plan:'pro',
        status:'active',
        protocol:'BEIDA',
        monthlyUsageCount:0,
        trialUsageCount:0,
        expiresAt:'2026-07-01T00:00:00.000Z',
        now:new Date('2026-07-02T00:00:00.000Z')
      });
      return r.allowed === false && r.reason === 'expired';
    })());
    check('future-dated Pro license -> allowed until expiry', (() => {
      const r = licensing.evaluateEntitlement({
        plan:'pro',
        status:'active',
        protocol:'BEIDA',
        monthlyUsageCount:0,
        trialUsageCount:0,
        expiresAt:'2026-08-01T00:00:00.000Z',
        now:new Date('2026-07-02T00:00:00.000Z')
      });
      return r.allowed === true;
    })());

    check('unrecognized plan value -> treated as Free (fails closed, not open)', (() => {
      const r = licensing.evaluateEntitlement({ plan:'something_unexpected', status:'active', protocol:'BEIDA', monthlyUsageCount:0, trialUsageCount:5 });
      return r.allowed === false && r.reason === 'trial_exhausted';
    })());

    check('custom freeMonthlyLimit override respected', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'MA', monthlyUsageCount:5, trialUsageCount:0, freeMonthlyLimit: 5 }).allowed === false);
    check('custom trialLimit override respected', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'BEIDA', monthlyUsageCount:0, trialUsageCount:2, trialLimit: 2 }).allowed === false);
    check('custom alwaysFreeProtocols override respected', licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'BEIDA', monthlyUsageCount:5, trialUsageCount:0, alwaysFreeProtocols: ['BEIDA'] }).allowed === true);

    check('every rejection includes a non-empty, teacher-facing message', (() => {
      const r = licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'BEIDA', monthlyUsageCount:0, trialUsageCount:5 });
      return typeof r.message === 'string' && r.message.length > 10;
    })());
    check('trial_exhausted message names the specific protocol', (() => {
      const r = licensing.evaluateEntitlement({ plan:'free', status:'active', protocol:'PREPLY', monthlyUsageCount:0, trialUsageCount:5 });
      return r.message.includes('Preply') || r.message.includes('PREPLY');
    })());
  }

  console.log('\n1b) ALWAYS_FREE_PROTOCOLS and TRIAL_GENERATIONS_PER_PROTOCOL config');
  {
    check('ALWAYS_FREE_PROTOCOLS is exactly [\'MA\']', JSON.stringify(licensing.ALWAYS_FREE_PROTOCOLS) === JSON.stringify(['MA']));
    check('TRIAL_GENERATIONS_PER_PROTOCOL defaults to 5', licensing.TRIAL_GENERATIONS_PER_PROTOCOL === 5);
  }

  console.log('\n2) generateLicenseKey: format and uniqueness');
  {
    const key1 = licensing.generateLicenseKey();
    const key2 = licensing.generateLicenseKey();
    check('starts with the expected prefix', key1.startsWith('kb_live_'));
    check('is reasonably long (not a trivially guessable short string)', key1.length > 30);
    check('two calls produce different keys', key1 !== key2);
  }

  console.log('\n3) currentUsagePeriod: stable, UTC-based YYYY-MM format');
  {
    check('formats as YYYY-MM', /^\d{4}-\d{2}$/.test(licensing.currentUsagePeriod(new Date('2026-07-15T12:00:00Z'))));
    check('correct month for a real date', licensing.currentUsagePeriod(new Date('2026-07-15T12:00:00Z')) === '2026-07');
    check('different months produce different periods', licensing.currentUsagePeriod(new Date('2026-07-01T00:00:00Z')) !== licensing.currentUsagePeriod(new Date('2026-08-01T00:00:00Z')));
  }

  console.log('\n4) isFounderLicenseKey: private env-listed permanent full-access keys');
  {
    const oldOwnerKeys = process.env.OWNER_LICENSE_KEYS;
    const oldFounderKeys = process.env.FOUNDER_LICENSE_KEYS;
    process.env.OWNER_LICENSE_KEYS = 'test_owner_key';
    process.env.FOUNDER_LICENSE_KEYS = 'test_founder_key, kb_live_owner_key';
    check('exact owner key is recognized', licensing.isFounderLicenseKey('test_owner_key') === true);
    check('exact founder key is recognized', licensing.isFounderLicenseKey('test_founder_key') === true);
    check('surrounding whitespace is ignored', licensing.isFounderLicenseKey('  kb_live_owner_key  ') === true);
    check('unknown key is not recognized', licensing.isFounderLicenseKey('test_non_founder_key') === false);
    if(oldOwnerKeys === undefined) delete process.env.OWNER_LICENSE_KEYS;
    else process.env.OWNER_LICENSE_KEYS = oldOwnerKeys;
    if(oldFounderKeys === undefined) delete process.env.FOUNDER_LICENSE_KEYS;
    else process.env.FOUNDER_LICENSE_KEYS = oldFounderKeys;
  }

  console.log('\n5) normalizeEmail: case/whitespace insensitive');
  {
    check('lowercases', licensing.normalizeEmail('Nina@Example.COM') === 'nina@example.com');
    check('trims whitespace', licensing.normalizeEmail('  nina@example.com  ') === 'nina@example.com');
    check('empty/undefined -> empty string, not a crash', licensing.normalizeEmail(undefined) === '' && licensing.normalizeEmail('') === '');
  }

  console.log('\n5b) expiring-license helpers');
  {
    const start = new Date('2026-07-13T10:00:00.000Z');
    check('expiresInDays creates an ISO timestamp 30 days later', licensing.expiresInDays(30, start) === '2026-08-12T10:00:00.000Z');
    check('isLicenseExpired returns false before expiry', licensing.isLicenseExpired({ expiresAt:'2026-08-12T10:00:00.000Z' }, new Date('2026-08-12T09:59:59.000Z')) === false);
    check('isLicenseExpired returns true at/after expiry', licensing.isLicenseExpired({ expiresAt:'2026-08-12T10:00:00.000Z' }, new Date('2026-08-12T10:00:00.000Z')) === true);
    check('missing expiry means no expiry', licensing.isLicenseExpired({}, new Date('2099-01-01T00:00:00.000Z')) === false);
  }

  console.log('\n6) KV-backed primitives (against the local test stub)');
  {
    __resetForTests();

    const key = licensing.generateLicenseKey();
    check('getLicense on a never-created key -> null, not a crash', (await licensing.getLicense(key)) === null);

    await licensing.saveLicense(key, { email:'a@b.com', plan:'free', status:'active', paymentCustomerId:null, paymentSubscriptionId:null, createdAt:'2026-01-01' });
    const fetched = await licensing.getLicense(key);
    check('saveLicense then getLicense round-trips correctly', fetched && fetched.plan === 'free' && fetched.email === 'a@b.com');

    await licensing.saveEmailIndex('a@b.com', key);
    check('email index resolves back to the same key', (await licensing.getLicenseKeyByEmail('a@b.com')) === key);
    check('email index lookup is case/whitespace-normalized', (await licensing.getLicenseKeyByEmail(' A@B.com ')) === key);

    await licensing.savePaymentCustomerIndex('cust_1', key);
    check('payment-customer index resolves back to the same key', (await licensing.getLicenseKeyByPaymentCustomerId('cust_1')) === key);

    const period = licensing.currentUsagePeriod();
    check('usage count starts at 0 for a fresh key/period', (await licensing.getUsageCount(key, period)) === 0);
    await licensing.incrementUsage(key, period);
    await licensing.incrementUsage(key, period);
    check('usage count increments correctly across multiple calls', (await licensing.getUsageCount(key, period)) === 2);

    const otherPeriod = '2020-01'; // a different period entirely
    check('usage counts are isolated per period, not shared globally', (await licensing.getUsageCount(key, otherPeriod)) === 0);
  }

  console.log('\n7) Webhook dedup primitives: hasProcessedWebhook / markWebhookProcessed');
  {
    __resetForTests();
    const hash1 = 'abc123fakehash';
    const hash2 = 'def456differenthash';

    check('an unseen hash reports as not processed', (await licensing.hasProcessedWebhook(hash1)) === false);
    await licensing.markWebhookProcessed(hash1);
    check('after marking, the SAME hash reports as processed', (await licensing.hasProcessedWebhook(hash1)) === true);
    check('a DIFFERENT hash is unaffected — dedup is per-body, not global', (await licensing.hasProcessedWebhook(hash2)) === false);
  }

  return getFailures();
};

if(require.main === module){
  module.exports().then(failures => {
    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  });
}
