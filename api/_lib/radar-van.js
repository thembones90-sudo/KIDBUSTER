// RADAR VAN lesson inbox store (Phase 3). Independent of Krisp: nothing here
// reads or writes krisp:* keys, usage counters or the generation pipeline.
//
// KV layout (identity = the stable Pathfinder license identity, never the token):
//   rv:settings:<id>              durable, NO TTL: { tokenHash, armed, ... }
//   rv:token:<sha256(token)>      reverse mapping { identity } - only honoured
//                                 while rv:settings:<id>.tokenHash matches
//   rv:data:<id>:pending|matched  queues, 24-hour retention, <= 20 items each
//   rv:data:<id>:seen:<lessonId>  durable dedupe marker (outlives the queues)
//   rv:data:<id>:last             last received timestamp
//   rv:data:<id>:lock             inbox mutation lock
//   rv:settings:<id>:lock         token / ARM mutation lock
//   rv:settings:<id>:ver          durable, NO TTL: change counter, bumped after
//                                 every change a session view can show, so an
//                                 idle poll is one MGET instead of a full read
import crypto from 'node:crypto';
import { scoutStudentLabel } from './scout-student-name.js';
import { kv, acquirePaymentLock, releasePaymentLock, incrementWindowCounter } from './kv-client.js';
import { isFounderLicenseKey } from './licensing.js';

export const RADAR_VAN_RETENTION_DAYS = 1;
export const RADAR_VAN_MAX_ITEMS = 20;
export const RADAR_VAN_MAX_BODY_BYTES = 250 * 1024;
export const RADAR_VAN_SEEN_TTL_SECONDS = 21 * 86400;
export const RADAR_VAN_LEASE_MS = 45 * 1000;
const RETENTION_MS = RADAR_VAN_RETENTION_DAYS * 86400000;
const MAX_MATCHED_DELIVERIES = 10;
const MAX_TRANSCRIPT_CHARS = 200000;
const MAX_TITLE_CHARS = 120;
const MAX_DURATION_SECONDS = 21600;
const MAX_LABEL_CHARS = 80;
const MAX_FRAGMENTS = 64;
const MAX_ELAPSED_MS = 86400000;
const ELAPSED_SLACK_MS = 120000;

export const radarTuning = { lockWaitMs: 2500 };

export class RadarBusyError extends Error {
  constructor(){ super('RADAR VAN is busy'); this.name = 'RadarBusyError'; this.reason = 'busy'; }
}

export function radarVanEnabled(){ return process.env.RADAR_VAN_ENABLED === 'true'; }

// ---------- identity, keys ----------
export function validIdentity(identity){
  return typeof identity === 'string' && /^[A-Za-z0-9_.-]{1,200}$/.test(identity);
}
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const K = {
  settings: id => 'rv:settings:' + id,
  settingsLock: id => 'rv:settings:' + id + ':lock',
  token: hash => 'rv:token:' + hash,
  pending: id => 'rv:data:' + id + ':pending',
  matched: id => 'rv:data:' + id + ':matched',
  last: id => 'rv:data:' + id + ':last',
  seen: (id, lessonId) => 'rv:data:' + id + ':seen:' + lessonId,
  lock: id => 'rv:data:' + id + ':lock',
  version: id => 'rv:settings:' + id + ':ver'
};
export const radarKeys = K;

// ---------- change counter ----------
// Bumped AFTER a change is persisted, and session views read it BEFORE the
// state, so a poller can only ever see a version older than its data (one
// extra full read), never newer (a missed change). Best effort: a lost bump
// delays the view until the client's periodic full refresh, nothing more.
async function bumpVersion(identity){
  await kv.incr(K.version(identity)).catch(() => {});
}
const versionString = value => String(Number(value) || 0);
async function readVersion(identity){
  return versionString(await kv.get(K.version(identity)));
}

