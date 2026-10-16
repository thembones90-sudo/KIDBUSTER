#!/usr/bin/env node
'use strict';
/*
 * Pathfinder V2 three-model benchmark (isolated; never touches production
 * model selection, licensing, billing, Vercel, KV or customer data).
 *
 *   plan           offline: build prompts, estimate spend, print an approval code
 *   verify-models  free metadata calls: GET /v1/models/{id} for every model
 *   run            PAID: requires PATHFINDER_EVAL_ALLOW_LIVE=YES, a dedicated
 *                  evaluation key, --approve <code from plan>, --max-spend-usd
 *   blind          build the anonymized, randomized teacher-review packet
 *   report         deterministic + (optional) teacher-score comparison report
 *
 * Every artifact is written under the git-ignored .v2-local/model-benchmark/.
 */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const C = require('./model-benchmark/config.cjs');
const B = require('./model-benchmark/core.cjs');

const ROOT = path.resolve(__dirname, '..');
// Artifacts always go to the MAIN checkout's git-ignored .v2-local, even when
// this runs from a worktree that itself lives inside .v2-local.
const MAIN_ROOT = ROOT.includes(path.sep + '.v2-local' + path.sep) ? ROOT.slice(0, ROOT.indexOf(path.sep + '.v2-local' + path.sep)) : ROOT;
const OUT_ROOT = path.join(MAIN_ROOT, '.v2-local', 'model-benchmark');

function args(argv){
  const out = { _:[] };
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(a.startsWith('--')){ const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; out[k] = v; }
    else out._.push(a);
  }
  return out;
}
function commitInfo(){
  try{
    const commit = cp.execSync('git rev-parse --short HEAD', { cwd:ROOT, encoding:'utf8' }).trim();
    const dirty = cp.execSync('git status --porcelain -- index.html api tools/model-benchmark tools/model-benchmark.cjs', { cwd:ROOT, encoding:'utf8' }).trim();
    return { commit, dirty:!!dirty };
  }catch{ return { commit:'unknown', dirty:true }; }
}
function readPrivate(rel){
  const abs = path.join(MAIN_ROOT, rel);
  if(!abs.startsWith(path.join(MAIN_ROOT, '.v2-local') + path.sep)) throw new Error('Private inputs must live in .v2-local');
  const ignored = cp.spawnSync('git', ['check-ignore', '-q', abs], { cwd:MAIN_ROOT }).status === 0;
  if(!ignored) throw new Error('Private input is not git-ignored: ' + rel);
  return fs.readFileSync(abs, 'utf8');
}
function evalKey(a){
  if(process.env.PATHFINDER_EVAL_ANTHROPIC_API_KEY) return process.env.PATHFINDER_EVAL_ANTHROPIC_API_KEY.trim();
  if(a['key-file']){
    const k = readPrivate(String(a['key-file']).replace(/\\/g, '/')).trim();
    if(k) return k;
  }
  throw new Error('A dedicated evaluation key is required: PATHFINDER_EVAL_ANTHROPIC_API_KEY or --key-file .v2-local/<file> (git-ignored)');
}
const usd = x => '$' + x.toFixed(x < 1 ? 3 : 2);

async function makePlan(a){
  const { buildServerGeneration, __resetServerGenerationForTests } = await import('../api/_lib/server-generation.js');
  const phase = a.phase || 'initial';
  const profile = a.profile || 'production';
  if(!C.PROFILES[profile]) throw new Error('Unknown profile');
  const plan = B.planJobs({ phase, buildServerGeneration, readPrivate, resetCore:__resetServerGenerationForTests });
  const est = B.estimate(plan);
  const info = commitInfo();
  return { plan, est, profile, info, code:B.approvalCode(plan, est, profile, info.commit) };
}

