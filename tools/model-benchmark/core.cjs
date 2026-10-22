'use strict';
// Pathfinder V2 model benchmark — pure logic. No network or filesystem access
// here except through injected functions, so every rule is unit-testable.
const crypto = require('node:crypto');
const path = require('node:path');
const { extractBuildCacheableSystemBlocks } = require('../../tests/helpers/extract-generate-helpers.cjs');
const C = require('./config.cjs');
const { CASES } = require('../generation-quality-cases.cjs');
const { CASES: COMPREHENSION_CASES } = require('../comprehension-cases.cjs');

// The production function, loaded verbatim from api/generate.js.
const { buildCacheableSystemBlocks } = extractBuildCacheableSystemBlocks();

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

// ---------- requests ----------
function buildRequestBody({ model, systemPrompt, messages, profile }){
  const p = C.PROFILES[profile || 'production'];
  if(!p) throw new Error('Unknown request profile');
  if(!C.MODELS[model]) throw new Error('Model is not in the benchmark allow-list: ' + model);
  return { model, max_tokens:(p.maxTokensByModel && p.maxTokensByModel[model]) || p.maxTokens, ...p.extra, ...((p.extraByModel && p.extraByModel[model]) || {}),
    system:buildCacheableSystemBlocks(systemPrompt), messages };
}

// ---------- cost ----------
function costUsd(usage, model){
  const m = C.MODELS[model];
  if(!m || !usage) return 0;
  const n = k => (typeof usage[k] === 'number' ? usage[k] : 0);
  return (n('input_tokens') * m.input + n('output_tokens') * m.output +
    n('cache_creation_input_tokens') * m.cacheWrite + n('cache_read_input_tokens') * m.cacheRead) / 1e6;
}
function addUsage(a, b){
  if(!b) return a || null;
  const out = { ...(a || {}) };
  for(const [k, v] of Object.entries(b)) if(typeof v === 'number') out[k] = (typeof out[k] === 'number' ? out[k] : 0) + v;
  return out;
}

// ---------- plan ----------
function transcriptSpec(id, readPrivate){
  const t = C.TRANSCRIPTS[id];
  if(!t) throw new Error('Unknown transcript ' + id);
  if(t.kind === 'private'){
    const notes = readPrivate(t.path);
    const prefix = sha(notes).slice(0, 16);
    if(t.expectedSha256Prefix && prefix !== t.expectedSha256Prefix) throw new Error('Private transcript hash mismatch for ' + id + ' (got ' + prefix + ')');
    const side = JSON.parse(readPrivate(t.settingsPath));
    if(!side.settings || !side.ratings) throw new Error('Private settings file is incomplete for ' + id);
    return { id, kind:'private', notes, sha256Prefix:prefix, settings:side.settings, rating:p => side.ratings[p] ?? '', groundTruth:side.groundTruth || null,
      names:[side.settings.studentName, side.settings.teacherName] };
  }
  if(t.kind === 'comprehension'){
    const c = COMPREHENSION_CASES[t.caseId];
    if(!c) throw new Error('Unknown comprehension case ' + t.caseId);
    const r = c.ratings || {};
    return { id, kind:'fictional', notes:c.transcript, sha256Prefix:sha(c.transcript).slice(0, 16), protocols:c.protocols, groundTruth:c,
      settings:{ teacherName:c.teacher, studentName:c.student, remarks:'', lengthFormat:'medium', studentGender:c.gender || 'boy',
        signoffEmoji:'', blitzVoice:'warm', preplyModule:c.preplyModule || 'adult', preplyTrialPerson:'adult' },
      rating:p => p === 'PREPLY' ? '' : p === 'BEIDA' ? (r.BEIDA || 'excellent') : p === 'OF' ? (r.OF || 'Medium') : (r.numeric || '4'),
      names:[c.student, c.teacher] };
  }
  const c = CASES[t.caseId];
  const ratingFor = p => p === 'PREPLY' ? '' : p === 'BEIDA' ? c.ratings.BEIDA : p === 'OF' ? c.ratings.OF : c.ratings.numeric;
  const gender = { Sam:'boy', Ava:'girl', Kai:'boy', Lily:'girl', Ben:'boy' }[c.student] || 'boy';
  return { id, kind:'fictional', notes:c.transcript, sha256Prefix:sha(c.transcript).slice(0, 16),
    settings:{ teacherName:c.teacher, studentName:c.student, remarks:'', lengthFormat:'medium', studentGender:gender,
      signoffEmoji:'', blitzVoice:'warm', preplyModule:'parent', preplyTrialPerson:'child' }, rating:ratingFor, names:[c.student, c.teacher] };
}

