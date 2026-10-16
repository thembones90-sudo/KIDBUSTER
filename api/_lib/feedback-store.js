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
import { kv } from './kv-client.js';

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