async function cmdPlan(a){
  const { plan, est, profile, info, code } = await makePlan(a);
  console.log('Pathfinder V2 model benchmark — PLAN (no network, no spend)');
  console.log('Phase: ' + plan.phase + ' — ' + C.PHASES[plan.phase].description);
  console.log('Code: ' + info.commit + (info.dirty ? ' (UNCOMMITTED CHANGES — commit before a paid run)' : ''));
  console.log('Profile: ' + profile + ' — ' + C.PROFILES[profile].description);
  console.log('Models:'); for(const [id, m] of Object.entries(C.MODELS)) console.log('  ' + id.padEnd(18) + m.label.padEnd(18) + ' thinking: ' + m.defaultThinking);
  console.log('Distinct prompts: ' + plan.prompts.length + ' (each shared by all models)   Reports: ' + est.reports + '   Max provider calls: ' + est.maxProviderCalls);
  console.log('Estimated spend: ' + usd(est.lowerUsd) + ' (cache-warm, no thinking, no repairs) to ' + usd(est.upperUsd) + ' (upper bound)');
  for(const [m, v] of Object.entries(est.perModelUpperUsd)) console.log('  upper ' + m.padEnd(18) + usd(v));
  console.log('Assumptions: ' + JSON.stringify(est.assumptions));
  console.log('\nAPPROVAL CODE: ' + code + '\nA paid run requires: run --phase ' + plan.phase + ' --approve ' + code + ' --max-spend-usd <cap>');
  return { plan, est, code };
}

async function cmdVerifyModels(a){
  const key = evalKey(a);
  const results = [];
  for(const id of Object.keys(C.MODELS)){
    const res = await fetch('https://api.anthropic.com/v1/models/' + encodeURIComponent(id), { headers:{ 'x-api-key':key, 'anthropic-version':'2023-06-01' } });
    let body = null; try{ body = await res.json(); }catch{}
    results.push({ requested:id, status:res.status, id:body && body.id, display_name:body && body.display_name, max_input_tokens:body && body.max_input_tokens, max_tokens:body && body.max_tokens });
  }
  for(const r of results) console.log((r.status === 200 && r.id === r.requested ? 'VERIFIED ' : 'NOT AVAILABLE ') + JSON.stringify(r));
  fs.mkdirSync(OUT_ROOT, { recursive:true });
  fs.writeFileSync(path.join(OUT_ROOT, 'model-verification.json'), JSON.stringify({ checkedAt:new Date().toISOString(), results }, null, 2) + '\n');
  if(results.some(r => r.status !== 200 || r.id !== r.requested)) process.exitCode = 1;
}

