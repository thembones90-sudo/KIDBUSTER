// Feedback intelligence store.
//
// Every delivered report gets a short random reference plus a small,
// content-free telemetry record (protocol, settings, model, repair outcome,
// advisory count, latency, length). When a teacher rates or reports on that
// report, the feedback is joined to the telemetry ON THE SERVER, so the owner
// can see which protocol/model/settings produce low scores or bugs, and the
// browser cannot fake those facts.
//
// Privacy: no lesson notes, transcript, report text, student name or license
// key is stored here. The account is a one-way hash prefix. Only the teacher's
// own optional comment is free text (capped). Records expire after 180 days.
import { createHash, randomBytes } from 'node:crypto';
import { kv, compareAndSetValue, releasePaymentLock, reserveBoundedCounter, releaseBoundedCounter } from './kv-client.js';

export const FEEDBACK_TTL_SECONDS = 180 * 24 * 60 * 60;
export const FEEDBACK_CATEGORIES = ['quality', 'bug', 'idea'];
const SEQ_KEY = 'fb:seq';
const itemKey = n => 'fb:item:' + n;
const genKey = ref => 'fb:gen:' + ref;
const REF_PATTERN = /^[a-f0-9]{16}$/;

export function accountTag(licenseKey){
  if(!licenseKey) return '';
  return createHash('sha256').update('pathfinder-feedback:' + String(licenseKey).trim()).digest('hex').slice(0, 12);
}

function clip(value, max){ return String(value ?? '').slice(0, max); }

// Called after a report is committed. Never throws: telemetry must not
// affect delivery. Returns the reference, or null if it could not be stored.
export async function recordGenerationTelemetry({ licenseKey, form, model, repair, advisory, latencyMs, outputChars }){
  try{
    const ref = randomBytes(8).toString('hex');
    const record = {
      at: new Date().toISOString(),
      account: accountTag(licenseKey),
      protocol: clip(form?.protocol, 20),
      ratingTier: clip(form?.rating, 30),
      lengthFormat: clip(form?.lengthFormat, 20),
      preplyModule: form?.protocol === 'PREPLY' ? clip(form?.preplyModule, 20) : '',
      model: clip(model, 60),
      repairOutcome: clip(repair?.outcome, 30),
      advisoryCount: Array.isArray(advisory) ? advisory.length : 0,
      advisory: (Array.isArray(advisory) ? advisory : []).slice(0, 5).map(a => clip(a, 160)),
      latencyMs: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
      outputChars: Number.isFinite(outputChars) ? outputChars : null
    };
    await kv.set(genKey(ref), record, { ex: FEEDBACK_TTL_SECONDS });
    return ref;
  }catch(err){
    console.error('feedback-store: telemetry not recorded:', err?.message || err);
    return null;
  }
}

// Stores one feedback item. The generation telemetry is attached only when
// the reference exists AND belongs to the same account.
export async function recordFeedback({ licenseKey, generationRef, category, score, comment, teacherName, clientContext }){
  const account = accountTag(licenseKey);
  let generation = null;
  if(typeof generationRef === 'string' && REF_PATTERN.test(generationRef)){
    const meta = await kv.get(genKey(generationRef));
    if(meta && (!meta.account || meta.account === account)) generation = { ref: generationRef, ...meta };
  }
  const n = await kv.incr(SEQ_KEY);
  const item = {
    id: n,
    at: new Date().toISOString(),
    account,
    category,
    score: score ?? null,
    comment: clip(comment, 1000),
    teacherName: clip(teacherName, 100),
    // What the browser said it was looking at; trusted facts are in `generation`.
    client: {
      protocol: clip(clientContext?.protocol, 20),
      ratingTier: clip(clientContext?.ratingTier, 30),
      preplyModule: clip(clientContext?.preplyModule, 30),
      preplyTrialPerson: clip(clientContext?.preplyTrialPerson, 30)
    },
    generation
  };
  await kv.set(itemKey(n), item, { ex: FEEDBACK_TTL_SECONDS });
  return item;
}

export async function listFeedback({ limit = 200 } = {}){
  const max = Math.max(1, Math.min(500, Number(limit) || 200));
  const latest = Number(await kv.get(SEQ_KEY)) || 0;
  const ids = [];
  for(let n = latest; n >= 1 && ids.length < max; n--) ids.push(n);
  const items = [];
  for(let i = 0; i < ids.length; i += 50){
    const batch = await Promise.all(ids.slice(i, i + 50).map(n => kv.get(itemKey(n))));
    for(const item of batch) if(item) items.push(item);
  }
  return items;
}

