'use strict';
// Lesson-comprehension evaluation tooling: fictional cases are valid RADAR VAN
// transcripts, the comprehension phase plans the intended protocols, the
// deterministic ground-truth checks catch invented specifics, and the judge
// packet is blinded. Offline only: no network, no key, no spend.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-comprehension-compare.cjs ===');
  const { CASES } = require('../tools/comprehension-cases.cjs');
  const X = require('../tools/comprehension-compare.cjs');
  const B = require('../tools/model-benchmark/core.cjs');
  const sg = await import('../api/_lib/server-generation.js');
  // RADAR VAN v1 transcript header grammar (PHASE3-RADAR-VAN-CONTRACT): every
  // line of these fixtures is a non-empty "[mm:ss] TEACHER|STUDENT: text" header.
  const RADAR_HEADER = /^\[(\d{2,3}):([0-5]\d)\][ \t]+(TEACHER|STUDENT):[ \t]*\S/;

  console.log('\n1) Fictional cases are realistic RADAR VAN input');
  for(const [id, c] of Object.entries(CASES)){
    check(id + ' uses the RADAR VAN transcript grammar', c.transcript.split('\n').every(l => RADAR_HEADER.test(l)));
    const built = sg.buildServerGeneration({ protocol:c.protocols[0], studentName:c.student, teacherName:c.teacher, notes:c.transcript,
      lengthFormat:'medium', rating:c.protocols[0] === 'PREPLY' ? '' : c.protocols[0] === 'OF' ? 'Medium/High' : '4', studentGender:'boy', preplyModule:c.preplyModule });
    check(id + ' reaches the model with Teacher/Student roles', /Teacher: /.test(built.userMessage) && /Student: /.test(built.userMessage));
    check(id + ' has ground truth (topics, commitments, unsupported claims)', c.topics.length > 0 && c.commitments.length > 0 && c.unsupported.length > 0 && 'theme' in c);
  }
  check('exactly one adult case asserts a genuine theme; the others assert none',
    Object.values(CASES).filter(c => c.theme).length === 1 && CASES['cmp-philosophical'].theme);

  console.log('\n2) Comprehension phase plans the intended jobs');
  sg.__resetServerGenerationForTests();
  const plan = B.planJobs({ phase:'comprehension', buildServerGeneration:sg.buildServerGeneration, readPrivate:() => { throw new Error('no private input'); },
    models:['claude-haiku-5-5'], resetCore:sg.__resetServerGenerationForTests });
  const by = t => plan.prompts.filter(p => p.transcript === t).map(p => p.protocol);
  check('24 prompts: five adult lessons on Preply x3 and the child lesson on MA/OF/FAIRY x3', plan.prompts.length === 24);
  check('adult lessons run on Preply only', ['cmp-philosophical','cmp-grammar','cmp-short','cmp-unrelated','cmp-fragmented'].every(t => by(t).length === 3 && by(t).every(p => p === 'PREPLY')));
  check('child lesson runs on the young-learner protocols', JSON.stringify([...new Set(by('cmp-child-vocab'))].sort()) === JSON.stringify(['FAIRY','MA','OF']));
  check('Preply adult module is used for the adult cases', plan.prompts.filter(p => p.protocol === 'PREPLY').every(p => p.form.preplyModule === 'adult'));

  console.log('\n3) Deterministic ground-truth checks');
  const gt = CASES['cmp-philosophical'];
  const upgraded = X.rubricChecks('We talked about your mother, painting and money as freedom. Please send me your outline within the week.', gt);
  check('an invented "outline" and deadline is flagged as a commitment violation', upgraded.commitmentViolations.length === 1 && /outline/i.test(upgraded.commitmentViolations[0].matched));
  check('topic coverage counts the topics a report touches', upgraded.topicsCovered === 3 && upgraded.topicsTotal === 6);
  const faithful = X.rubricChecks('Please send me some ideas about what you want to include, and next time we will do a practice run.', gt);
  check('the request at its real scope is not flagged', faithful.commitmentViolations.length === 0);
  check('the unrelated case flags an invented agreement', X.rubricChecks('You agreed to bring a recipe next time.', CASES['cmp-unrelated']).commitmentViolations.length === 1);
  check('no ground truth -> no verdict', X.rubricChecks('text', null) === null);
  check('private sidecar patterns given as strings are compiled', X.rubricChecks('send an outline', { topics:[{ name:'x', pattern:'outline' }], commitments:[{ said:'ideas', forbidden:'outline' }] }).commitmentViolations.length === 1);

  console.log('\n4) Blinded judge packet');
  const msg = X.judgePrompt({ transcript:'[00:00] TEACHER: Hi.', gt:CASES['cmp-unrelated'], protocol:'PREPLY', settings:{ preplyModule:'adult', studentName:'Chen' }, a:'Report one.', b:'Report two.' });
  check('judge sees transcript, ground truth and both reports', msg.user.includes('<transcript>') && msg.user.includes('NONE') && msg.user.includes('Report one.') && msg.user.includes('Report two.'));
  check('judge is never told which arm is which', !/before|after|baseline|improved/i.test(msg.user.replace(/<transcript>[\s\S]*<\/transcript>/, '')));
  check('judge reply JSON is parsed out of surrounding text', X.parseJudge('Here: {"better":"A","A":{"fidelity":4}} done').better === 'A');
  check('malformed judge reply is recorded as unscored', X.parseJudge('no json') === null);

  // Two fake runs of the same phase -> pairing, summary and stable blinding.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'));
  try{
    const mk = (name, text) => {
      const dir = path.join(tmp, name); fs.mkdirSync(path.join(dir, 'jobs'), { recursive:true });
      const job = { jobId:'cmp-short__PREPLY__r1__claude-haiku-5-5', transcript:'cmp-short', protocol:'PREPLY', rep:1, accepted:true, finalText:text,
        usage:{ input_tokens:1000, output_tokens:500 }, costUsd:0.001, latencyMs:9000, repair:{ attempted:false } };
      fs.writeFileSync(path.join(dir, 'jobs', job.jobId + '.json'), JSON.stringify(job));
      fs.writeFileSync(path.join(dir, 'prompts.private.json'), JSON.stringify([{ promptId:'cmp-short__PREPLY__r1', transcript:'cmp-short', protocol:'PREPLY',
        form:{ notes:CASES['cmp-short'].transcript, preplyModule:'adult', studentName:'Ines' } }]));
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ runId:name, phase:'comprehension', commit:name }));
      return dir;
    };
    const before = mk('before', 'Today we practised doctor appointment phrases. Please do the homework.');
    const after = mk('after', 'Today we practised phrases for a doctor appointment. Next time we continue with the pharmacy.');
    const out = X.report(before, after);
    check('report pairs the two arms by prompt', out.pairs.length === 1 && out.pairs[0].key === 'cmp-short__PREPLY__r1');
    check('report flags the invented homework in the before arm only', out.deterministic.before.commitmentViolations === 1 && out.deterministic.after.commitmentViolations === 0);
    check('report writes the comparison into the after run', fs.existsSync(path.join(after, 'COMPREHENSION-COMPARISON.md')) && fs.existsSync(path.join(after, 'comprehension.json')));
    const p1 = X.judgePlan(before, after), p2 = X.judgePlan(before, after);
    check('judge plan is reproducible (same approval code, same A/B order)', p1.code === p2.code && p1.items[0].afterIsA === p2.items[0].afterIsA);
    check('judge plan estimates a positive upper bound', p1.upperUsd > 0);
  }finally{ fs.rmSync(tmp, { recursive:true, force:true }); }

  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0)).catch(e => { console.error(e); process.exit(1); });