async function cmdRun(a){
  const { plan, est, profile, info, code } = await makePlan(a);
  if(info.dirty) throw new Error('LIVE_BLOCKED: commit the benchmark and prompt code first so the run is reproducible');
  B.liveGate({ env:process.env, approve:a.approve, expectedCode:code, maxSpendUsd:Number(a['max-spend-usd']), est });
  const verification = path.join(OUT_ROOT, 'model-verification.json');
  if(!fs.existsSync(verification) || JSON.parse(fs.readFileSync(verification, 'utf8')).results.some(r => r.status !== 200))
    throw new Error('LIVE_BLOCKED: run verify-models successfully first');
  const key = evalKey(a);
  const sg = await import('../api/_lib/server-generation.js');
  const runId = plan.phase + '-' + new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(OUT_ROOT, runId);
  fs.mkdirSync(path.join(dir, 'jobs'), { recursive:true }); fs.mkdirSync(path.join(dir, 'final'), { recursive:true });
  const manifest = { runId, phase:plan.phase, profile, commit:info.commit, approvalCode:code, maxSpendUsd:Number(a['max-spend-usd']), estimate:est,
    models:C.MODELS, pricingSource:C.PRICING_SOURCE, prompts:plan.prompts.map(p => ({ promptId:p.promptId, transcript:p.transcript, transcriptKind:p.transcriptKind, protocol:p.protocol, rep:p.rep, promptSha256:p.promptSha256, form:{ ...p.form, notes:'[omitted]' } })),
    startedAt:new Date().toISOString(), completed:0, spentUsd:0, stoppedForBudget:false };
  fs.writeFileSync(path.join(dir, 'prompts.private.json'), JSON.stringify(plan.prompts, null, 2));
  const byPrompt = Object.fromEntries(plan.prompts.map(p => [p.promptId, p]));
  const concurrency = Math.max(1, Math.min(4, Number(a.concurrency) || 3));
  let next = 0;
  async function worker(){
    while(next < plan.jobs.length && !manifest.stoppedForBudget){
      const job = plan.jobs[next++];
      const rec = await B.runJob({ job, prompt:byPrompt[job.promptId], profile, fetchImpl:fetch, apiKey:key,
        evaluateGeneratedOutput:sg.evaluateGeneratedOutput, buildRepairMessage:sg.buildRepairMessage });
      manifest.completed++; manifest.spentUsd += rec.costUsd;
      fs.writeFileSync(path.join(dir, 'jobs', job.jobId + '.json'), JSON.stringify(rec, null, 2));
      if(rec.finalText) fs.writeFileSync(path.join(dir, 'final', job.jobId + '.md'), rec.finalText + '\n');
      fs.appendFileSync(path.join(dir, 'metrics.jsonl'), JSON.stringify({ jobId:job.jobId, model:job.model, protocol:job.protocol, transcript:job.transcript, rep:job.rep,
        accepted:rec.accepted, firstOutcome:rec.firstOutcome, repair:rec.repair || null, providerCalls:rec.providerCalls, costUsd:rec.costUsd, latencyMs:rec.latencyMs, usage:rec.usage }) + '\n');
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      console.log(JSON.stringify({ job:job.jobId, accepted:rec.accepted, first:rec.firstOutcome, repair:rec.repair && rec.repair.outcome, cost:+rec.costUsd.toFixed(4), s:Math.round(rec.latencyMs / 1000), spent:+manifest.spentUsd.toFixed(3) }));
      if(manifest.spentUsd >= manifest.maxSpendUsd){ manifest.stoppedForBudget = true; console.error('Stopped: --max-spend-usd reached'); }
    }
  }
  await Promise.all(Array.from({ length:concurrency }, worker));
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Run saved (git-ignored): ' + dir);
}

function loadRun(dir){
  const records = fs.readdirSync(path.join(dir, 'jobs')).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, 'jobs', f), 'utf8')));
  const prompts = JSON.parse(fs.readFileSync(path.join(dir, 'prompts.private.json'), 'utf8'));
  return { records, prompts };
}
function runDir(a){
  const d = path.resolve(String(a.run || ''));
  if(!a.run || !d.startsWith(OUT_ROOT + path.sep) || !fs.existsSync(d)) throw new Error('--run must name a run directory under ' + OUT_ROOT);
  return d;
}

function cmdBlind(a){
  const dir = runDir(a);
  const { records, prompts } = loadRun(dir);
  const seed = String(a.seed || path.basename(dir));
  const packet = B.buildBlindPacket({ records, prompts, seed });
  const review = path.join(dir, 'review'); fs.mkdirSync(review, { recursive:true });
  fs.writeFileSync(path.join(review, 'REVIEW-PACKET.md'), packet.markdown);
  fs.writeFileSync(path.join(review, 'scoresheet.csv'), packet.scoresheetCsv);
  fs.writeFileSync(path.join(review, 'KEY-DO-NOT-SHARE-WITH-REVIEWERS.json'), JSON.stringify({ seed, key:packet.key }, null, 2));
  console.log('Blinded packet: ' + review + ' (' + packet.key.length + ' reports, seed ' + seed + ')');
}