// ---------- private testimonial proposals ----------
// A teacher may OPTIONALLY offer a short story after sending feedback. This is
// a private proposal for the owner to review, never permission to publish:
// publication needs separately approved exact wording, attribution and
// website consent (TESTIMONIALS-GUIDE-20261102.md), and only the owner edits
// the public assets/testimonials/testimonials.json. Proposals are never
// mirrored to the Google Sheet or any other third party, are readable only
// through the owner-authorized GET /api/feedback, and expire like feedback.
export const TESTIMONIAL_STORY_MAX = 800;
export const TESTIMONIAL_DAILY_LIMIT = 3;
const TP_SEQ_KEY = 'tp:seq';
const tpItemKey = n => 'tp:item:' + n;
const tpIdemKey = (account, id) => 'tp:idem:' + account + ':' + id;
const tpRateKey = (account, day) => 'tp:rate:' + account + ':' + day;
// One story per account (owner decision 2026-11-02). Holds only the one-way
// account tag and the stored proposal id, so it carries no personal data and
// is kept without expiry: a teacher who shared a story is never asked again.
const tpDoneKey = account => 'tp:done:' + account;
const PROPOSAL_ID = /^[a-f0-9]{16}$/;
// Contact details must not travel inside a story that might later be quoted.
// (Mentioning classbuster.com itself is fine; nine or more digits is a phone.)
const CONTACT_PATTERN = /[^\s@]+@[^\s@]+\.[a-z]{2,}|https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|cn|edu|co)\b|(?:\+?\d[\s().-]?){9,}/i;
const hasContactDetails = text => CONTACT_PATTERN.test(String(text).replace(/\bclassbuster\.com\b/gi, 'Classbuster'));
// Control and bidirectional-override characters are refused outright.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;

