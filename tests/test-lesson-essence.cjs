'use strict';
// Protocol audit (2026-10-24): the model must see who said what, every
// protocol must be told to build the report around what mattered most, Blitz's
// randomly picked writing model must never set the angle, and claims about
// earlier lessons the evidence never shows are sent through the one repair.
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-lesson-essence.cjs ===');
  const old = process.env.KIDBUSTER_TEST_KV;
  process.env.KIDBUSTER_TEST_KV = '1';
  try{
    const m = await import('../api/_lib/server-generation.js');
    const log = console.log;
    const quiet = fn => { console.log = () => {}; try{ return fn(); } finally{ console.log = log; } };
    const evidence = (notes, protocol = 'MA') => {
      const g = quiet(() => m.buildServerGeneration({ protocol, teacherName: 'Layne', studentName: 'Mia', notes, rating: '4', studentGender: 'she' }));
      return g.userMessage.slice(g.userMessage.search(/\n(Krisp notes|Lesson evidence)/)).split('\n').slice(2).join('\n').trim();
    };

    // Speaker attribution reaches the model.
    const scout = evidence('[00:01] TEACHER: What animal do you like?\n[00:04] STUDENT: I like cats.\n[00:07] TEACHER: Say "I like dogs".\n[00:09] STUDENT: I like dogs.');
    check('Scout transcript keeps Teacher/Student labels', scout === 'Teacher: What animal do you like?\nStudent: I like cats.\nTeacher: Say "I like dogs".\nStudent: I like dogs.');
    check('typed Teacher:/Student: labels are kept', evidence('Teacher: Hello.\nStudent: Hi.') === 'Teacher: Hello.\nStudent: Hi.');
    check('Tutor is normalized to Teacher', evidence('tutor - Ready?\nstudent: Yes.') === 'Teacher: Ready?\nStudent: Yes.');
    check('numbered speakers keep their numbers', evidence('Speaker 1: Hi.\nSpeaker 2: Hello.') === 'Speaker 1: Hi.\nSpeaker 2: Hello.');
    check('a bare "Speaker:" label carries no identity and is removed', evidence('Speaker: Hello there.') === 'Hello there.');
    check('consecutive lines of one speaker merge into one turn',
      evidence('[00:01] TEACHER: Okay.\n[00:02] TEACHER: What do you like?\n[00:03] STUDENT: Cats.') === 'Teacher: Okay. What do you like?\nStudent: Cats.');
    check('a line left empty after noise removal is dropped', evidence('[00:01] STUDENT: [inaudible]\n[00:02] TEACHER: Again?') === 'Teacher: Again?');
    check('an unlabelled teacher note stays its own line', evidence('Teacher: Read.\nShe was tired today.\nStudent: OK.') === 'Teacher: Read.\nShe was tired today.\nStudent: OK.');
    check('"teacher" inside a sentence is untouched', evidence('My teacher: she is kind, said Mia.') === 'My teacher: she is kind, said Mia.');
    check('Krisp name headers still become Teacher/Student', evidence('Layne | 00:01\nHi Mia.\nMia | 00:03\nHello.\nLayne | 00:05\nReady?\nMia | 00:06\nYes.') === 'Teacher: Hi Mia.\nStudent: Hello.\nTeacher: Ready?\nStudent: Yes.');

    // Every protocol carries the essence rules.
    const cases = { MA: { rating: '4' }, MS: { rating: '4' }, FAIRY: { rating: '4' }, BLITZ: { rating: '4' },
      BEIDA: { rating: 'excellent' }, OF: { rating: 'Medium', studentGender: 'girl' }, PREPLY: { rating: '' } };
    for(const [protocol, extra] of Object.entries(cases)){
      const g = quiet(() => m.buildServerGeneration({ teacherName: 'Layne', studentName: 'Mia', notes: 'Teacher: Hi.\nStudent: Hi.', protocol, studentGender: 'she', ...extra }));
      check(protocol + ' prompt carries the lesson essence rules', g.systemPrompt.includes('LESSON ESSENCE RULES') && g.systemPrompt.includes('what mattered most')
        && g.systemPrompt.indexOf('EVIDENCE GROUNDING RULES') < g.systemPrompt.indexOf('LESSON ESSENCE RULES')
        && g.systemPrompt.indexOf('LESSON ESSENCE RULES') < g.systemPrompt.indexOf('HUMAN VOICE RULES'));
    }

    // Blitz: every writing model is framed as voice only.
    const fs = require('node:fs'), path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const core = new Function(html.slice(html.indexOf('const KidbusterCore = (function(){'), html.indexOf('\n})();', html.indexOf('const KidbusterCore = (function(){')) + 6) + '\nreturn KidbusterCore;')();
    const keys = Object.keys(core.PROTOCOLS.BLITZ.models);
    const blitz = keys.map(k => quiet(() => core.PROTOCOLS.BLITZ.buildSystemPrompt({ forcedModelKey: k, voice: 'warm' })));
    check('every Blitz writing model sets voice only, never the angle', keys.length === 10 && blitz.every(p => /picked at random, so it sets voice and rhythm only, never the angle/.test(p) && /a few lessons ago/.test(p)));

    // History claims are repaired unless the lesson itself shows them.
    const history = (text, notes = 'Teacher: Today we read about animals.\nStudent: I like cats.') =>
      m.evaluateGeneratedOutput('BLITZ', text, { protocol: 'BLITZ', teacherName: 'Layne', studentName: 'Mia', rating: '4', notes }).blocking.filter(b => b.code === 'history_claim');
    const claims = history('Mia read about animals. Things that felt tricky a few lessons ago are easier now, as always.');
    check('claims about earlier lessons are flagged for the repair', claims.length === 1 && /a few lessons/.test(claims[0].message) && /as always/.test(claims[0].message) && claims[0].repairable === true);
    check('"every lesson" and "recent classes" are flagged', history('She does this every lesson, as in recent classes.').length === 1);
    check('a this-lesson-only comment passes', history('Mia read the animal story and said "I like cats" on her own.').length === 0);
    check('history the lesson itself mentions is not flagged', history('We reviewed the words from last lesson.', 'Teacher: Let us review the words from last lesson.\nStudent: Cat, dog.').length === 0);
    check('the repair prompt names the history claim', /earlier lessons/.test(m.buildRepairMessage('BLITZ', 'As always, Mia read well.',
      m.evaluateGeneratedOutput('BLITZ', 'As always, Mia read well.', { protocol: 'BLITZ', teacherName: 'Layne', studentName: 'Mia', rating: '4', notes: 'x' }),
      { protocol: 'BLITZ', teacherName: 'Layne', studentName: 'Mia', rating: '4', studentGender: 'she', blitzVoice: 'warm', preplyModule: 'adult', preplyTrialPerson: 'adult' })));
  }catch(e){ console.error('lesson essence test:', e.stack || e); check('lesson essence scenario completed', false); }
  finally{ if(old === undefined) delete process.env.KIDBUSTER_TEST_KV; else process.env.KIDBUSTER_TEST_KV = old; }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
