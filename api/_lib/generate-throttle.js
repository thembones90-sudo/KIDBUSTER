// Per-license-key abuse guard for /api/generate.
//
// Entitlement (Free allowance, trials, Pro) says WHETHER a key may generate.
// It does not stop a leaked Pro key, or a stuck client loop, from firing
// hundreds of paid provider calls a minute. Two cheap, atomic limits do:
//
//  * rate:        at most N requests per rolling window per key
//  * concurrency: at most M reports in flight per key at once
//
// Both are bounded counters in the same KV used for quota, keyed by a hash of
// the license key (the raw key is never written into a KV key name). Counters
// carry a TTL so a crashed worker can never lock a teacher out for long.
import crypto from 'node:crypto';
import { reserveBoundedCounter, releaseBoundedCounter } from './kv-client.js';

export const RATE_WINDOW_SECONDS = 60;
// Longer than the 120 s platform limit (vercel.json maxDuration) so a slot is
// only ever reclaimed by TTL after its worker is definitely gone.
export const SLOT_TTL_SECONDS = 135;

function boundedIntEnv(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
export function generateRateLimitPerMinute() {
  return boundedIntEnv('GENERATE_RATE_LIMIT_PER_MINUTE', 10, 1, 1000);
}
export function generateMaxConcurrent() {
  return boundedIntEnv('GENERATE_MAX_CONCURRENT', 3, 1, 200);
}

function throttleId(licenseKey) {
  return crypto.createHash('sha256').update(String(licenseKey)).digest('hex').slice(0, 32);
}

// Returns {allowed:true, release()} or {allowed:false, reason, retryAfterSeconds, message}.
// release() is idempotent and must be called when the request finishes.
export async function acquireGenerateThrottle(licenseKey) {
  const id = throttleId(licenseKey);
  const rateKey = 'genthrottle:rate:' + id;
  const slotKey = 'genthrottle:slots:' + id;

  const rate = await reserveBoundedCounter(rateKey, generateRateLimitPerMinute(), RATE_WINDOW_SECONDS);
  if (rate === null) {
    return {
      allowed: false,
      reason: 'rate_limited',
      retryAfterSeconds: RATE_WINDOW_SECONDS,
      message: 'Too many reports requested too quickly. Wait a minute and try again. Your lesson notes are safe.'
    };
  }
  let slot;
  try {
    slot = await reserveBoundedCounter(slotKey, generateMaxConcurrent(), SLOT_TTL_SECONDS);
  } catch (err) {
    await releaseBoundedCounter(rateKey).catch(() => {});
    throw err;
  }
  if (slot === null) {
    // A request that never started should not eat into the rate allowance.
    await releaseBoundedCounter(rateKey).catch(() => {});
    return {
      allowed: false,
      reason: 'too_many_in_flight',
      retryAfterSeconds: 5,
      message: 'Several reports are already being written for this account. Wait for one to finish, then try again.'
    };
  }
  let released = false;
  return {
    allowed: true,
    async release() {
      if (released) return;
      released = true;
      await releaseBoundedCounter(slotKey);
    }
  };
}
