// Owner-only customer identity continuity: audit and explicit repair.
//
// Legacy (kidbuster.vercel.app / Pathfinder) accounts keep their ORIGINAL
// license record. What can break is only the email:<address> sign-in index:
// missing (manual key issued without email, interrupted write), stale (points
// to a deleted record) or pointing at a later auto-created Free account. Then
// email sign-in cannot reach the paid account even though it still exists.
//
// - auditIdentityPage: bounded, read-only SCAN of one page of license:* or
//   email:* keys. Output is masked (email shape + hash, key fingerprint); no
//   raw key, token, or payment identifier ever leaves the server. Repairable
//   rows get an opaque one-hour candidate token kept in KV.
// - repairEmailIndex: one explicit email -> proven original key repair. Dry
//   run by default; apply needs confirm:'REPAIR'. Only the email index is
//   written (via claimEmailIndexForPaidLicense, which never takes an email
//   from another paid account). Every apply leaves an audit record.
// Nothing here deletes, downgrades or rewrites a license record.
import crypto from 'node:crypto';
import { kv } from './kv-client.js';
import { getLicense, getLicenseKeyByEmail, normalizeEmail, isFounderLicenseKey } from './licensing.js';
import { isPaidOrIssuedLicense, claimEmailIndexForPaidLicense } from './license-service.js';
import { notifyAccessEvent } from './access-notifications.js';

// Small pages keep one owner request well inside the function time limit
// (at most ~3 reads per key) and bound how many candidate tokens one call mints.
export const AUDIT_PAGE_MAX = 50;
export const CANDIDATE_TTL_SECONDS = 60 * 60;
const CANDIDATE_PREFIX = 'identityRepairCandidate:';
const AUDIT_PREFIX = 'identityRepairAudit:';
const LOCK_PREFIX = 'identityRepairLock:';

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function keyFingerprint(licenseKey){
  return licenseKey ? 'k_' + sha('license:' + licenseKey).slice(0, 12) : null;
}
// The owner can hash a known customer email locally and match this value.
export function emailHash(email){
  return email ? 'e_' + sha(normalizeEmail(email)).slice(0, 12) : null;
}
export function maskEmail(email){
  const value = normalizeEmail(email);
  const at = value.lastIndexOf('@');
  if(at < 1) return value ? '***' : '';
  const local = value.slice(0, at), domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  return local.slice(0, 2) + '***@' + host.slice(0, 1) + '***' + tld;
}

export function classifyLicense(license){
  if(!license) return 'missing';
  if(license.paymentSubscriptionId || license.source === 'subscription') return 'subscription';
  if(license.manual === true) return 'manual';
  if(license.plan === 'pro') return 'pro_other';
  if(license.paymentCustomerId) return 'former_customer';
  return 'free';
}

function publicRow(licenseKey, license){
  return {
    ref: keyFingerprint(licenseKey),
    emailMasked: maskEmail(license?.email || ''),
    emailHash: emailHash(license?.email || ''),
    kind: classifyLicense(license),
    plan: license?.plan || null,
    status: license?.status || null,
    subscriptionStatus: license?.subscriptionStatus || null,
    hasPaymentCustomer: !!license?.paymentCustomerId,
    hasSubscription: !!license?.paymentSubscriptionId,
    claimedDevice: !!license?.claimedInstallationId,
    createdAt: license?.createdAt || null,
    emailIndexConflict: !!license?.emailIndexConflict
  };
}

async function issueCandidate(licenseKey, email){
  const token = crypto.randomBytes(24).toString('base64url');
  await kv.set(CANDIDATE_PREFIX + sha(token), { licenseKey, email: normalizeEmail(email) }, { ex: CANDIDATE_TTL_SECONDS });
  return token;
}

