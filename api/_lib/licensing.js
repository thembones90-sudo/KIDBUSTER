// Shared licensing/entitlement module — imported by api/generate.js,
// api/license-signup.js, api/create-checkout-session.js, and
// api/stripe-webhook.js. Has no default export, so Vercel never treats
// this file itself as a route.
//
// Deliberately split into two halves:
//   1. Pure functions (evaluateEntitlement, generateLicenseKey,
//      currentUsagePeriod, normalizeEmail) — no I/O at all, fully
//      unit-tested in tests/test-licensing.cjs without needing a real
//      KV/Stripe connection.
//   2. Thin Vercel KV wrappers — one line each, calling directly into
//      @vercel/kv's documented API. These can't be exercised by this
//      project's test suite (no live KV instance in that environment),
//      so keeping them this thin is deliberate: the less untested logic
//      they contain, the less that's actually at risk.
//
// Product shape (see DECISIONS.md for the full reasoning): exactly two
// plans, Free and Pro. Nothing more granular — no per-feature flags, no
// usage-based billing, no additional tiers. The one thing that's kept
// configurable, per explicit request, is the Free plan's monthly report
// limit and which protocol(s) it covers — everything else about "what
// Free vs Pro means" is intentionally hardcoded to keep this simple.

import crypto from 'crypto';
import { kv } from './kv-client.js';

// ---------- configuration ----------

export const FREE_MONTHLY_LIMIT = parseInt(process.env.FREE_MONTHLY_LIMIT || '20', 10);

// Classic (MA) is the only protocol with a genuine, ongoing Free tier —
// FREE_MONTHLY_LIMIT reports every calendar month, forever, never expires.
export const ALWAYS_FREE_PROTOCOLS = ['MA'];

// Every protocol that gets the one-time trial allowance (5 free
// generations, ever, per protocol, per license — not monthly, does not
// reset; once exhausted, that protocol requires Pro). This is the
// "Protocol Trial Unlocks" model: every listed protocol is discoverable
// and testable without paying, but permanent access stays a Pro feature.
//
// Deliberately an explicit, hand-maintained list — NOT derived from
// "every protocol that exists and isn't in ALWAYS_FREE_PROTOCOLS". This
// is a monetization decision, not a byproduct of which protocols happen
// to have a display label somewhere. A protocol that exists in the app
// but isn't listed in either this array or ALWAYS_FREE_PROTOCOLS is
// simply not available on a Free/non-Pro plan at all — no trial, no
// ongoing free tier — which has to be a real, visible decision made
// right here, not something that falls out of a filter. Adding a future
// protocol means adding one line here on purpose, not getting entitlement
// behavior for free (in the wrong sense) just because it exists.
export const TRIAL_ELIGIBLE_PROTOCOLS = ['MS', 'BLITZ', 'BEIDA', 'OF', 'PREPLY'];

export const TRIAL_GENERATIONS_PER_PROTOCOL = parseInt(process.env.TRIAL_GENERATIONS_PER_PROTOCOL || '5', 10);

// Display labels for teacher-facing messages only — evaluateEntitlement
// only ever receives a raw protocol key (e.g. 'BEIDA', 'PREPLY') and has
// no access to the frontend's own PROTOCOLS registry (a browser-side
// object in index.html), so a small mapping lives here too. Falls back
// to the raw key itself for anything not listed, so a new protocol added
// to the frontend without updating this map degrades gracefully (a
// slightly less polished message) rather than breaking.
const PROTOCOL_LABELS = {
  MA: 'Classic',
  MS: 'Sugarcoat',
  BLITZ: 'Blitz',
  BEIDA: 'Beida',
  OF: 'OF Protocol',
  PREPLY: 'Preply'
};

export { PROTOCOL_LABELS };

function protocolLabel(protocol){
  return PROTOCOL_LABELS[protocol] || protocol;
}

// ---------- pure logic (unit-tested directly, no I/O) ----------

/**
 * The single place that decides whether a generation request is allowed.
 * Deliberately "fails closed": any unrecognized plan/status value is
 * treated as the more restrictive case rather than accidentally granting
 * unlimited access on a data bug or a typo.
 *
 * Two completely independent Free-tier mechanisms, deliberately not
 * unified into one, because they mean different things:
 *   - Classic (MA): monthlyUsageCount vs. freeMonthlyLimit, resets every
 *     calendar month, ongoing forever. This is "try the product."
 *   - Every other protocol: trialUsageCount vs. trialLimit, a one-time,
 *     permanent, never-resets allowance. This is "try this specific
 *     protocol once, then decide."
 *
 * @param {object} params
 * @param {string} params.plan - 'free' | 'pro' (anything else treated as 'free')
 * @param {string} params.status - 'active' | anything else (anything else = not allowed)
 * @param {string} params.protocol - the protocol key being requested (e.g. 'MA', 'BEIDA')
 * @param {number} params.monthlyUsageCount - Classic's usage count so far this month (ignored for other protocols)
 * @param {number} params.trialUsageCount - this protocol's one-time trial usage so far (ignored for Classic)
 * @param {number} [params.freeMonthlyLimit] - defaults to FREE_MONTHLY_LIMIT
 * @param {number} [params.trialLimit] - defaults to TRIAL_GENERATIONS_PER_PROTOCOL
 * @param {string[]} [params.alwaysFreeProtocols] - defaults to ALWAYS_FREE_PROTOCOLS
 * @returns {{allowed: boolean, reason: string|null, message: string|null}}
 */