function cleanLine(value, max){
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function validateTestimonialProposal(body){
  const b = body && typeof body === 'object' ? body : {};
  const proposalId = String(b.proposalId || '');
  if(!PROPOSAL_ID.test(proposalId)) return { error: 'Invalid proposal reference' };
  const story = String(b.story ?? '').replace(/\r\n?/g, '\n').trim();
  if(story.length < 10) return { error: 'Please write a sentence or two' };
  if(story.length > TESTIMONIAL_STORY_MAX) return { error: 'Please keep your story under ' + TESTIMONIAL_STORY_MAX + ' characters' };
  const displayName = cleanLine(b.displayName, 40);
  const role = cleanLine(b.role, 60);
  for(const text of [story, displayName, role]){
    if(UNSAFE_CHARS.test(text)) return { error: 'Please remove unusual characters' };
    if(hasContactDetails(text)) return { error: 'Please leave out email addresses, links and phone numbers' };
  }
  if(b.contactOk !== true) return { error: 'Please confirm we may ask you before anything is published' };
  const feedbackId = Number.isSafeInteger(b.feedbackId) && b.feedbackId > 0 ? b.feedbackId : null;
  return { value: { proposalId, story, displayName, role, feedbackId } };
}

// Idempotency claim states stored under tp:idem:<account>:<proposalId>:
//   'pending:<token>'  one worker is storing it right now. The claim has a
//                      SHORT expiry, so a crashed worker's claim recovers on
//                      its own; only the token holder can commit or release.
//   'stored:<n>'       the record tp:item:<n> was written (180-day expiry).
// Compatibility with the first, unreleased c12ac39 format: a bare number is a
// stored id, and a bare 'pending' (written with a 180-day expiry and no
// token, so it could never recover) is atomically taken over.
export const TESTIMONIAL_CLAIM_TTL_SECONDS = 60;
const LEGACY_PENDING = 'pending';
const STORED_PREFIX = 'stored:';

function storedIdOf(value){
  if(typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if(typeof value === 'string'){
    const m = /^(?:stored:)?([1-9][0-9]{0,15})$/.exec(value);
    if(m && Number.isSafeInteger(Number(m[1]))) return Number(m[1]);
  }
  return null;
}

async function claimProposal(idemKey, marker){
  const reply = await kv.set(idemKey, marker, { nx: true, ex: TESTIMONIAL_CLAIM_TTL_SECONDS });
  return reply === 'OK' || reply === true;
}

// Stores one proposal for the authenticated account. Idempotent per
// (account, proposalId): a retried or double-clicked submission returns the
// original record instead of creating a second one. While another request
// for the same proposal is still storing it, the result is { inProgress }
// (retryable) - never a success without a stored record id. `contactEmail`
// is taken from the server-side license record, never from the browser.
export async function recordTestimonialProposal({ licenseKey, proposal, contactEmail }){
  const account = accountTag(licenseKey);
  const idemKey = tpIdemKey(account, proposal.proposalId);
  const marker = 'pending:' + randomBytes(12).toString('hex');
  let owned = await claimProposal(idemKey, marker);
  if(!owned){
    const existing = await kv.get(idemKey);
    const storedId = storedIdOf(existing);
    if(storedId) return { duplicate: true, id: storedId };
    if(existing === null || existing === undefined){
      // The other claim expired or was released between our two reads.
      owned = await claimProposal(idemKey, marker);
    }else if(existing === LEGACY_PENDING){
      owned = await compareAndSetValue(idemKey, LEGACY_PENDING, marker, TESTIMONIAL_CLAIM_TTL_SECONDS);
    }
    if(!owned) return { inProgress: true };
  }
  // A different proposal from an account that already shared its story.
  let done = null;
  try{ done = await kv.get(tpDoneKey(account)); }
  catch(err){ await releasePaymentLock(idemKey, marker).catch(() => {}); throw err; }
  if(storedIdOf(done)){
    try{ await releasePaymentLock(idemKey, marker); }catch(_e){ /* expires within the claim TTL */ }
    return { alreadySubmitted: true, id: storedIdOf(done) };
  }
  let rateKey = null, n = null, committed = false;
  const releaseRate = async () => {
    if(!rateKey) return;
    const key = rateKey; rateKey = null;
    try{ await releaseBoundedCounter(key); }catch(_e){ /* best effort */ }
  };
  try{
    const dayKey = tpRateKey(account, new Date().toISOString().slice(0, 10));
    // Atomic: concurrent workers cannot all pass a read-then-increment gap.
    if(await reserveBoundedCounter(dayKey, TESTIMONIAL_DAILY_LIMIT, 2 * 24 * 60 * 60) === null){
      await releasePaymentLock(idemKey, marker);
      return { limited: true };
    }
    rateKey = dayKey;
    let linkedFeedback = null;
    if(proposal.feedbackId){
      const fb = await kv.get(itemKey(proposal.feedbackId));
      if(fb && fb.account === account) linkedFeedback = proposal.feedbackId;
    }
    n = await kv.incr(TP_SEQ_KEY);
    const item = {
      id: n,
      at: new Date().toISOString(),
      // Never 'approved': approval happens outside this system, per quote.
      status: 'received_private',
      publishable: false,
      account,
      story: proposal.story,
      displayName: proposal.displayName,
      role: proposal.role,
      contactOk: true,
      contactEmail: clip(contactEmail, 254),
      feedbackId: linkedFeedback
    };
    // The record is written BEFORE the claim says 'stored', so a duplicate
    // answer always refers to a record that exists.
    await kv.set(tpItemKey(n), item, { ex: FEEDBACK_TTL_SECONDS });
    committed = await compareAndSetValue(idemKey, marker, STORED_PREFIX + n, FEEDBACK_TTL_SECONDS);
    if(!committed){
      // Our claim expired (a very slow worker) and another request may now
      // own this proposal. Withdraw our copy so only one record survives.
      try{ await kv.del(tpItemKey(n)); }catch(_e){ /* best effort */ }
      await releaseRate();
      const now = await kv.get(idemKey);
      const storedId = storedIdOf(now);
      return storedId ? { duplicate: true, id: storedId } : { inProgress: true };
    }
    // Best effort: the story is already stored. The browser also remembers it,
    // and the owner sees every proposal, so a failed marker costs at most one
    // extra invitation on another device.
    try{ await kv.set(tpDoneKey(account), n); }
    catch(err){ console.error('testimonial done marker failed:', (err && err.name) || 'error'); }
    return { id: n, item };
  }catch(err){
    // Never report success. Release only OUR claim (token-guarded), so a
    // newer claim or a committed 'stored:<n>' is never deleted. The record,
    // if it was written, is kept: the commit may have succeeded remotely and
    // losing a teacher's story is worse than a rare duplicate.
    if(!committed){
      await releaseRate();
      try{ await releasePaymentLock(idemKey, marker); }catch(_e){ /* expires within the claim TTL */ }
    }
    throw err;
  }
}

// Whether this account already shared its one story (one GET).
export async function hasSubmittedTestimonial(licenseKey){
  return !!storedIdOf(await kv.get(tpDoneKey(accountTag(licenseKey))));
}

// Proposal ids come from one monotonic sequence (tp:seq), so the newest
// proposals are always tp:item:<seq> downwards - the sequence is the index.
// Reads use ONE MGET per chunk of up to 100 keys: listing 100 proposals costs
// two Redis commands (GET + MGET), never one GET per proposal. The scan is
// bounded to `max` ids plus one extra chunk to step over rare gaps (a write
// that failed after allocating an id). Older proposals are untouched and stay
// stored until their own 180-day expiry; they are simply not in this window.
export const TESTIMONIAL_LIST_MAX = 200;
const TP_READ_CHUNK = 100;

async function readMany(keys){
  if(typeof kv.mget === 'function') return kv.mget(...keys);
  // Compatibility fallback for an adapter without MGET: small bounded groups.
  const out = [];
  for(let i = 0; i < keys.length; i += 10) out.push(...await Promise.all(keys.slice(i, i + 10).map(k => kv.get(k))));
  return out;
}

export async function listTestimonialProposals({ limit = 100 } = {}){
  const max = Math.max(1, Math.min(TESTIMONIAL_LIST_MAX, Math.floor(Number(limit)) || 100));
  const seq = Number(await kv.get(TP_SEQ_KEY));
  const latest = Number.isSafeInteger(seq) && seq > 0 ? seq : 0;
  const floor = Math.max(1, latest - (max + TP_READ_CHUNK) + 1);
  const items = [];
  let next = latest;
  while(next >= floor && items.length < max){
    const size = Math.min(TP_READ_CHUNK, next - floor + 1, items.length === 0 ? max : TP_READ_CHUNK);
    const ids = Array.from({ length: size }, (_v, i) => next - i);
    const values = await readMany(ids.map(tpItemKey));
    for(const value of values || []){
      if(items.length >= max) break;
      if(value && typeof value === 'object' && Number.isSafeInteger(value.id)) items.push(value);
    }
    next -= size;
  }
  return items;
}

function bucket(map, key, item){
  const k = key || 'unknown';
  const b = map[k] || (map[k] = { count: 0, rated: 0, scoreSum: 0, bugs: 0, ideas: 0, low: 0 });
  b.count++;
  if(item.category === 'bug') b.bugs++;
  if(item.category === 'idea') b.ideas++;
  if(Number.isInteger(item.score)){
    b.rated++; b.scoreSum += item.score;
    if(item.score <= 2) b.low++;
  }
  return b;
}
function finish(map){
  const out = {};
  for(const [k, b] of Object.entries(map)){
    out[k] = { count: b.count, rated: b.rated, avgScore: b.rated ? Math.round(b.scoreSum / b.rated * 100) / 100 : null, low: b.low, bugs: b.bugs, ideas: b.ideas };
  }
  return out;
}

// Owner view: where scores are low, what breaks, what teachers ask for.
export function summarizeFeedback(items){
  const overall = {}, byProtocol = {}, byModel = {}, byRepair = {}, byLength = {}, byTeacher = {};
  const accounts = new Set();
  for(const item of items){
    const g = item.generation || {};
    bucket(overall, 'all', item);
    bucket(byProtocol, g.protocol || item.client?.protocol, item);
    bucket(byModel, g.model, item);
    bucket(byRepair, g.repairOutcome, item);
    bucket(byLength, g.lengthFormat, item);
    bucket(byTeacher, item.teacherName, item);
    if(item.account) accounts.add(item.account);
  }
  const pick = it => ({ id: it.id, at: it.at, category: it.category, score: it.score, comment: it.comment, teacherName: it.teacherName,
    protocol: it.generation?.protocol || it.client?.protocol || '', model: it.generation?.model || '', repairOutcome: it.generation?.repairOutcome || '',
    advisory: it.generation?.advisory || [], linked: !!it.generation });
  return {
    total: items.length,
    accounts: accounts.size,
    linkedToReport: items.filter(i => i.generation).length,
    overall: finish(overall).all || null,
    byProtocol: finish(byProtocol),
    byModel: finish(byModel),
    byRepairOutcome: finish(byRepair),
    byLength: finish(byLength),
    byTeacher: finish(byTeacher),
    lowScores: items.filter(i => Number.isInteger(i.score) && i.score <= 2).map(pick),
    bugs: items.filter(i => i.category === 'bug').map(pick),
    ideas: items.filter(i => i.category === 'idea').map(pick)
  };
}