// Builds each prompt ONCE per transcript x protocol x repetition and shares it
// across models: Blitz's random style model and Classic's random style variant
// would otherwise give each model a different prompt.
// Blitz (shuffle-bag style model) and Classic (style variant) use Math.random
// when a prompt is built. Plans must be reproducible so an approval code keeps
// matching: prompts are built under a seeded generator with a fresh protocol
// core, then the real Math.random is restored.
function seededRandom(seed){
  let x = parseInt(sha('plan:' + seed).slice(0, 8), 16) || 1;
  return () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
}
function planJobs(opts){
  const realRandom = Math.random;
  if(opts.resetCore) opts.resetCore();
  Math.random = seededRandom(opts.phase);
  try{ return buildPlan(opts); }
  finally{ Math.random = realRandom; if(opts.resetCore) opts.resetCore(); }
}
function buildPlan({ phase, buildServerGeneration, readPrivate, models }){
  const ph = C.PHASES[phase];
  if(!ph) throw new Error('Unknown phase ' + phase);
  const modelIds = models || Object.keys(C.MODELS);
  const prompts = [], jobs = [];
  for(const tid of ph.transcripts){
    const t = transcriptSpec(tid, readPrivate);
    // A phase or case may limit protocols (e.g. adult conversation -> Preply only).
    const protocols = ph.protocols || t.protocols || C.PROTOCOLS;
    for(const protocol of protocols){
      for(let rep = 1; rep <= ph.repetitions; rep++){
        const generation = { protocol, notes:t.notes, rating:t.rating(protocol), ...t.settings };
        const built = buildServerGeneration(generation);
        const promptId = tid + '__' + protocol + '__r' + rep;
        prompts.push({ promptId, transcript:tid, transcriptKind:t.kind, protocol, rep, form:built.form, systemPrompt:built.systemPrompt,
          userMessage:built.userMessage, promptSha256:sha(built.systemPrompt + '\n' + built.userMessage), names:t.names,
          ...(t.kind === 'private' && t.groundTruth ? { groundTruth:t.groundTruth } : {}) });
        for(const model of modelIds) jobs.push({ jobId:promptId + '__' + model, promptId, model, protocol, transcript:tid, rep });
      }
    }
  }
  return { phase, prompts, jobs };
}

function estimate(plan){
  const byPrompt = Object.fromEntries(plan.prompts.map(p => [p.promptId, p]));
  let upper = 0, lower = 0;
  const perModel = {};
  for(const job of plan.jobs){
    const p = byPrompt[job.promptId], m = C.MODELS[job.model];
    const sysTok = p.systemPrompt.length / C.CHARS_PER_TOKEN, userTok = p.userMessage.length / C.CHARS_PER_TOKEN;
    const f = C.TOKENIZER_UPPER_FACTOR[job.model] || 1;
    const outTok = (C.BASELINE_OUTPUT_TOKENS[job.protocol] + C.ASSUMED_THINKING_TOKENS[job.model]) * f;
    // Upper: no cache reads, the whole system prompt written at the cache-write
    // rate on every call, tokenizer allowance, thinking allowance, 25% repairs.
    const callUpper = ((sysTok * m.cacheWrite + userTok * m.input) * f + outTok * m.output) / 1e6;
    const callLower = (sysTok * m.cacheRead + userTok * m.input + C.BASELINE_OUTPUT_TOKENS[job.protocol] * m.output) / 1e6;
    const repairUpper = C.ASSUMED_REPAIR_RATE * ((sysTok * m.cacheRead + outTok * 1.2 * m.input + outTok * m.output) / 1e6);
    perModel[job.model] = (perModel[job.model] || 0) + callUpper + repairUpper;
    upper += callUpper + repairUpper; lower += callLower;
  }
  return { reports:plan.jobs.length, maxProviderCalls:plan.jobs.length * 2, upperUsd:upper, lowerUsd:lower, perModelUpperUsd:perModel,
    assumptions:{ charsPerToken:C.CHARS_PER_TOKEN, tokenizerUpperFactor:C.TOKENIZER_UPPER_FACTOR, repairRate:C.ASSUMED_REPAIR_RATE, thinkingTokens:C.ASSUMED_THINKING_TOKENS, pricing:C.PRICING_SOURCE } };
}