// ---------- token ----------
export function hashRadarToken(token){ return sha256(token); }
export function makeRadarToken(){ return 'rv1_' + crypto.randomBytes(32).toString('base64url'); }
export function validRadarToken(token){ return typeof token === 'string' && /^rv1_[A-Za-z0-9_-]{43}$/.test(token); }
function safeEqualHex(a, b){
  if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---------- locking ----------
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withLock(lockKey, work, waitMs = radarTuning.lockWaitMs){
  const lockToken = crypto.randomBytes(16).toString('hex');
  const deadline = Date.now() + waitMs;
  while(!await acquirePaymentLock(lockKey, lockToken, 15)){
    if(Date.now() >= deadline) throw new RadarBusyError();
    await sleep(25);
  }
  try{ return await work(); }
  finally{ await releasePaymentLock(lockKey, lockToken).catch(() => {}); }
}

// ---------- durable settings (token + automatic import; legacy ARM compatible) ----------
function blankSettings(){ return { tokenHash: null, armed: false, automatic: false, connectedAt: null, teacherDisplayName: null }; }

// Teacher name is explicitly chosen in the authenticated Classbuster form.
// It is not guessed from speech, the Windows username, or a device token.
export function validateScoutTeacherName(value){
  if(value === null || value === '') return null;
  if(typeof value !== 'string' || value.length > 80 || !value.trim() ||
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f]/u.test(value)) return undefined;
  return value.trim().replace(/ {2,}/g, ' ');
}

export async function readRadarSettings(identity){
  const stored = await kv.get(K.settings(identity));
  if(!stored || typeof stored !== 'object') return blankSettings();
  return {
    tokenHash: typeof stored.tokenHash === 'string' && /^[0-9a-f]{64}$/.test(stored.tokenHash) ? stored.tokenHash : null,
    armed: stored.armed === true,
    automatic: stored.automatic === true,
    inboxOnly: stored.inboxOnly === true,
    connectedAt: stored.connectedAt || null,
    teacherDisplayName: validateScoutTeacherName(stored.teacherDisplayName) || null
  };
}
async function writeSettings(identity, settings){
  // No expiry option: the connection lasts until explicit Disconnect.
  await kv.set(K.settings(identity), { ...settings, updatedAt: new Date().toISOString() });
}

export async function resolveRadarToken(token){
  if(!validRadarToken(token)) return null;
  const hash = hashRadarToken(token);
  const mapping = await kv.get(K.token(hash));
  if(!mapping || !validIdentity(mapping.identity)) return null;
  // The reverse mapping alone is not enough: the account's settings must still
  // point at this exact hash, so rotation/revoke is effective the instant the
  // settings record is written, even if deleting the old mapping fails.
  const settings = await readRadarSettings(mapping.identity);
  return safeEqualHex(settings.tokenHash, hash) ? mapping.identity : null;
}

// Connect or rotate. The plaintext token exists only in the return value.
export async function issueRadarToken(identity, { automatic = false } = {}){
  return withLock(K.settingsLock(identity), async () => {
    const settings = await readRadarSettings(identity);
    const token = makeRadarToken();
    const hash = hashRadarToken(token);
    const now = new Date().toISOString();
    await kv.set(K.token(hash), { identity, createdAt: now });
    try{
      await writeSettings(identity, { ...settings, automatic: automatic || settings.automatic, tokenHash: hash, connectedAt: settings.tokenHash ? settings.connectedAt : now });
    }catch(err){
      await kv.del(K.token(hash)).catch(() => {});
      throw err;
    }
    if(settings.tokenHash && settings.tokenHash !== hash) await kv.del(K.token(settings.tokenHash)).catch(() => {});
    await bumpVersion(identity);
    return token;
  });
}

// Authenticated browser-only name sync. This updates the teacher's display
// metadata, not the device credential and never a raw audio transcript.
export async function setRadarTeacherName(identity, name){
  const checked = validateScoutTeacherName(name);
  if(checked === undefined) return { invalid: true };
  return withLock(K.settingsLock(identity), async () => {
    const settings = await readRadarSettings(identity);
    if(!settings.tokenHash) return { notConnected: true };
    if(settings.teacherDisplayName !== checked){
      await writeSettings(identity, { ...settings, teacherDisplayName: checked });
      await bumpVersion(identity);
    }
    return { updated: true, teacherDisplayName: checked };
  });
}

