// Retention and entitlement rules for stored Krisp transcripts.
//
// Pending and matched imports contain lesson transcripts (including
// children's speech). They must not live forever:
//   * every record expires KRISP_RETENTION_DAYS after it was received
//     (default 14, configurable 1-90) and is removed whenever the queue is
//     read or written after that point;
//   * the whole queue key also carries a storage-level expiry equal to the
//     remaining life of its NEWEST record, so an inbox nobody opens again is
//     still deleted by the datastore itself. (Per-record deletion inside one
//     stored list is not possible at storage level, so the worst-case age of
//     an old record in an idle inbox is just under twice the retention
//     period; it is normally removed far sooner by the first read or write.)
//   * accounts that are no longer entitled to Krisp do not accumulate new
//     transcripts at all (see isEntitledToKrisp).
import {
  getLicense, isFounderLicenseKey, isLicenseExpired, effectiveSubscriptionLicense
} from './licensing.js';
import { kv } from './kv-client.js';

export const DEFAULT_RETENTION_DAYS = 14;
export const MAX_RETENTION_DAYS = 90;

export function krispRetentionDays(){
  const configured = Number.parseInt(process.env.KRISP_RETENTION_DAYS || '', 10);
  return Number.isInteger(configured) && configured >= 1 && configured <= MAX_RETENTION_DAYS
    ? configured : DEFAULT_RETENTION_DAYS;
}
export function krispRetentionMs(){
  return krispRetentionDays() * 24 * 60 * 60 * 1000;
}

function receivedMs(item){
  const ms = Date.parse(item && item.receivedAt);
  return Number.isFinite(ms) ? ms : null;
}

// Drops records past their retention window. A record whose receipt time
// cannot be read is treated as expired: for privacy, unknown age is not
// permitted to mean "keep forever".
export function pruneExpiredImports(items, nowMs = Date.now()){
  if(!Array.isArray(items)) return [];
  const cutoff = nowMs - krispRetentionMs();
  return items.filter(item => {
    const ms = receivedMs(item);
    return ms !== null && ms > cutoff;
  });
}

// Seconds until the NEWEST remaining record expires (at least 1). The key
// must outlive every record it still holds, so the newest one decides.
export function queueTtlSeconds(items, nowMs = Date.now()){
  let newest = null;
  for(const item of items){
    const ms = receivedMs(item);
    if(ms !== null && (newest === null || ms > newest)) newest = ms;
  }
  if(newest === null) return 1;
  return Math.max(1, Math.ceil((newest + krispRetentionMs() - nowMs) / 1000));
}

export async function readImportQueue(key, nowMs = Date.now()){
  return pruneExpiredImports((await kv.get(key)) || [], nowMs);
}

// Writes an already-pruned queue with its storage-level expiry, or deletes
// the key when nothing is left.
export async function writeImportQueue(key, items, nowMs = Date.now()){
  const live = pruneExpiredImports(items, nowMs);
  if(live.length === 0){
    await kv.del(key);
    return live;
  }
  await kv.set(key, live, { ex: queueTtlSeconds(live, nowMs) });
  return live;
}

export async function isEntitledToKrisp(licenseKey){
  if(!licenseKey) return false;
  if(isFounderLicenseKey(licenseKey)) return true;
  const license = effectiveSubscriptionLicense(await getLicense(licenseKey));
  if(!license) return false;
  if(license.plan !== 'pro' || license.status !== 'active') return false;
  // Stock keys cannot use Krisp before their first browser activation.
  if(license.manual === true && license.activationPending === true) return false;
  if(isLicenseExpired(license)) return false;
  return true;
}