function approvalCode(plan, est, profile, commit){
  return sha(JSON.stringify({ commit, profile, phase:plan.phase, jobs:plan.jobs.map(j => j.jobId),
    prompts:plan.prompts.map(p => p.promptSha256), upper:Math.round(est.upperUsd * 100) })).slice(0, 10);
}

// ---------- live gate ----------
function liveGate({ env, approve, expectedCode, maxSpendUsd, est }){
  if(env.PATHFINDER_EVAL_ALLOW_LIVE !== 'YES') throw new Error('LIVE_BLOCKED: set PATHFINDER_EVAL_ALLOW_LIVE=YES explicitly');
  if(env.ANTHROPIC_API_KEY) throw new Error('LIVE_BLOCKED: production ANTHROPIC_API_KEY must not be present in the benchmark environment');
  if(!approve) throw new Error('LIVE_BLOCKED: --approve <code> from the reviewed plan is required');
  if(approve !== expectedCode) throw new Error('LIVE_BLOCKED: approval code does not match the current plan (prompts, jobs, profile or estimate changed)');
  if(!(maxSpendUsd > 0)) throw new Error('LIVE_BLOCKED: --max-spend-usd is required');
  if(est.upperUsd > maxSpendUsd) throw new Error('LIVE_BLOCKED: estimated upper bound $' + est.upperUsd.toFixed(2) + ' exceeds --max-spend-usd ' + maxSpendUsd);
  return true;
}

// ---------- pipeline (mirrors api/generate.js; tests pin the equivalence) ----------
function providerText(data){
  if(!Array.isArray(data && data.content)) return null;
  return data.content.map(b => (b && b.type !== 'thinking' && b.text) || '').join('').trim() || null;
}
const wordCount = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;

async function callProvider({ fetchImpl, apiKey, body, timeoutMs, now }){
  const started = now();
  const controller = new AbortController();
  let timer;
  try{
    const result = await Promise.race([
      (async () => {
        const res = await fetchImpl('https://api.anthropic.com/v1/messages', { method:'POST', signal:controller.signal,
          headers:{ 'Content-Type':'application/json', 'x-api-key':apiKey, 'anthropic-version':'2023-06-01' }, body:JSON.stringify(body) });
        let data = null; try{ data = await res.json(); }catch{ /* recorded as malformed */ }
        return { ok:res.ok, status:res.status, data };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('timeout'), { name:'ProviderTimeoutError' })); }, Math.max(1, timeoutMs)); })
    ]);
    return { ...result, latencyMs:now() - started };
  }catch(err){
    return { ok:false, status:null, data:null, error:err.name === 'ProviderTimeoutError' ? 'timeout' : 'network', latencyMs:now() - started };
  }finally{ clearTimeout(timer); }
}

function classify(call){
  if(!call.ok) return call.error || ('http_' + call.status);
  if(call.data && call.data.stop_reason === 'refusal') return 'refusal';
  if(call.data && (call.data.stop_reason === 'max_tokens' || call.data.stop_reason === 'model_context_window_exceeded')) return 'truncated';
  if(!providerText(call.data)) return 'empty';
  return 'ok';
}