// One-click pairing: the desktop app created its own token and sent only its
// SHA-256 through the owner's signed-in browser. The raw token never reaches
// the browser or this server. A hash already bound to any account is refused.
export const RADAR_TOKEN_HASH = /^[0-9a-f]{64}$/;
export async function bindRadarTokenHash(identity, hash, displayName){
  if(!RADAR_TOKEN_HASH.test(String(hash || ''))) return { invalid: true };
  const checked = displayName === undefined ? undefined : validateScoutTeacherName(displayName);
  if(displayName !== undefined && checked === undefined && displayName !== null && displayName !== '') return { invalidName: true };
  return withLock(K.settingsLock(identity), async () => {
    const settings = await readRadarSettings(identity);
    if(settings.tokenHash === hash){
      if(displayName !== undefined && settings.teacherDisplayName !== checked){
        await writeSettings(identity, { ...settings, teacherDisplayName: checked });
        await bumpVersion(identity);
      }
      return { unchanged: true };
    }
    if(await kv.get(K.token(hash))) return { taken: true };
    const now = new Date().toISOString();
    await kv.set(K.token(hash), { identity, createdAt: now, paired: true });
    try{
      await writeSettings(identity, { ...settings, automatic: true, inboxOnly: true, tokenHash: hash,
        teacherDisplayName: displayName === undefined ? settings.teacherDisplayName : checked,
        connectedAt: settings.tokenHash ? settings.connectedAt : now });
    }catch(err){
      await kv.del(K.token(hash)).catch(() => {});
      throw err;
    }
    if(settings.tokenHash) await kv.del(K.token(settings.tokenHash)).catch(() => {});
    await bumpVersion(identity);
    return { bound: true };
  });
}

// Revokes the credential and disarms. Queued transcripts are left alone.
// Resolves only once the revoked state has been read back.
export async function revokeRadarToken(identity){
  return withLock(K.settingsLock(identity), async () => {
    const settings = await readRadarSettings(identity);
    await writeSettings(identity, { ...settings, tokenHash: null, armed: false, automatic: false });
    const check = await readRadarSettings(identity);
    if(check.tokenHash !== null || check.armed) throw new Error('revoke not confirmed');
    if(settings.tokenHash) await kv.del(K.token(settings.tokenHash)).catch(() => {});
    await bumpVersion(identity);
    return { revoked: !!settings.tokenHash };
  });
}

// Persistent ARM toggle, independent of every transcript TTL.
export async function setRadarArmed(identity, armed){
  return withLock(K.settingsLock(identity), async () => {
    const settings = await readRadarSettings(identity);
    if(!settings.tokenHash) return { notConnected: true };
    if(settings.automatic) return { automatic: true };
    await writeSettings(identity, { ...settings, armed: !!armed });
    await bumpVersion(identity);
    return { armed: !!armed };
  });
}

// Upgrade an existing connection without rotating its desktop credential.
// Legacy ARM endpoints remain for older clients; automatic connections use
// Disconnect as their only stop control.
export async function enableRadarAutomatic(identity){
  return withLock(K.settingsLock(identity), async () => {
    const settings = await readRadarSettings(identity);
    if(!settings.tokenHash) return { notConnected: true };
    if(!settings.automatic){
      await writeSettings(identity, { ...settings, automatic: true });
      await bumpVersion(identity);
    }
    return { automatic: true };
  });
}

// ---------- entitlement ----------
// PRIVATE OWNER-ONLY DEVELOPMENT LOCK (October 19, 2026).
// This is not a public feature. Neither Free nor paid Pro accounts may
// connect, poll, create tokens or ingest lessons until the owner explicitly
// approves a separate public release. Do not replace this with a license-plan
// check or an environment toggle; the lock must fail closed by default.
// Owner-only pilot, FAIL CLOSED. Scout is open only to a key that passes the
// server-side founder/master check AND whose SHA-256 fingerprint is listed in
// RADAR_VAN_OWNER_SHA256. A missing, empty or malformed fingerprint denies
// everyone; a paid Pro plan or any other founder key never qualifies. Every
// listed fingerprint is compared in constant time.
function privateOwnerAllowed(identity){
  if(!validIdentity(identity) || !isFounderLicenseKey(identity)) return false;
  const configured = String(process.env.RADAR_VAN_OWNER_SHA256 || '').trim().toLowerCase();
  if(!configured) return false;
  const hashes = configured.split(',').map(s => s.trim());
  if(hashes.some(s => !/^[a-f0-9]{64}$/.test(s))) return false;
  const actual = Buffer.from(sha256(identity), 'hex');
  let match = false;
  for(const s of hashes) match = crypto.timingSafeEqual(Buffer.from(s, 'hex'), actual) || match;
  return match;
}
export async function accountEntitlement(identity){
  if(!privateOwnerAllowed(identity)) return { allowed: false, plan: null };
  return { allowed: true, plan: 'pro', founder: true };
}
// Cheap idle poll: reject nonowners before even reading their settings.
// For the master account, only the change counter needs to be read.
export async function peekRadarVersion(identity){
  if(!privateOwnerAllowed(identity)) return { allowed: false, version: null };
  const version = await kv.get(K.version(identity));
  return { allowed: true, version: versionString(version) };
}

