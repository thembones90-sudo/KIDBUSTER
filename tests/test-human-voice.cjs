'use strict';
// Human voice (owner request 2026-10-24): every protocol prompt carries the
// shared HUMAN VOICE rules; stock AI phrasing and em-dash-heavy drafts are sent
// through the one compliance repair; words the lesson itself taught are exempt.
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-human-voice.cjs ===');
  const old = process.env.KIDBUSTER_TEST_KV;
  process.env.KIDBUSTER_TEST_KV = '1';
  try{
    const m = await import('../api/_lib/server-generation.js');
    const base = { teacherName: 'Layne', studentName: 'Mia', notes: 'Teacher: Today we read about animals.\nStudent: I like cats.', lengthFormat: 'long' };
    const cases = { MA: { rating: '4' }, MS: { rating: '4' }, FAIRY: { rating: '4' }, BLITZ: { rating: '4' },
      BEIDA: { rating: 'excellent' }, OF: { rating: 'Medium', studentGender: 'girl' }, PREPLY: { rating: '' } };
    const log = console.log; console.log = () => {};
    let prompts;
    try{ prompts = Object.entries(cases).map(([protocol, extra]) => [protocol, JSON.stringify(m.buildServerGeneration({ ...base, protocol, studentGender: 'she', ...extra }))]); }
    finally{ console.log = log; }
    for(const [protocol, prompt] of prompts){
      check(protocol + ' prompt carries the human voice rules', prompt.includes('HUMAN VOICE RULES') && prompt.includes('EVIDENCE GROUNDING RULES'));
    }

    const stock = (protocol, text, notes) => m.evaluateGeneratedOutput(protocol, text, { ...base, protocol, rating: '4', notes: notes ?? base.notes })
      .blocking.filter(b => b.code === 'stock_phrasing');
    const flagged = stock('BLITZ', 'Mia showcased her reading. It is a testament to her effort. Furthermore, she asked questions.');
    check('stock AI phrases are flagged for the repair', flagged.length === 1 && /showcase/.test(flagged[0].message) && /testament to/.test(flagged[0].message) && /furthermore/.test(flagged[0].message));
    check('flagged drafts are repairable (one repair attempt)', flagged.every(f => f.repairable === true));
    check('"not only ... but also" is flagged', stock('BLITZ', 'Mia not only read the story but also answered questions.').length === 1);
    check('three or more em dashes are flagged', stock('BLITZ', 'Mia read — then wrote — then spoke — well.').some(f => /em dash/.test(f.message)));
    check('one or two em dashes are tolerated', stock('BLITZ', 'Mia read the story — and asked a question.').length === 0);
    check('plain, specific writing passes', stock('BLITZ', 'Mia read the animal story aloud and said "I like cats" on her own. Next time we will practise questions with "do you".').length === 0);
    check('a word the lesson taught is not flagged', stock('BLITZ', 'We practised the new word "delve".', 'Teacher: Today\'s new word is delve.').length === 0);
    check('the same word is flagged when the lesson never used it', stock('BLITZ', 'Let us delve into the story.').length === 1);

    const repair = m.buildRepairMessage('BLITZ', 'Mia showcased her reading.', m.evaluateGeneratedOutput('BLITZ', 'Mia showcased her reading.', { ...base, protocol: 'BLITZ', rating: '4' }), { ...base, protocol: 'BLITZ', rating: '4', studentGender: 'she', blitzVoice: 'warm', preplyModule: 'adult', preplyTrialPerson: 'adult' });
    check('the repair prompt names the stock phrasing to replace', /stock phrasing/.test(repair) && /showcase/.test(repair));

    const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
    const core = html.slice(html.indexOf('const KidbusterCore = (function(){'), html.indexOf('const HUMAN_VOICE_RULES'));
    check('no protocol text requires a phrase the voice rules ban', !/\bdelv|tapestr|testament to|showcas|worth noting|in conclusion|furthermore|moreover|commendabl|exemplary|pivotal|invaluable|unwavering|meticulous|palpabl/i.test(core));
  }catch(e){ console.error('human voice test:', e.stack || e); check('human voice scenario completed', false); }
  finally{ if(old === undefined) delete process.env.KIDBUSTER_TEST_KV; else process.env.KIDBUSTER_TEST_KV = old; }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