export function evaluateEntitlement({ plan, status, protocol, monthlyUsageCount, trialUsageCount, freeMonthlyLimit, trialLimit, alwaysFreeProtocols, trialEligibleProtocols }){
  const limit = typeof freeMonthlyLimit === 'number' ? freeMonthlyLimit : FREE_MONTHLY_LIMIT;
  const trialCap = typeof trialLimit === 'number' ? trialLimit : TRIAL_GENERATIONS_PER_PROTOCOL;
  const alwaysFree = alwaysFreeProtocols || ALWAYS_FREE_PROTOCOLS;
  const trialEligible = trialEligibleProtocols || TRIAL_ELIGIBLE_PROTOCOLS;

  if(status !== 'active'){
    return {
      allowed: false,
      reason: 'inactive',
      message: 'This license is not active. If you believe this is a mistake, please contact support.'
    };
  }

  if(plan === 'pro'){
    return { allowed: true, reason: null, message: null };
  }

  // Anything that isn't exactly 'pro' (including 'free', missing, or an
  // unrecognized value) is treated as Free — the conservative default.
  if(alwaysFree.includes(protocol)){
    if((monthlyUsageCount || 0) >= limit){
      return {
        allowed: false,
        reason: 'limit_reached',
        message: 'You\'ve used all ' + limit + ' free reports this month. Upgrade to Pro for unlimited reports and every protocol.'
      };
    }
    return { allowed: true, reason: null, message: null };
  }

  if(trialEligible.includes(protocol)){
    // One-time trial allowance, never resets.
    if((trialUsageCount || 0) >= trialCap){
      return {
        allowed: false,
        reason: 'trial_exhausted',
        message: 'Your complimentary ' + protocolLabel(protocol) + ' trial has ended. Upgrade to Pathfinder Pro to continue using this protocol.'
      };
    }
    return { allowed: true, reason: null, message: null };
  }

  // A protocol that's in NEITHER list — not always-free, not trial-
  // eligible — is simply not available on a Free/non-Pro plan at all.
  // This is a deliberate, explicit outcome (e.g. an internal-only or
  // not-yet-released protocol), not a bug: it means whoever added the
  // protocol hasn't yet made the monetization decision for it, and the
  // safe default is to require Pro rather than silently granting a
  // trial nobody actually decided to offer.
  return {
    allowed: false,
    reason: 'protocol_requires_pro',
    message: 'The ' + protocolLabel(protocol) + ' protocol requires Pathfinder Pro.'
  };
}

/**
 * Generates a new license key. Prefixed and formatted similarly to how
 * Stripe/other API providers format their own keys — recognizable at a
 * glance, greppable in logs, not easily confused with any other secret
 * this project uses (e.g. ANTHROPIC_API_KEY, APP_ACCESS_KEY).
 * @returns {string}
 */
export function generateLicenseKey(){
  return 'kb_live_' + crypto.randomBytes(24).toString('hex');
}

/**
 * Private owner/beta keys that should behave like Pro forever without a
 * payment provider. Kept in Vercel env, never in git. OWNER_LICENSE_KEYS
 * is the preferred name; FOUNDER_LICENSE_KEYS is kept as a backwards-
 * compatible alias because the live project already uses it.
 * @param {string} licenseKey
 * @returns {boolean}
 */
export function isFounderLicenseKey(licenseKey){
  if(!licenseKey) return false;
  const raw = [
    process.env.OWNER_LICENSE_KEYS || '',
    process.env.FOUNDER_LICENSE_KEYS || ''
  ].join(',');
  return raw
    .split(',')
    .map(key => key.trim())
    .filter(Boolean)
    .includes(licenseKey.trim());
}

/**
 * The current usage-tracking period, as a stable string key ('YYYY-MM',
 * UTC-based so it doesn't depend on server timezone). Usage resets
 * naturally every calendar month simply because this produces a new,
 * never-before-used KV key — no cron job or reset logic needed.
 * @param {Date} [date] - defaults to now; parameterized for testing
 * @returns {string}
 */