function cmdReport(a){
  const dir = runDir(a);
  const { records } = loadRun(dir);
  const keyFile = path.join(dir, 'review', 'KEY-DO-NOT-SHARE-WITH-REVIEWERS.json');
  const key = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')).key : null;
  const scores = a.scores ? fs.readFileSync(path.resolve(String(a.scores)), 'utf8') : null;
  const cmp = B.compare({ records, key, scoresCsv:scores });
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const f = (x, d = 2) => x == null ? '—' : Number(x).toFixed(d);
  const lines = ['# Pathfinder V2 model benchmark — ' + manifest.runId, '',
    'Commit ' + manifest.commit + ', profile ' + manifest.profile + ', spent ' + usd(manifest.spentUsd) + ' (' + manifest.completed + ' reports). Prices: ' + manifest.pricingSource + '.',
    cmp.reviewedReports ? 'Teacher scores: ' + cmp.reviewedReports + ' reports reviewed.' : '**Teacher review pending: quality columns are empty; rankings below use deterministic results only.**', '',
    '## Deterministic results (structure and hard limits — software-checked)', '',
    '| Protocol | Model | Accepted | Repairs (ok) | Hard-limit violations (first draft) | Refusals | Truncated | Median s | Cost/accepted |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|'];
  for(const r of cmp.rows.sort((x, y) => x.protocol.localeCompare(y.protocol) || x.model.localeCompare(y.model)))
    lines.push('| ' + [r.protocol, r.model, r.accepted + '/' + r.reports, r.repairs + ' (' + r.repaired + ')', r.hardLimitViolations, r.refusals, r.truncations, f(r.latencyMedianMs / 1000, 1), r.costPerAcceptedUsd == null ? '—' : usd(r.costPerAcceptedUsd)].join(' | ') + ' |');
  lines.push('', '## Hallucinations (kept separate from writing scores)', '', 'Heuristic candidates are phrase matches for human checking, not verdicts. Confirmed hallucinations come only from teacher review.', '',
    '| Protocol | Model | Heuristic candidates | Confirmed (teacher) |', '|---|---|---:|---:|');
  for(const r of cmp.rows) lines.push('| ' + [r.protocol, r.model, r.heuristicFlags, r.reviewed ? r.hallucinations : 'pending'].join(' | ') + ' |');
  lines.push('', '## Subjective quality (teacher scores, 1-5)', '', '| Protocol | Model | Factual grounding | Usefulness | Writing | Personality | Send-ready |', '|---|---|---:|---:|---:|---:|---:|');
  for(const r of cmp.rows) lines.push('| ' + [r.protocol, r.model, f(r.meanFactual), f(r.meanUsefulness), f(r.meanWriting), f(r.meanPersonality), r.reviewed ? r.sendReady + '/' + r.reviewed : 'pending'].join(' | ') + ' |');
  lines.push('', '## Strongest model per protocol', '');
  for(const [p, b] of Object.entries(cmp.best)) lines.push('- ' + p + ': ' + (b ? b.model + ' (' + b.basis + ')' : '—'));
  lines.push('', '## Most economical acceptable configuration', '');
  let total = 0;
  for(const [p, e] of Object.entries(cmp.economical)){ lines.push('- ' + p + ': ' + (e ? e.model + ' at ' + usd(e.costPerAcceptedUsd) + '/accepted report (' + e.basis + ')' : 'no model met the bar')); if(e) total += e.costPerAcceptedUsd; }
  lines.push('', 'Mean cost per accepted report for that mix: ' + usd(total / 7) + '. One sample per cell is not a reliability estimate.');
  fs.writeFileSync(path.join(dir, 'COMPARISON.md'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'comparison.json'), JSON.stringify(cmp, null, 2));
  console.log(lines.join('\n'));
}

(async () => {
  const a = args(process.argv.slice(2));
  const cmd = a._[0];
  const map = { plan:cmdPlan, 'verify-models':cmdVerifyModels, run:cmdRun, blind:cmdBlind, report:cmdReport };
  if(!map[cmd]){ console.log('Usage: node tools/model-benchmark.cjs <plan|verify-models|run|blind|report> [--phase initial|full] [--approve CODE --max-spend-usd N] [--run DIR] [--scores CSV] [--key-file .v2-local/FILE]'); process.exitCode = cmd ? 1 : 0; return; }
  await map[cmd](a);
})().catch(err => { console.error(String(err && err.message || err).replace(/sk-ant-[A-Za-z0-9_-]+/g, '<key>')); process.exitCode = 1; });