async function runJob({ job, prompt, profile, fetchImpl, apiKey, evaluateGeneratedOutput, buildRepairMessage, now = Date.now }){
  const p = C.PROFILES[profile || 'production'];
  const deadline = now() + p.generationBudgetMs;
  const calls = [];
  const record = { jobId:job.jobId, model:job.model, protocol:job.protocol, transcript:job.transcript, rep:job.rep, promptSha256:prompt.promptSha256, profile:profile || 'production' };
  const body1 = buildRequestBody({ model:job.model, systemPrompt:prompt.systemPrompt, messages:[{ role:'user', content:prompt.userMessage }], profile });
  const c1 = await callProvider({ fetchImpl, apiKey, body:body1, timeoutMs:deadline - now(), now });
  calls.push({ kind:'generation', ...c1, outcome:classify(c1) });
  record.firstOutcome = calls[0].outcome;
  let text = calls[0].outcome === 'ok' ? providerText(c1.data) : null;
  record.rawText = text;
  let contract = null;
  if(text){
    contract = evaluateGeneratedOutput(job.protocol, text, prompt.form);
    record.firstContract = contract;
    record.repair = { attempted:false, outcome:'not_needed' };
    if(!contract.compliant || contract.softRepair){
      const repairable = contract.blocking.every(f => f.repairable);
      const remaining = deadline - now();
      if(!repairable) record.repair.outcome = 'not_repairable';
      else if(remaining < p.minRepairWindowMs) record.repair.outcome = 'no_time';
      else{
        record.repair.attempted = true;
        const body2 = buildRequestBody({ model:job.model, systemPrompt:prompt.systemPrompt,
          messages:[{ role:'user', content:buildRepairMessage(job.protocol, text, contract, prompt.form) }], profile });
        const c2 = await callProvider({ fetchImpl, apiKey, body:body2, timeoutMs:remaining, now });
        const o2 = classify(c2);
        calls.push({ kind:'repair', ...c2, outcome:o2 });
        if(o2 !== 'ok') record.repair.outcome = o2 === 'http_' + c2.status ? 'provider_error' : o2;
        else{
          const repaired = providerText(c2.data);
          const rc = evaluateGeneratedOutput(job.protocol, repaired, prompt.form);
          record.repairText = repaired; record.repairContract = rc;
          if(!rc.compliant) record.repair.outcome = 'still_noncompliant';
          else if(!contract.compliant || wordCount(repaired) < wordCount(text)){ text = repaired; contract = rc; record.repair.outcome = 'repaired'; }
          else record.repair.outcome = 'not_improved';
        }
      }
    }
  }
  record.accepted = !!(contract && contract.compliant);
  record.finalText = record.accepted ? text : null;
  record.finalContract = contract;
  record.usage = calls.reduce((u, c) => addUsage(u, c.data && c.data.usage), null);
  record.costUsd = calls.reduce((s, c) => s + costUsd(c.data && c.data.usage, job.model), 0);
  record.latencyMs = calls.reduce((s, c) => s + c.latencyMs, 0);
  record.providerCalls = calls.length;
  record.thinkingBlocks = calls.reduce((s, c) => s + ((c.data && Array.isArray(c.data.content)) ? c.data.content.filter(b => b && b.type === 'thinking').length : 0), 0);
  // Raw provider responses are kept verbatim (minus nothing: the request key
  // is never part of a response).
  record.calls = calls.map(c => ({ kind:c.kind, status:c.status, ok:c.ok, outcome:c.outcome, latencyMs:c.latencyMs, error:c.error || null, response:c.data }));
  return record;
}

// ---------- heuristic flags (candidates for human review, never verdicts) ----------
const FLAGS = [
  ['history', /\b(every (single )?lesson|as always|once again|again today|last (lesson|time|week)|previous (lesson|class))\b/i],
  ['guarantee', /\b(will definitely|will surely|will click|click into place|will soon (master|be)|guarantee)/i],
  ['independence', /\b(on (his|her|their|your) own|independent(ly)?|without (any )?(help|prompting|a model)|all by (him|her|your|them)sel(f|ves)|unprompted|mastered|mastery)\b/i],
  ['pronunciation', /(\bnot ["“][a-z]+["”]|said ["“][a-z]+["”] instead|mispronounc|shorten(ed|s)? (it|the word))/i],
  ['teacher-nonstandard', /\b(kick(ed)? (a|the) ball very good|play(ed)? basketball good|shoot very good)\b/i]
];
function heuristicFlags(text){
  const hits = [];
  for(const [name, re] of FLAGS){
    const g = new RegExp(re.source, re.flags + 'g'); let m;
    while((m = g.exec(text || ''))) hits.push({ flag:name, excerpt:(text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 30)).replace(/\s+/g, ' ') });
  }
  return hits;
}