// ---------- abuse limiting ----------
export async function radarRateExceeded(scope, value, limit, windowSeconds){
  const count = await incrementWindowCounter('rv:rate:' + scope + ':' + sha256(value), windowSeconds);
  return count > limit;
}
export async function radarRatePeek(scope, value){
  return Number(await kv.get('rv:rate:' + scope + ':' + sha256(value))) || 0;
}

// ---------- lesson validation ----------
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_8601 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/;
// Optional v1 additions (backward compatible; old senders simply omit them):
// endedAt, studentLabel, teacherLabel, fragmentCount, interruptionCount.
const ALLOWED_FIELDS = new Set(['version', 'lessonId', 'title', 'startedAt', 'durationSeconds', 'transcript',
  'endedAt', 'studentLabel', 'teacherLabel', 'fragmentCount', 'interruptionCount']);
const IDENTITY_LIKE_FIELD = /^(user|account|license|licence|identity|email|owner|key|token|app|auth|bearer|secret|password)/i;
const TRANSCRIPT_HEADER = /^\[(\d{2,3}):([0-5]\d)\][ \t]+(TEACHER|STUDENT):[ \t]*\S/;
const EMPTY_TRANSCRIPT_HEADER = /^\[(\d{2,3}):([0-5]\d)\][ \t]+(TEACHER|STUDENT):$/;
// Continuation lines may start with "[" (e.g. "[1] first item") but never look like a header:
// a bracket holding digit+colon is a malformed timestamp; "[..] SPEAKER:" is speaker impersonation.
const TIMESTAMP_LIKE_LINE = /^\[\s*\p{Nd}+\s*[:：]|^\[[^\]]*\p{Nd}[^\]]*[:：][^\]]*\]/u;
const SPEAKER_LIKE_LINE = /^\[[^\]]*\]\s*(?:(?:[Tt][Ee][Aa][Cc][Hh][Ee][Rr]|[Ss][Tt][Uu][Dd][Ee][Nn][Tt])\s*[:：]|[A-Z]{3,}\s*[:：])/;
const CONTROL_CHARS =/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

// Labels are single-line display text: no controls at all, no line/paragraph
// separators and no bidi marks/overrides/isolates that could visually spoof neighbours.
const LABEL_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/;

function parseStartedAt(value){
  if(typeof value !== 'string') return null;
  const m = ISO_8601.exec(value);
  if(!m) return null;
  const [, y, mo, d, h, mi, s, , oh, om] = m;
  const Y = +y, M = +mo, D = +d;
  if(M < 1 || M > 12 || +h > 23 || +mi > 59 || +s > 59) return null;
  if(new Date(Date.UTC(Y, M - 1, D)).getUTCDate() !== D) return null;
  if(oh !== undefined && (+oh > 23 || +om > 59)) return null;
  const ms = Date.parse(value);
  if(!Number.isFinite(ms) || ms < Date.UTC(2020, 0, 1) || ms > Date.now() + 86400000) return null;
  return new Date(ms).toISOString();
}

