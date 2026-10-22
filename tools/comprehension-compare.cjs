'use strict';
/**
 * Lesson-comprehension before/after comparison for two model-benchmark runs of
 * the same phase (one per engine arm, identical cases/seeds/settings).
 *
 *   node tools/comprehension-compare.cjs report --before <runDir> --after <runDir>
 *        Free. Pairs reports by prompt, compares acceptance/length/tokens/
 *        latency/cost, runs deterministic ground-truth checks and writes
 *        COMPREHENSION-COMPARISON.md + comprehension.json into the after run.
 *   node tools/comprehension-compare.cjs judge --before <runDir> --after <runDir> [--plan]
 *        PAID (eval key). Blinded A/B review of every pair by a judge model
 *        against the transcript and ground truth. --plan prints the estimate and
 *        APPROVAL CODE only; a run needs PATHFINDER_EVAL_ALLOW_LIVE=YES,
 *        --approve <code> and --max-spend-usd <cap>, like the benchmark itself.
 *
 * Deterministic checks are coverage/scope heuristics, never verdicts. Judge
 * scores are one model's opinion; teachers remain the final reviewers.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { CASES } = require('./comprehension-cases.cjs');
const B = require('./model-benchmark/core.cjs');

const ROOT = path.resolve(__dirname, '..');
const MAIN_ROOT = ROOT.includes(path.sep + '.v2-local' + path.sep) ? ROOT.slice(0, ROOT.indexOf(path.sep + '.v2-local' + path.sep)) : ROOT;
const JUDGE = { model:'claude-opus-5-5', input:4.00, output:20.00, maxTokens:16000, assumedOutputTokens:4000 };
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;

// ---------- ground truth ----------
// Fictional cases carry RegExp objects; the private sidecar stores pattern strings.
function compile(p){ return p instanceof RegExp ? p : p ? new RegExp(p, 'i') : null; }
function groundTruthFor(transcriptId, prompts){
  if(CASES[transcriptId]) return CASES[transcriptId];
  const sidecar = prompts.find(p => p.transcript === transcriptId && p.groundTruth);
  return sidecar ? sidecar.groundTruth : null;
}
function rubricChecks(text, gt){
  if(!gt || !text) return null;
  const topics = (gt.topics || []).map(t => ({ name:t.name, covered:compile(t.pattern).test(text) }));
  const commitmentViolations = (gt.commitments || []).filter(c => c.forbidden && compile(c.forbidden).test(text))
    .map(c => ({ said:c.said, matched:String(text.match(compile(c.forbidden))[0]) }));
  return { topicsCovered:topics.filter(t => t.covered).length, topicsTotal:topics.length, topics, commitmentViolations };
}

// ---------- runs ----------
function loadRun(dir){
  const jobs = fs.readdirSync(path.join(dir, 'jobs')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, 'jobs', f), 'utf8')));
  const prompts = JSON.parse(fs.readFileSync(path.join(dir, 'prompts.private.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  return { dir, jobs, prompts, manifest };
}
const promptKey = j => j.transcript + '__' + j.protocol + '__r' + j.rep;
function pairRuns(before, after){
  const b = Object.fromEntries(before.jobs.map(j => [promptKey(j), j]));
  return after.jobs.filter(j => b[promptKey(j)]).map(j => ({ key:promptKey(j), transcript:j.transcript, protocol:j.protocol, rep:j.rep, before:b[promptKey(j)], after:j }))
    .sort((x, y) => x.key.localeCompare(y.key));
}
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
function armSummary(jobs){
  const u = k => jobs.map(j => (j.usage && j.usage[k]) || 0);
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  return { reports:jobs.length, accepted:jobs.filter(j => j.accepted).length, repairs:jobs.filter(j => j.repair && j.repair.attempted).length,
    meanWords:Math.round(mean(jobs.filter(j => j.finalText).map(j => words(j.finalText)))),
    meanInputTokens:Math.round(mean(u('input_tokens').map((x, i) => x + u('cache_read_input_tokens')[i] + u('cache_creation_input_tokens')[i]))),
    meanOutputTokens:Math.round(mean(u('output_tokens'))), meanCostUsd:mean(jobs.map(j => j.costUsd || 0)),
    medianLatencyS:+(median(jobs.map(j => j.latencyMs || 0)) / 1000).toFixed(1) };
}

function report(beforeDir, afterDir){
  const before = loadRun(beforeDir), after = loadRun(afterDir);
  if(before.manifest.phase !== after.manifest.phase) throw new Error('Runs are from different phases');
  const prompts = [...before.prompts, ...after.prompts];
  const pairs = pairRuns(before, after).map(p => {
    const gt = groundTruthFor(p.transcript, prompts);
    return { ...p, checks:{ before:rubricChecks(p.before.finalText, gt), after:rubricChecks(p.after.finalText, gt) } };
  });
  const out = { phase:after.manifest.phase, before:{ run:before.manifest.runId, commit:before.manifest.commit, ...armSummary(before.jobs) },
    after:{ run:after.manifest.runId, commit:after.manifest.commit, ...armSummary(after.jobs) },
    pairs:pairs.map(p => ({ key:p.key, protocol:p.protocol, checks:p.checks, beforeAccepted:p.before.accepted, afterAccepted:p.after.accepted,
      beforeWords:words(p.before.finalText), afterWords:words(p.after.finalText) })) };
  const sum = (arm, f) => pairs.reduce((s, p) => s + (p.checks[arm] ? f(p.checks[arm]) : 0), 0);
  out.deterministic = Object.fromEntries(['before', 'after'].map(arm => [arm, {
    topicsCovered:sum(arm, c => c.topicsCovered), topicsTotal:sum(arm, c => c.topicsTotal), commitmentViolations:sum(arm, c => c.commitmentViolations.length) }]));
  const md = ['# Lesson comprehension: before vs after', '',
    'Phase `' + out.phase + '`. Before ' + out.before.commit + ' (' + out.before.run + '), after ' + out.after.commit + ' (' + out.after.run + ').', '',
    '| | Before | After |', '|---|---:|---:|',
    ...['reports', 'accepted', 'repairs', 'meanWords', 'meanInputTokens', 'meanOutputTokens', 'medianLatencyS'].map(k => '| ' + k + ' | ' + out.before[k] + ' | ' + out.after[k] + ' |'),
    '| meanCostUsd | ' + out.before.meanCostUsd.toFixed(4) + ' | ' + out.after.meanCostUsd.toFixed(4) + ' |',
    '| topic coverage (heuristic) | ' + out.deterministic.before.topicsCovered + '/' + out.deterministic.before.topicsTotal + ' | ' + out.deterministic.after.topicsCovered + '/' + out.deterministic.after.topicsTotal + ' |',
    '| commitment scope violations (heuristic) | ' + out.deterministic.before.commitmentViolations + ' | ' + out.deterministic.after.commitmentViolations + ' |', '',
    'Topic coverage is a keyword heuristic: more is not automatically better (a short report should select). Violations are invented specifics in requests/agreements.', ''];
  for(const p of pairs){
    md.push('## ' + p.key, '');
    for(const arm of ['before', 'after']){
      const j = p[arm], c = p.checks[arm];
      md.push('**' + arm.toUpperCase() + '** — ' + (j.accepted ? 'accepted' : 'NOT accepted (' + j.firstOutcome + ')') + ', ' + words(j.finalText || j.rawText) + ' words' +
        (c ? ', topics ' + c.topicsCovered + '/' + c.topicsTotal + (c.commitmentViolations.length ? ', VIOLATION: ' + c.commitmentViolations.map(v => '"' + v.matched + '"').join(', ') : '') : ''), '',
        '> ' + String(j.finalText || j.rawText || '(no text)').trim().replace(/\n/g, '\n> '), '');
    }
  }
  fs.writeFileSync(path.join(afterDir, 'comprehension.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(afterDir, 'COMPREHENSION-COMPARISON.md'), md.join('\n') + '\n');
  return out;
}

// ---------- blinded judge ----------
function judgePrompt({ transcript, gt, protocol, settings, a, b }){
  const truth = gt ? [
    'Theme: ' + (gt.theme || 'NONE — there is no defensible overarching theme; a report that invents one is wrong.'),
    'What happened: ' + (gt.topics || []).map(t => t.name).join('; '),
    'Explicit requests/agreements (exact scope): ' + (gt.commitments || []).map(c => c.said).join(' | '),
    'Claims a faithful report must NOT make: ' + (gt.unsupported || []).join('; ')
  ].join('\n') : '(no ground truth supplied: judge from the transcript alone)';
  const system = 'You are a meticulous reviewer of tutor feedback messages. You judge FIDELITY to what actually happened in the lesson, not elegance. Polished writing that misrepresents the lesson scores low. Invented specifics (deadlines, formats, agreements, feelings, events) are hallucinations. Reply with one JSON object only.';
  const user = [
    'Protocol: ' + protocol + (settings ? ' (module: ' + settings.preplyModule + ', student: ' + settings.studentName + ')' : ''),
    '', '<ground_truth>', truth, '</ground_truth>', '', '<transcript>', transcript, '</transcript>', '',
    '<report_A>', a, '</report_A>', '', '<report_B>', b, '</report_B>', '',
    'Score EACH report 1-5 on: fidelity (represents the whole lesson, not one segment), theme (5 = recognises a genuine theme or correctly invents none; 1 = misses an obvious one or invents one), personalization (the student\'s actual perspectives/goals), usefulness (educational value of the language points), commitments (next steps exactly as asked/agreed), length (appropriate and dense), and count hallucinations (list each).',
    'JSON shape: {"A":{"fidelity":n,"theme":n,"personalization":n,"usefulness":n,"commitments":n,"length":n,"hallucinations":["..."]},"B":{...},"better":"A"|"B"|"tie","reason":"one or two sentences"}'
  ].join('\n');
  return { system, user };
}
function parseJudge(text){
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if(!m) return null;
  try{ return JSON.parse(m[0]); }catch{ return null; }
}

function judgePlan(beforeDir, afterDir){
  const before = loadRun(beforeDir), after = loadRun(afterDir);
  const prompts = Object.fromEntries(after.prompts.map(p => [p.promptId, p]));
  const pairs = pairRuns(before, after).filter(p => (p.before.finalText || p.before.rawText) && (p.after.finalText || p.after.rawText));
  const items = pairs.map(p => {
    const prompt = prompts[p.key];
    // Seeded, recorded A/B order: the judge never knows which arm is which.
    const afterIsA = parseInt(sha('ab:' + p.key).slice(0, 2), 16) % 2 === 0;
    const bt = p.before.finalText || p.before.rawText, at = p.after.finalText || p.after.rawText;
    const gt = groundTruthFor(p.transcript, [...before.prompts, ...after.prompts]);
    const msg = judgePrompt({ transcript:prompt.form.notes, gt, protocol:p.protocol, settings:prompt.form, a:afterIsA ? at : bt, b:afterIsA ? bt : at });
    return { key:p.key, afterIsA, msg, inputTokens:Math.ceil((msg.system.length + msg.user.length) / 3) };
  });
  const upperUsd = items.reduce((s, i) => s + (i.inputTokens * 1.35 * JUDGE.input + JUDGE.assumedOutputTokens * JUDGE.output) / 1e6, 0);
  const code = sha(JSON.stringify({ judge:JUDGE.model, items:items.map(i => [i.key, i.afterIsA, sha(i.msg.user)]) })).slice(0, 10);
  return { items, upperUsd, code };
}

async function judge(a){
  const { items, upperUsd, code } = judgePlan(a.before, a.after);
  console.log('Judge ' + JUDGE.model + ': ' + items.length + ' blinded pairs, estimated upper bound $' + upperUsd.toFixed(2));
  console.log('APPROVAL CODE: ' + code);
  if(a.plan) return;
  if(process.env.PATHFINDER_EVAL_ALLOW_LIVE !== 'YES') throw new Error('LIVE_BLOCKED: set PATHFINDER_EVAL_ALLOW_LIVE=YES');
  if(a.approve !== code) throw new Error('LIVE_BLOCKED: --approve must equal the current judge plan code');
  const cap = Number(a['max-spend-usd']);
  if(!(cap >= upperUsd)) throw new Error('LIVE_BLOCKED: --max-spend-usd must be at least the estimated upper bound');
  if(process.env.ANTHROPIC_API_KEY) throw new Error('LIVE_BLOCKED: unset ANTHROPIC_API_KEY; only the dedicated evaluation key may be used');
  const keyFile = path.join(MAIN_ROOT, String(a['key-file'] || '.v2-local/eval-anthropic-key.txt'));
  const key = (process.env.PATHFINDER_EVAL_ANTHROPIC_API_KEY || fs.readFileSync(keyFile, 'utf8')).trim();
  const results = []; let spent = 0;
  for(const item of items){
    if(spent >= cap){ console.error('Stopped: --max-spend-usd reached'); break; }
    const body = { model:JUDGE.model, max_tokens:JUDGE.maxTokens, thinking:{ type:'adaptive' }, output_config:{ effort:'high' },
      system:item.msg.system, messages:[{ role:'user', content:item.msg.user }] };
    const call = await B.callProvider({ fetchImpl:fetch, apiKey:key, body, timeoutMs:180000, now:Date.now });
    const usage = call.data && call.data.usage;
    const cost = usage ? ((usage.input_tokens || 0) * JUDGE.input + (usage.output_tokens || 0) * JUDGE.output) / 1e6 : 0;
    spent += cost;
    const verdict = call.ok ? parseJudge(B.providerText(call.data)) : null;
    // Un-blind only after the call: map A/B back to before/after.
    const arms = verdict ? { after:verdict[item.afterIsA ? 'A' : 'B'], before:verdict[item.afterIsA ? 'B' : 'A'],
      better:verdict.better === 'tie' ? 'tie' : (verdict.better === 'A') === item.afterIsA ? 'after' : 'before', reason:verdict.reason } : null;
    results.push({ key:item.key, status:call.status, costUsd:cost, latencyMs:call.latencyMs, verdict:arms });
    console.log(JSON.stringify({ pair:item.key, status:call.status, better:arms && arms.better, cost:+cost.toFixed(4) }));
  }
  const dims = ['fidelity', 'theme', 'personalization', 'usefulness', 'commitments', 'length'];
  const scored = results.filter(r => r.verdict && r.verdict.before && r.verdict.after);
  const avg = (arm, d) => scored.length ? +(scored.reduce((s, r) => s + Number(r.verdict[arm][d] || 0), 0) / scored.length).toFixed(2) : null;
  const summary = { judge:JUDGE.model, approvalCode:code, pairs:results.length, scored:scored.length, spentUsd:+spent.toFixed(4),
    wins:{ after:scored.filter(r => r.verdict.better === 'after').length, before:scored.filter(r => r.verdict.better === 'before').length, tie:scored.filter(r => r.verdict.better === 'tie').length },
    means:Object.fromEntries(['before', 'after'].map(arm => [arm, { ...Object.fromEntries(dims.map(d => [d, avg(arm, d)])),
      hallucinations:scored.reduce((s, r) => s + ((r.verdict[arm].hallucinations || []).length), 0) }])) };
  fs.writeFileSync(path.join(a.after, 'judge.json'), JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

module.exports = { rubricChecks, pairRuns, armSummary, judgePrompt, parseJudge, judgePlan, report, groundTruthFor };

if(require.main === module){
  const a = { _:[] };
  const argv = process.argv.slice(2);
  for(let i = 0; i < argv.length; i++){
    if(argv[i].startsWith('--')){ const k = argv[i].slice(2); a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
    else a._.push(argv[i]);
  }
  const cmd = a._[0];
  if(!a.before || !a.after || !['report', 'judge'].includes(cmd)){ console.error('usage: report|judge --before <runDir> --after <runDir> [--plan]'); process.exit(2); }
  a.before = path.resolve(a.before); a.after = path.resolve(a.after);
  (cmd === 'report' ? Promise.resolve(report(a.before, a.after)).then(o => console.log(JSON.stringify({ before:o.before, after:o.after, deterministic:o.deterministic }, null, 2))) : judge(a))
    .catch(e => { console.error(e.message); process.exit(1); });
}