// Decides what the email index SHOULD be for one license record.
async function judgeLicense(licenseKey, license, withCandidates){
  const row = publicRow(licenseKey, license);
  const paid = isPaidOrIssuedLicense(license);
  const email = normalizeEmail(license?.email || '');
  if(!email || !EMAIL_RE.test(email)){
    row.indexState = 'no_email';
    row.verdict = paid ? 'needs_key_proof_no_email' : 'info_free_no_email';
    return row;
  }
  const indexed = await getLicenseKeyByEmail(email);
  if(indexed === licenseKey){ row.indexState = 'linked'; row.verdict = 'ok'; return row; }
  if(!indexed){ row.indexState = 'missing'; row.verdict = paid ? 'repairable_missing_index' : 'info_free_unindexed'; }
  else{
    const target = await getLicense(indexed);
    row.indexTargetRef = keyFingerprint(indexed);
    row.indexTargetKind = classifyLicense(target);
    if(!target){ row.indexState = 'stale'; row.verdict = paid ? 'repairable_stale_index' : 'info_free_stale_index'; }
    else if(isPaidOrIssuedLicense(target)){
      row.indexState = 'other_paid';
      row.verdict = paid ? 'ambiguous_email_on_two_paid_accounts' : 'info_free_duplicate_of_paid';
    }else{
      row.indexState = 'other_free';
      row.verdict = paid ? 'repairable_move_from_free' : 'info_free_duplicate';
    }
  }
  // Opaque, one-hour repair tokens are minted only when the owner asks for a
  // repair preview; a plain audit writes nothing at all.
  if(withCandidates && row.verdict.startsWith('repairable_')) row.candidateToken = await issueCandidate(licenseKey, email);
  return row;
}

async function judgeEmailIndex(indexKey){
  const email = indexKey.slice('email:'.length);
  const target = await kv.get(indexKey);
  const license = target ? await getLicense(target) : null;
  const row = { emailMasked: maskEmail(email), emailHash: emailHash(email), targetRef: keyFingerprint(target), targetKind: classifyLicense(license) };
  if(!license) row.verdict = 'stale_index_missing_record';
  else if(normalizeEmail(license.email || '') !== email) row.verdict = license.email ? 'record_email_differs' : 'record_has_no_email';
  else row.verdict = 'ok';
  return row;
}

/**
 * Reads ONE bounded page. Call repeatedly with the returned cursor until done.
 * @param {{scope?:'licenses'|'email-index', cursor?:string|number, count?:number}} options
 */
export async function auditIdentityPage({ scope = 'licenses', cursor = '0', count = AUDIT_PAGE_MAX, withCandidates = false } = {}){
  const size = Math.max(1, Math.min(AUDIT_PAGE_MAX, Number.parseInt(count, 10) || AUDIT_PAGE_MAX));
  const prefix = scope === 'email-index' ? 'email:' : 'license:';
  const [next, keys] = await kv.scan(String(cursor || '0'), { match: prefix + '*', count: size });
  const rows = [];
  const totals = {};
  for(const key of keys){
    if(!key.startsWith(prefix)) continue;
    let row;
    if(scope === 'email-index') row = await judgeEmailIndex(key);
    else{
      const licenseKey = key.slice(prefix.length);
      if(isFounderLicenseKey(licenseKey)) continue;
      const license = await getLicense(licenseKey);
      if(!license || typeof license !== 'object') continue;
      row = await judgeLicense(licenseKey, license, withCandidates === true);
    }
    totals[row.verdict] = (totals[row.verdict] || 0) + 1;
    rows.push(row);
  }
  return { scope: scope === 'email-index' ? 'email-index' : 'licenses', cursor: String(next), done: String(next) === '0', scanned: keys.length, totals, rows };
}

/** Targeted, read-only check of specific emails (index only; no key returned). */
export async function lookupEmails(emails){
  const list = (Array.isArray(emails) ? emails : []).slice(0, 20).map(normalizeEmail).filter(Boolean);
  const out = [];
  for(const email of list){
    const indexed = await getLicenseKeyByEmail(email);
    const license = indexed ? await getLicense(indexed) : null;
    out.push({
      emailMasked: maskEmail(email), emailHash: emailHash(email),
      indexState: !indexed ? 'missing' : license ? 'linked' : 'stale',
      ...(license ? publicRow(indexed, license) : {}),
      recordEmailMatches: license ? normalizeEmail(license.email || '') === email : null
    });
  }
  return out;
}

/**
 * Explicit owner repair. Target is a proven original key (licenseKey) or an
 * audit candidateToken. dryRun defaults to TRUE; apply requires confirm:'REPAIR'.
 * A record whose stored email differs from `email` (purchase vs sign-in
 * email) needs allowEmailMismatch plus a written evidence note.
 */