// ---------- blinding ----------
function seededShuffle(items, seed){
  const out = items.slice();
  let x = parseInt(sha(String(seed)).slice(0, 8), 16) || 1;
  const rand = () => ((x = (x * 1103515245 + 12345) >>> 0) / 4294967296);
  for(let i = out.length - 1; i > 0; i--){ const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
function anonymize(text, names){
  let t = String(text || '');
  const [student, teacher] = names;
  if(teacher) t = t.replace(new RegExp('\\bTeacher ' + teacher + '\\b', 'g'), '[Teacher]').replace(new RegExp('\\b' + teacher + '\\b', 'g'), '[Teacher]');
  if(student) t = t.replace(new RegExp('\\b' + student + '\\b', 'g'), '[Student]');
  return t;
}
function buildBlindPacket({ records, prompts, seed }){
  const byPrompt = Object.fromEntries(prompts.map(p => [p.promptId, p]));
  const groups = {};
  for(const r of records) (groups[r.jobId.split('__').slice(0, 3).join('__')] ||= []).push(r);
  const key = [], sections = [], rows = [];
  let n = 0;
  for(const promptId of seededShuffle(Object.keys(groups).sort(), seed)){
    const p = byPrompt[promptId];
    const options = seededShuffle(groups[promptId], seed + ':' + promptId);
    const letters = 'ABCDEFGH';
    const parts = ['## Set ' + String(++n).padStart(2, '0') + ' — protocol ' + p.protocol + ' (' + (p.transcriptKind === 'private' ? 'real transcript' : 'fictional transcript') + ')', ''];
    options.forEach((r, i) => {
      const code = 'S' + String(n).padStart(2, '0') + letters[i];
      key.push({ code, jobId:r.jobId, model:r.model });
      const body = r.finalText || r.rawText;
      const status = r.finalText ? '' : (r.rawText ? '\n(The system did NOT deliver this draft: it failed the format checks.)\n' : '\n(No report: the model returned nothing usable.)\n');
      parts.push('### Report ' + code, status, body ? anonymize(body, p.names) : '', '');
      rows.push([code, p.protocol, '', '', '', '', '', '', '', '', '']);
    });
    sections.push(parts.join('\n'));
  }
  const header = '# Pathfinder report review (blinded)\n\nModel identities are hidden and order is randomized. Student and teacher names are replaced. Score each report on its own against the lesson evidence; do not try to guess which system wrote it.\n\nScoring guide: factual grounding, educational usefulness, writing quality and protocol personality 1-5 (5 best). Count hallucinations: claims not supported by the lesson (invented events, history, independence, pronunciation errors, guarantees). Send-ready: yes / with edits / no.\n\n';
  const csvHead = 'code,protocol,reviewer,factual_grounding_1_5,hallucination_count,hallucination_notes,educational_usefulness_1_5,writing_quality_1_5,personality_1_5,send_ready_yes_edits_no,comments';
  return { markdown:header + sections.join('\n\n'), scoresheetCsv:[csvHead, ...rows.map(r => r.join(','))].join('\n') + '\n', key };
}

// ---------- comparison report ----------
function parseCsv(text){
  const lines = String(text || '').trim().split(/\r?\n/); const head = lines.shift().split(',');
  return lines.filter(Boolean).map(l => { const cells = []; let cur = '', q = false;
    for(const ch of l){ if(ch === '"'){ q = !q; continue; } if(ch === ',' && !q){ cells.push(cur); cur = ''; } else cur += ch; }
    cells.push(cur); return Object.fromEntries(head.map((h, i) => [h, (cells[i] || '').trim()])); });
}
function compare({ records, key, scoresCsv }){
  const scoresByJob = {};
  if(scoresCsv && key){
    const byCode = Object.fromEntries(key.map(k => [k.code, k.jobId]));
    for(const s of parseCsv(scoresCsv)){ const jobId = byCode[s.code]; if(jobId && s.factual_grounding_1_5) (scoresByJob[jobId] ||= []).push(s); }
  }
  const num = v => (v === '' || v == null ? null : Number(v));
  const agg = {};
  for(const r of records){
    const k = r.protocol + '|' + r.model;
    const a = agg[k] ||= { protocol:r.protocol, model:r.model, reports:0, accepted:0, repairs:0, repaired:0, hardLimitViolations:0, refusals:0, truncations:0,
      heuristicFlags:0, costUsd:0, latencyMs:[], outputTokens:0, reviewed:0, factual:[], hallucinations:0, usefulness:[], writing:[], personality:[], sendReady:0 };
    a.reports++; if(r.accepted) a.accepted++; if(r.repair && r.repair.attempted) a.repairs++; if(r.repair && r.repair.outcome === 'repaired') a.repaired++;
    if(r.firstContract && r.firstContract.blocking.some(b => /length_hard|length_field/.test(b.code))) a.hardLimitViolations++;
    if(r.firstOutcome === 'refusal') a.refusals++; if(r.firstOutcome === 'truncated') a.truncations++;
    a.heuristicFlags += heuristicFlags(r.finalText || r.rawText || '').length;
    a.costUsd += r.costUsd; a.latencyMs.push(r.latencyMs); a.outputTokens += (r.usage && r.usage.output_tokens) || 0;
    for(const s of scoresByJob[r.jobId] || []){
      a.reviewed++; a.factual.push(num(s.factual_grounding_1_5)); a.hallucinations += num(s.hallucination_count) || 0;
      a.usefulness.push(num(s.educational_usefulness_1_5)); a.writing.push(num(s.writing_quality_1_5)); a.personality.push(num(s.personality_1_5));
      if(/^y/i.test(s.send_ready_yes_edits_no)) a.sendReady++;
    }
  }
  const mean = xs => { const v = xs.filter(x => typeof x === 'number' && !Number.isNaN(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const rows = Object.values(agg).map(a => ({ ...a, latencyMedianMs:a.latencyMs.sort((x, y) => x - y)[a.latencyMs.length >> 1],
    costPerAcceptedUsd:a.accepted ? a.costUsd / a.accepted : null,
    meanFactual:mean(a.factual), meanUsefulness:mean(a.usefulness), meanWriting:mean(a.writing), meanPersonality:mean(a.personality) }));
  // Best per protocol: teacher-reviewed quality first (factual, then zero
  // confirmed hallucinations), deterministic acceptance next, cost last.
  const best = {};
  for(const p of C.PROTOCOLS){
    const cand = rows.filter(r => r.protocol === p).sort((x, y) =>
      ((y.meanFactual ?? -1) - (x.meanFactual ?? -1)) || (x.hallucinations - y.hallucinations) ||
      ((y.accepted / y.reports) - (x.accepted / x.reports)) || ((x.costPerAcceptedUsd ?? 1e9) - (y.costPerAcceptedUsd ?? 1e9)));
    best[p] = cand[0] ? { model:cand[0].model, basis:cand[0].reviewed ? 'teacher scores' : 'deterministic only (teacher review pending)' } : null;
  }
  // Most economical acceptable configuration: per protocol, the cheapest model
  // whose reports were all accepted and (when reviewed) scored factual >= 4
  // with zero confirmed hallucinations.
  const economical = {};
  for(const p of C.PROTOCOLS){
    const ok = rows.filter(r => r.protocol === p && r.accepted === r.reports && (!r.reviewed || (r.meanFactual >= 4 && r.hallucinations === 0)))
      .sort((x, y) => (x.costPerAcceptedUsd ?? 1e9) - (y.costPerAcceptedUsd ?? 1e9));
    economical[p] = ok[0] ? { model:ok[0].model, costPerAcceptedUsd:ok[0].costPerAcceptedUsd, basis:ok[0].reviewed ? 'teacher scores' : 'deterministic only' } : null;
  }
  return { rows, best, economical, reviewedReports:Object.values(scoresByJob).length };
}

module.exports = { sha, buildRequestBody, costUsd, addUsage, transcriptSpec, planJobs, estimate, approvalCode, liveGate,
  providerText, callProvider, classify, runJob, heuristicFlags, seededShuffle, anonymize, buildBlindPacket, parseCsv, compare };
