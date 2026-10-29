// New Krisp bodies expire independently twelve hours after server receipt.
// Existing unmarked records retain KRISP_RETENTION_DAYS (default14,1-90).
// Mixed indexes contain opaque references for new bodies; later arrivals and
// delivery leases never extend their absolute deadlines. Lapsed accounts do
// not accumulate new transcripts. See transcript-retention.js.
import {
  getLicense, isFounderLicenseKey, isLicenseExpired, effectiveSubscriptionLicense
} from './licensing.js';
import { kv } from './kv-client.js';
import { transcriptDeadline, readTranscriptQueue, writeTranscriptQueue } from './transcript-retention.js';

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


// Drops records past their retention window. A record whose receipt time
// cannot be read is treated as expired: for privacy, unknown age is not
// permitted to mean "keep forever".
export function pruneExpiredImports(items, nowMs = Date.now()){
  if(!Array.isArray(items)) return [];
  return items.filter(item => {
    return transcriptDeadline(item, krispRetentionMs()) > nowMs;
  });
}

// Seconds until the NEWEST remaining record expires (at least 1). The key
// must outlive every record it still holds, so the newest one decides.
export function queueTtlSeconds(items, nowMs = Date.now()){
  const deadlines = items.map(item => transcriptDeadline(item, krispRetentionMs())).filter(Number.isFinite);
  return Math.max(1, Math.ceil(((deadlines.length ? Math.max(...deadlines) : nowMs) - nowMs) / 1000));
}

export async function readImportQueue(key, nowMs = Date.now()){
  return (await readTranscriptQueue(key, await kv.get(key), krispRetentionMs(), nowMs)).items;
}

// For a raw index value already fetched (e.g. by MGET). Bodies of new-format
// records still cost one MGET of their own, exactly as readImportQueue does.
export async function readImportQueueFrom(key, raw, nowMs = Date.now()){
  return (await readTranscriptQueue(key, raw, krispRetentionMs(), nowMs)).items;
}

// Writes an already-pruned queue with its storage-level expiry, or deletes
// the key when nothing is left.
export async function writeImportQueue(key, items, nowMs = Date.now()){
  return writeTranscriptQueue(key, pruneExpiredImports(items, nowMs), krispRetentionMs(), nowMs);
}

export async function isEntitledToKrisp(licenseKey){
  if(!licenseKey) return false;
  if(isFounderLicenseKey(licenseKey)) return true;
  return isLicenseEntitledToKrisp(licenseKey, await getLicense(licenseKey));
}

// Same rules for a license record the caller already read (the inbox poll's
// single MGET), so the entitlement check costs no extra Redis command.
export function isLicenseEntitledToKrisp(licenseKey, record){
  if(!licenseKey) return false;
  if(isFounderLicenseKey(licenseKey)) return true;
  const license = effectiveSubscriptionLicense(record || null);
  if(!license) return false;
  if(license.plan !== 'pro' || license.status !== 'active') return false;
  // Stock keys cannot use Krisp before their first browser activation.
  if(license.manual === true && license.activationPending === true) return false;
  if(isLicenseExpired(license)) return false;
  return true;
}