export async function repairEmailIndex({ email, licenseKey, candidateToken, dryRun = true, confirm = '', allowEmailMismatch = false, evidence = '' } = {}){
  const normalized = normalizeEmail(email || '');
  let key = String(licenseKey || '').trim();
  let candidateEmail = '';
  if(!key && candidateToken){
    const candidate = await kv.get(CANDIDATE_PREFIX + sha(candidateToken));
    if(!candidate) return { ok: false, reason: 'candidate_expired' };
    if(normalized && candidate.email !== normalized) return { ok: false, reason: 'candidate_email_mismatch' };
    key = candidate.licenseKey;
    candidateEmail = candidate.email;
  }
  const targetEmail = normalized || candidateEmail;
  if(!EMAIL_RE.test(targetEmail)) return { ok: false, reason: 'invalid_email' };
  if(!key) return { ok: false, reason: 'invalid_key' };
  if(isFounderLicenseKey(key)) return { ok: false, reason: 'owner_key' };
  const license = await getLicense(key);
  if(!license) return { ok: false, reason: 'invalid_key' };
  if(!isPaidOrIssuedLicense(license)) return { ok: false, reason: 'not_paid', target: publicRow(key, license) };
  const recordEmail = normalizeEmail(license.email || '');
  const mismatch = !!recordEmail && recordEmail !== targetEmail;
  const note = String(evidence || '').trim().slice(0, 300);
  if(mismatch && !(allowEmailMismatch === true && note.length >= 8)){
    return { ok: false, reason: 'record_email_differs', target: publicRow(key, license) };
  }

  const previousKey = await getLicenseKeyByEmail(targetEmail);
  const previous = previousKey && previousKey !== key ? await getLicense(previousKey) : null;
  const plan = {
    emailMasked: maskEmail(targetEmail), emailHash: emailHash(targetEmail),
    target: publicRow(key, license),
    current: previousKey === key ? 'already_linked' : !previousKey ? 'missing' : !previous ? 'stale' : isPaidOrIssuedLicense(previous) ? 'other_paid' : 'other_free',
    currentRef: keyFingerprint(previousKey)
  };
  if(plan.current === 'already_linked') return { ok: true, dryRun: !!dryRun, unchanged: true, plan };
  if(plan.current === 'other_paid') return { ok: false, reason: 'email_owned_by_paid_account', plan };
  if(dryRun !== false) return { ok: true, dryRun: true, wouldWrite: true, plan };
  if(confirm !== 'REPAIR') return { ok: false, reason: 'confirmation_required', plan };

  // One repair per email at a time; claimEmailIndexForPaidLicense re-checks
  // the current owner immediately before writing.
  const lockKey = LOCK_PREFIX + sha(targetEmail);
  const lockToken = crypto.randomBytes(12).toString('hex');
  if(await kv.set(lockKey, lockToken, { nx: true, ex: 30 }) === null) return { ok: false, reason: 'busy', plan };
  try{
    const result = await claimEmailIndexForPaidLicense(targetEmail, key);
    if(!result.ok) return { ok: false, reason: result.reason, plan };
    const at = new Date().toISOString();
    const auditId = AUDIT_PREFIX + at + ':' + crypto.randomBytes(4).toString('hex');
    await kv.set(auditId, {
      at, action: 'link_email_index', emailHash: emailHash(targetEmail), emailMasked: plan.emailMasked,
      targetRef: keyFingerprint(key), previousRef: keyFingerprint(result.previousKey), previousState: plan.current,
      emailMismatchAllowed: mismatch, evidence: note || null
    });
    if(candidateToken) await kv.del(CANDIDATE_PREFIX + sha(candidateToken));
    await notifyAccessEvent({
      type: 'identity_repair', title: 'Owner repair: email sign-in now reaches the original paid license.',
      email: targetEmail, licenseKey: key,
      details: ['Previous index: ' + plan.current, mismatch ? 'Record email differs; evidence: ' + note : '']
    });
    return { ok: true, dryRun: false, written: true, auditId, plan };
  }finally{
    if(await kv.get(lockKey) === lockToken) await kv.del(lockKey);
  }
}