// Optional display label: undefined -> null; blank -> null; otherwise trimmed text.
function parseLabel(value){
  if(value === undefined) return { value: null };
  if(typeof value !== 'string' || LABEL_FORBIDDEN.test(value)) return { invalid: true };
  const text = value.trim().replace(/ {2,}/g, ' ');
  if(Array.from(text).length > MAX_LABEL_CHARS) return { invalid: true };
  return { value: text || null };
}
function parseCount(value, min, max){
  if(value === undefined) return { value: null };
  if(typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return { invalid: true };
  return { value };
}

// Returns { lesson } with normalised fields, or { error, status }.
export function parseLesson(body){
  const bad = (error, status = 400) => ({ error, status });
  if(!body || typeof body !== 'object' || Array.isArray(body)) return bad('body');
  for(const key of Object.keys(body)){
    if(IDENTITY_LIKE_FIELD.test(key)) return bad('identity');
    if(!ALLOWED_FIELDS.has(key)) return bad('unknown_field');
  }
  if(body.version !== 1) return bad('version');
  if(typeof body.lessonId !== 'string' || !UUID_V4.test(body.lessonId)) return bad('lessonId');
  if(typeof body.title !== 'string' || Array.from(body.title).length > MAX_TITLE_CHARS || CONTROL_CHARS.test(body.title) || /[\r\n]/.test(body.title)) return bad('title');
  let startedAt = null;
  if(body.startedAt !== undefined){
    startedAt = parseStartedAt(body.startedAt);
    if(!startedAt) return bad('startedAt');
  }
  if(typeof body.durationSeconds !== 'number' || !Number.isFinite(body.durationSeconds) || body.durationSeconds < 0 || body.durationSeconds > MAX_DURATION_SECONDS) return bad('durationSeconds');
  const studentLabel = parseLabel(body.studentLabel);
  if(studentLabel.invalid) return bad('studentLabel');
  const teacherLabel = parseLabel(body.teacherLabel);
  if(teacherLabel.invalid) return bad('teacherLabel');
  const fragmentCount = parseCount(body.fragmentCount, 1, MAX_FRAGMENTS);
  if(fragmentCount.invalid) return bad('fragmentCount');
  const interruptionCount = parseCount(body.interruptionCount, 0, MAX_FRAGMENTS - 1);
  if(interruptionCount.invalid) return bad('interruptionCount');
  if(fragmentCount.value !== null && interruptionCount.value !== null && interruptionCount.value >= fragmentCount.value) return bad('interruptionCount');
  // endedAt is the real wall-clock end of the last audio. It is never derived
  // from startedAt + durationSeconds, so it needs a start to be meaningful and
  // may exceed the recorded duration (interruptions) but never be shorter.
  let endedAt = null;
  if(body.endedAt !== undefined){
    endedAt = parseStartedAt(body.endedAt);
    if(!endedAt || !startedAt) return bad('endedAt');
    const elapsed = Date.parse(endedAt) - Date.parse(startedAt);
    if(elapsed < 0 || elapsed > MAX_ELAPSED_MS || body.durationSeconds * 1000 > elapsed + ELAPSED_SLACK_MS) return bad('endedAt');
  }
  if(typeof body.transcript !== 'string') return bad('transcript');
  if(Array.from(body.transcript).length > MAX_TRANSCRIPT_CHARS) return bad('transcript_too_large', 413);
  if(CONTROL_CHARS.test(body.transcript)) return bad('transcript');
  let headers = 0;
  let dropped = false;
  const kept = [];
  for(const raw of body.transcript.split('\n')){
    const line = raw.trim();
    if(!line){ kept.push(raw); continue; }
    if(TRANSCRIPT_HEADER.test(line)){ headers++; kept.push(raw); continue; }
    // A well-formed header whose text is empty (silent / filtered segment) carries nothing: drop it.
    if(EMPTY_TRANSCRIPT_HEADER.test(line)){ dropped = true; continue; }
    if(headers === 0 || TIMESTAMP_LIKE_LINE.test(line) || SPEAKER_LIKE_LINE.test(line)) return bad('transcript');
    kept.push(raw);
  }
  if(headers === 0) return bad('transcript');
  return { lesson: {
    lessonId: body.lessonId.toLowerCase(),
    title: body.title.trim() || 'RADAR VAN lesson',
    startedAt,
    durationSeconds: body.durationSeconds,
    endedAt, studentLabel: studentLabel.value, teacherLabel: teacherLabel.value,
    fragmentCount: fragmentCount.value, interruptionCount: interruptionCount.value,
    transcript: dropped ? kept.join('\n') : body.transcript
  } };
}
// Back-compat helper: error field name or null.
export function validateLesson(body){ const r = parseLesson(body); return r.error || null; }

export function serializedBodyBytes(body){
  if(Buffer.isBuffer(body)) return body.length;
  if(typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  try{ return Buffer.byteLength(JSON.stringify(body === undefined ? null : body), 'utf8'); }
  catch(_err){ return Infinity; }
}

// ---------- queues ----------
function receivedMs(item){ const ms = Date.parse(item && item.receivedAt); return Number.isFinite(ms) ? ms : null; }
function prune(items, nowMs){
  if(!Array.isArray(items)) return [];
  return items.filter(item => item && typeof item.meetingId === 'string' && receivedMs(item) !== null && receivedMs(item) > nowMs - RETENTION_MS);
}
async function readQueue(key, nowMs){
  const raw = await kv.get(key);
  const live = prune(raw, nowMs);
  return { items: live, pruned: Array.isArray(raw) ? raw.length !== live.length : false };
}
async function writeQueue(key, items, nowMs){
  const live = prune(items, nowMs);
  if(!live.length){ await kv.del(key); return live; }
  const newest = Math.max(...live.map(receivedMs));
  await kv.set(key, live, { ex: Math.max(1, Math.ceil((newest + RETENTION_MS - nowMs) / 1000)) });
  return live;
}

function summary(record){
  return {
    meetingId: record.meetingId, lessonId: record.lessonId, title: record.title,
    startedAt: record.startedAt || null, durationSeconds: record.durationSeconds,
    endedAt: record.endedAt || null, studentLabel: scoutStudentLabel(record), teacherLabel: record.teacherLabel || null,
    fragmentCount: Number.isInteger(record.fragmentCount) ? record.fragmentCount : null,
    interruptionCount: Number.isInteger(record.interruptionCount) ? record.interruptionCount : null,
    receivedAt: record.receivedAt, source: 'RADAR VAN', restored: record.restored === true,
    contentPreview: String(record.transcript || '').replace(/\s+/g, ' ').slice(0, 200)
  };
}
function fullRecord(record){
  const { contentPreview, ...rest } = summary(record);
  return { ...rest, transcript: record.transcript };
}
const leased = (item, nowMs) => Number(item.leasedUntil) > nowMs;
const claimed = (item, nowMs) => Number(item.claimedUntil) > nowMs;

// Stores one lesson exactly once. Order matters: the queue is written first,
// the durable seen marker only AFTER the transcript is persisted. If the marker
// cannot be written the queue write is rolled back and the caller must retry,
// so a stored lesson can never become re-creatable after consumption.
//
// The presented token hash is re-verified against the durable settings while
// holding BOTH locks. Lock order is always settings lock -> inbox lock (rotate,
// revoke and ARM only ever take the settings lock), so a rotate/revoke/ARM
// either completes before this commit starts - and the stale bearer is refused
// with { revoked: true } - or waits until the commit has finished.
export async function ingestRadarLesson(identity, lesson, tokenHash, { restore = false } = {}){
  return withLock(K.settingsLock(identity), () => withLock(K.lock(identity), async () => {
    const nowMs = Date.now();
    const iso = new Date(nowMs).toISOString();
    const meetingId = 'rv:' + lesson.lessonId;
    const settings = await readRadarSettings(identity);
    if(!settings.tokenHash || !safeEqualHex(settings.tokenHash, tokenHash)) return { revoked: true };
    const seenKey = K.seen(identity, lesson.lessonId);
    const [seen, pending, matched] = await Promise.all([kv.get(seenKey), readQueue(K.pending(identity), nowMs), readQueue(K.matched(identity), nowMs)]);
    const inMatched = matched.items.some(x => x.meetingId === meetingId);
    const inPending = pending.items.some(x => x.meetingId === meetingId);
    if(restore && !seen && !inMatched && !inPending) return { restoreMissing: true };
    if(restore && !settings.inboxOnly){
      await writeSettings(identity, { ...settings, inboxOnly: true });
      settings.inboxOnly = true;
    }
    if((seen && !restore) || inMatched || inPending){
      const route = seen && seen.route ? seen.route : (inMatched ? 'matched' : 'pending');
      if(!seen) await kv.set(seenKey, { at: iso, route }, { ex: RADAR_VAN_SEEN_TTL_SECONDS });
      // A sender retry after a lost bump repairs it; a spurious bump only costs one full read.
      await bumpVersion(identity);
      return { duplicate: true, matched: route === 'matched' };
    }
    let route = !settings.inboxOnly && (settings.automatic || settings.armed) ? 'matched' : 'pending';
    // A full matched queue falls back to pending (explicit, nothing evicted).
    if(route === 'matched' && matched.items.length >= RADAR_VAN_MAX_ITEMS) route = 'pending';
    const target = route === 'matched' ? matched.items : pending.items;
    if(target.length >= RADAR_VAN_MAX_ITEMS) return { full: true };
    const record = {
      meetingId, lessonId: lesson.lessonId, title: lesson.title, startedAt: lesson.startedAt,
      durationSeconds: lesson.durationSeconds, endedAt: lesson.endedAt || null, studentLabel: lesson.studentLabel || null,
      teacherLabel: lesson.teacherLabel || null, fragmentCount: lesson.fragmentCount ?? null, interruptionCount: lesson.interruptionCount ?? null,
      transcript: lesson.transcript, receivedAt: iso, source: 'RADAR VAN', restored: restore
    };
    const queueKey = route === 'matched' ? K.matched(identity) : K.pending(identity);
    await writeQueue(queueKey, [...target, record], nowMs);
    try{
      await kv.set(seenKey, { at: iso, route }, { ex: RADAR_VAN_SEEN_TTL_SECONDS });
    }catch(err){
      await writeQueue(queueKey, target, nowMs).catch(() => {});
      throw err;
    }
    await kv.set(K.last(identity), iso, { ex: RADAR_VAN_RETENTION_DAYS * 86400 }).catch(() => {});
    await bumpVersion(identity);
    return { duplicate: false, matched: route === 'matched' };
  }, 2000), 2000);
}

// ---------- session reads / inbox mutations ----------
// A read prunes records past the retention window. With lease=true (the browser
// says it can apply a transcript right now) the oldest unleased matched record
// is leased for RADAR_VAN_LEASE_MS and returned in full; without it matched is
// never handed out, so a busy tab cannot burn delivery attempts.
export async function readRadarSession(identity, { lease = false } = {}){
  let dirty = false, changed = false;
  const view = async (write) => {
    const version = await readVersion(identity);
    const nowMs = Date.now();
    const settings = await readRadarSettings(identity);
    const pending = await readQueue(K.pending(identity), nowMs);
    const matched = await readQueue(K.matched(identity), nowMs);
    let delivered = null, dirtyPending = pending.pruned, dirtyMatched = matched.pruned;
    // Automatic clients need only a connection. Legacy clients retain their
    // ARM contract during rollout. Disconnect keeps queued lessons untouched.
    const deliverable = !!settings.tokenHash && !settings.inboxOnly && (settings.automatic || settings.armed);
    if(write && lease && deliverable){
      const candidates = settings.automatic
        ? [...matched.items, ...pending.items].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))
        : [...matched.items];
      for(const item of candidates){
        if(pending.items.includes(item)){
          // Old disarmed uploads and overflow are imported automatically too.
          // The same pending-claim lease/ACK contract protects competing tabs.
          if(claimed(item, nowMs) || (item.claimCount || 0) >= MAX_MATCHED_DELIVERIES) continue;
          item.claimedUntil = nowMs + RADAR_VAN_LEASE_MS;
          item.claimCount = (item.claimCount || 0) + 1;
          delivered = fullRecord(item);
          dirtyPending = true;
          break;
        }
        if(leased(item, nowMs)) continue;
        if((item.deliveryCount || 0) >= MAX_MATCHED_DELIVERIES){
          // Never acknowledged after repeated deliveries: move it, explicitly,
          // to pending so it can never block the slot or vanish.
          if(pending.items.length < RADAR_VAN_MAX_ITEMS){
            matched.items.splice(matched.items.indexOf(item), 1);
            const { leasedUntil, deliveryCount, ...rest } = item;
            pending.items.push(rest);
            dirtyPending = dirtyMatched = true;
          }
          continue;
        }
        item.leasedUntil = nowMs + RADAR_VAN_LEASE_MS;
        item.deliveryCount = (item.deliveryCount || 0) + 1;
        delivered = fullRecord(item);
        dirtyMatched = true;
        break;
      }
    }
    dirty = dirtyPending || dirtyMatched;
    // A lease alone changes nothing a view shows; pruning or moving records does.
    changed = dirtyPending || matched.pruned;
    if(write){
      if(dirtyMatched) await writeQueue(K.matched(identity), matched.items, nowMs);
      if(dirtyPending) await writeQueue(K.pending(identity), pending.items, nowMs);
    }
    const visible = pending.items.filter(x => !claimed(x, nowMs))
      .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)).map(summary);
    // Owner-facing pending inbox presents Scout matched + pending records
    // together. Legacy auto-lease consumers retain the original fields.
    // A record leased to a tab that is importing it right now is not shown.
    const inboxPending = [...visible, ...matched.items.filter(x => !leased(x, nowMs)).map(summary)]
      .sort((a,b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
    const lastReceivedAt = await kv.get(K.last(identity)).catch(() => null);
    return {
      enabled: true, connected: !!settings.tokenHash, armed: !!settings.tokenHash && (settings.automatic || settings.armed),
      automatic: !!settings.tokenHash && settings.automatic,
      inboxOnly: settings.inboxOnly === true,
      teacherDisplayName: settings.teacherDisplayName || null,
      pending: visible, pendingCount: visible.length, inboxPending, matched: delivered, matchedCount: matched.items.length,
      waitingCount: pending.items.length + matched.items.length,
      lastReceivedAt: lastReceivedAt || null, retentionDays: RADAR_VAN_RETENTION_DAYS, version
    };
  };
  // Leasing needs both locks, so first check without them that there is
  // anything to lease. Not connected/armed or an empty matched queue means a
  // plain read; the locked view re-checks everything, so this only saves work.
  if(lease){
    const settings = await readRadarSettings(identity);
    lease = !!settings.tokenHash && !settings.inboxOnly && (settings.automatic || settings.armed) && (
      (await readQueue(K.matched(identity), Date.now())).items.length > 0 ||
      (settings.automatic && (await readQueue(K.pending(identity), Date.now())).items.length > 0));
  }
  // Lease takes the settings lock first (same order as ingest) so a DISARM or
  // DISCONNECT that has returned can never be followed by a lease.
  if(lease){
    const state = await withLock(K.settingsLock(identity), () => withLock(K.lock(identity), () => view(true)));
    if(changed) await bumpVersion(identity);
    return state;
  }
  const state = await view(false);
  // Persist the retention prune when this read found expired records. Best
  // effort only: if the inbox is busy the pruned view is still what is returned.
  if(dirty) await withLock(K.lock(identity), async () => { await view(true); if(changed) await bumpVersion(identity); }, 0).catch(() => {});
  return state;
}