export function currentUsagePeriod(date){
  return (date || new Date()).toISOString().slice(0, 7);
}

/**
 * Normalizes an email for use as a KV lookup key — lowercased and
 * trimmed, so "Nina@Example.com" and " nina@example.com " resolve to the
 * same license record instead of silently creating two.
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email){
  return (email || '').trim().toLowerCase();
}

// ---------- Vercel KV I/O (thin wrappers, not unit-tested — see module comment) ----------

const licenseKeyFor = (key) => 'license:' + key;
const emailIndexFor = (email) => 'email:' + normalizeEmail(email);
const paymentCustomerIndexFor = (customerId) => 'paymentCustomer:' + customerId;
const usageKeyFor = (key, period) => 'usage:' + key + ':' + period;

export async function getLicense(licenseKey){
  if(!licenseKey) return null;
  return (await kv.get(licenseKeyFor(licenseKey))) || null;
}

export async function saveLicense(licenseKey, data){
  await kv.set(licenseKeyFor(licenseKey), data);
}

export async function getLicenseKeyByEmail(email){
  return (await kv.get(emailIndexFor(email))) || null;
}

export async function saveEmailIndex(email, licenseKey){
  await kv.set(emailIndexFor(email), licenseKey);
}

/**
 * "Payment customer id" is deliberately provider-neutral — whichever
 * payment provider is active (Lemon Squeezy, Paddle, or anything else
 * later), its own customer identifier gets stored and looked up under
 * this same name, so license-service.js never needs to know or care
 * which provider it came from.
 */
export async function getLicenseKeyByPaymentCustomerId(customerId){
  return (await kv.get(paymentCustomerIndexFor(customerId))) || null;
}

export async function savePaymentCustomerIndex(customerId, licenseKey){
  await kv.set(paymentCustomerIndexFor(customerId), licenseKey);
}

export async function getUsageCount(licenseKey, period){
  const count = await kv.get(usageKeyFor(licenseKey, period || currentUsagePeriod()));
  return typeof count === 'number' ? count : 0;
}

/**
 * Increments this license's usage counter for the current period and
 * sets it to expire ~40 days out — comfortably past month-end regardless
 * of which day the increment happened on, so old counters clean
 * themselves up automatically rather than accumulating forever.
 */
export async function incrementUsage(licenseKey, period){
  const key = usageKeyFor(licenseKey, period || currentUsagePeriod());
  const newCount = await kv.incr(key);
  await kv.expire(key, 60 * 60 * 24 * 40);
  return newCount;
}

// ---------- one-time per-protocol trial usage (Protocol Trial Unlocks) ----------
//
// Deliberately a SEPARATE counter from the monthly usage above, with no
// period component at all — this is a permanent, cumulative count of how
// many times this license has ever used this specific protocol while not
// on Pro. It never resets and never expires, unlike the monthly counter,
// because the whole point is a one-time allowance per protocol, not a
// recurring one. Adding a brand new protocol later needs zero changes
// here — the key is just built from whatever protocol string is passed.

const trialUsageKeyFor = (licenseKey, protocol) => 'trial:' + licenseKey + ':' + protocol;

export async function getTrialUsageCount(licenseKey, protocol){
  const count = await kv.get(trialUsageKeyFor(licenseKey, protocol));
  return typeof count === 'number' ? count : 0;
}

export async function incrementTrialUsage(licenseKey, protocol){
  return await kv.incr(trialUsageKeyFor(licenseKey, protocol));
}

// ---------- webhook duplicate/replay protection ----------
//
// Lemon Squeezy's signature scheme (HMAC-SHA256 over the raw body, no
// timestamp or nonce) proves a webhook was genuinely signed by the real
// secret, but proves nothing about WHEN — a validly-signed request can be
// resent later, either legitimately (Lemon Squeezy retries up to 3 times
// if a webhook doesn't respond 200) or maliciously (someone who captured
// a real request replaying it). Both cases look identical: the exact
// same raw body, arriving more than once. Recording a hash of every
// body actually processed, and skipping anything already seen, handles
// both uniformly without needing to tell them apart.

const webhookSeenKeyFor = (bodyHash) => 'webhookSeen:' + bodyHash;

export async function hasProcessedWebhook(bodyHash){
  return !!(await kv.get(webhookSeenKeyFor(bodyHash)));
}

/**
 * Marks a webhook body as processed. TTL is deliberately generous (30
 * days, comfortably longer than any provider's own retry window) — this
 * is about replay protection, not just deduping a same-minute retry, so
 * it needs to remember for longer than that.
 */
export async function markWebhookProcessed(bodyHash){
  await kv.set(webhookSeenKeyFor(bodyHash), true);
  await kv.expire(webhookSeenKeyFor(bodyHash), 60 * 60 * 24 * 30);
}