export async function radarInboxAction(identity, action, meetingId){
  const out = await inboxAction(identity, action, meetingId);
  if(out.claimed || out.dismissed || out.acked) await bumpVersion(identity);
  return out;
}
async function inboxAction(identity, action, meetingId){
  return withLock(K.lock(identity), async () => {
    const nowMs = Date.now();
    const pending = await readQueue(K.pending(identity), nowMs);
    const matched = await readQueue(K.matched(identity), nowMs);
    if(action === 'claim'){
      const pendingItem = pending.items.find(x => x.meetingId === meetingId);
      const matchedItem = matched.items.find(x => x.meetingId === meetingId);
      const item = pendingItem || matchedItem;
      if(!item) return { missing: true };
      if((pendingItem && claimed(item, nowMs)) || (matchedItem && leased(item, nowMs)))
        return { conflict: true };
      if(pendingItem){
        item.claimedUntil = nowMs + RADAR_VAN_LEASE_MS;
        item.claimCount = (item.claimCount || 0) + 1;
        await writeQueue(K.pending(identity), pending.items, nowMs);
      }else{
        item.leasedUntil = nowMs + RADAR_VAN_LEASE_MS;
        item.deliveryCount = (item.deliveryCount || 0) + 1;
        await writeQueue(K.matched(identity), matched.items, nowMs);
      }
      return { claimed: fullRecord(item) };
    }
    if(action === 'dismiss'){
      const next = pending.items.filter(x => x.meetingId !== meetingId);
      const nextMatched = matched.items.filter(x => x.meetingId !== meetingId);
      if(next.length !== pending.items.length || pending.pruned)
        await writeQueue(K.pending(identity), next, nowMs);
      if(nextMatched.length !== matched.items.length || matched.pruned)
        await writeQueue(K.matched(identity), nextMatched, nowMs);
      return { dismissed: next.length !== pending.items.length || nextMatched.length !== matched.items.length };
    }
    if(action === 'ack-matched'){
      // Finalises a matched delivery or a claimed pending import. An
      // unclaimed pending record is never removed by an acknowledgement.
      const nextMatched = matched.items.filter(x => x.meetingId !== meetingId);
      const nextPending = pending.items.filter(x => x.meetingId !== meetingId || !(x.claimCount > 0));
      const acked = nextMatched.length !== matched.items.length || nextPending.length !== pending.items.length;
      if(nextMatched.length !== matched.items.length || matched.pruned) await writeQueue(K.matched(identity), nextMatched, nowMs);
      if(nextPending.length !== pending.items.length || pending.pruned) await writeQueue(K.pending(identity), nextPending, nowMs);
      return { acked };
    }
    return { unknown: true };
  });
}
