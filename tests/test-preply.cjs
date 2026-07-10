'use strict';
const { extractKidbusterCore } = require('./helpers/extract-core.cjs');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = function run(){
  const KidbusterCore = extractKidbusterCore();
  const { check, getFailures } = createChecker();

  console.log('\n=== test-preply.cjs ===');

  console.log('\n1) Preply is registered correctly in PROTOCOLS');
  check('PROTOCOLS.PREPLY exists', !!KidbusterCore.PROTOCOLS.PREPLY);
  check('PROTOCOLS.PREPLY.label is "Preply"', KidbusterCore.PROTOCOLS.PREPLY.label === 'Preply');
  check('PREPLY_MODULES has exactly adult/parent/trial', JSON.stringify(Object.keys(KidbusterCore.PREPLY_MODULES).sort()) === JSON.stringify(['adult', 'parent', 'trial']));

  console.log('\n2) Every Module has the fields the builder/validator actually depend on');
  ['adult', 'parent', 'trial'].forEach(key => {
    const m = KidbusterCore.PREPLY_MODULES[key];
    check(key + ': has a label', typeof m.label === 'string' && m.label.length > 0);
    check(key + ': has a shortLabel', typeof m.shortLabel === 'string' && m.shortLabel.length > 0);
    check(key + ': minWords < maxWords', typeof m.minWords === 'number' && typeof m.maxWords === 'number' && m.minWords < m.maxWords);
    check(key + ': has instructions text', typeof m.instructions === 'string' && m.instructions.length > 100);
  });

  console.log('\n3) buildPreplySystemPrompt: correct Module selection, defaults, and fallback');
  {
    const defaultPrompt = KidbusterCore.buildPreplySystemPrompt({});
    check('no module given -> defaults to adult', defaultPrompt.includes('MODULE: ADULT LESSON FEEDBACK'));
    check('shared header is present in the default', defaultPrompt.includes('CORE PHILOSOPHY') && defaultPrompt.includes('LESSON EVIDENCE RULE') && defaultPrompt.includes('NATURAL LANGUAGE RULE'));

    const adultPrompt = KidbusterCore.buildPreplySystemPrompt({ module: 'adult' });
    check('module: adult -> contains only the Adult module text', adultPrompt.includes('MODULE: ADULT LESSON FEEDBACK') && !adultPrompt.includes('MODULE: PARENT FEEDBACK') && !adultPrompt.includes('MODULE: TRIAL FOLLOW-UP'));

    const parentPrompt = KidbusterCore.buildPreplySystemPrompt({ module: 'parent' });
    check('module: parent -> contains only the Parent module text', parentPrompt.includes('MODULE: PARENT FEEDBACK') && !parentPrompt.includes('MODULE: ADULT LESSON FEEDBACK') && !parentPrompt.includes('MODULE: TRIAL FOLLOW-UP'));

    const trialPrompt = KidbusterCore.buildPreplySystemPrompt({ module: 'trial' });
    check('module: trial -> contains only the Trial module text', trialPrompt.includes('MODULE: TRIAL FOLLOW-UP') && !trialPrompt.includes('MODULE: ADULT LESSON FEEDBACK') && !trialPrompt.includes('MODULE: PARENT FEEDBACK'));

    const invalidPrompt = KidbusterCore.buildPreplySystemPrompt({ module: 'not_a_real_module' });
    check('unrecognized module value -> fails safe to adult rather than crashing', invalidPrompt.includes('MODULE: ADULT LESSON FEEDBACK'));

    const noParamsPrompt = KidbusterCore.buildPreplySystemPrompt();
    check('called with no params object at all -> still works, defaults to adult', noParamsPrompt.includes('MODULE: ADULT LESSON FEEDBACK'));
  }

  console.log('\n3b) Shared philosophy text actually reflects the stated design (evidence, natural language, personalization)');
  {
    const prompt = KidbusterCore.buildPreplySystemPrompt({});
    check('names the core distinction from Classic', prompt.includes('Classic documents lessons') && prompt.includes('Preply builds relationships'));
    check('explicitly forbids emoji (a stated Non-Goal)', /no\s+emoji/i.test(prompt));
    check('explicitly forbids bullet points/headings (a message, not a report)', /no bullet points/i.test(prompt) || /no numbered lists/i.test(prompt));
    check('bans at least one named corporate/AI-toned phrase from the brief', prompt.includes('It was a pleasure') || prompt.includes('I am delighted'));
    check('includes the quality standard (\"press Send\")', /press send/i.test(prompt));
  }

  console.log('\n4) buildUserMessage: Preply never gets a fabricated Rating line, and uses the sparse-evidence framing');
  {
    const msg = KidbusterCore.buildUserMessage({ studentName: 'Marco', teacherName: 'Layne', notes: 'Worked on conditionals. Caught his own mistake twice.', rating: null, protocol: 'PREPLY' });
    check('no "Rating:" line at all', !msg.includes('Rating:'));
    check('uses the "Lesson evidence" framing (like Blitz/Beida), not "Krisp notes"', msg.includes('Lesson evidence') && !msg.includes('Krisp notes'));
    check('student name is still included', msg.includes('Marco'));

    const msgWithRemarks = KidbusterCore.buildUserMessage({ studentName: 'Marco', teacherName: 'Layne', notes: 'x', remarks: 'Mention the upcoming exam.', rating: null, protocol: 'PREPLY' });
    check('special remarks use the Blitz/Beida-style plain phrasing, not the "Teacher Notes" bridge', msgWithRemarks.includes('Special remarks to incorporate') && !msgWithRemarks.includes('"Teacher Notes"'));
  }

  console.log('\n5) analyzePreplyOutput: per-Module word count targets are genuinely independent');
  {
    const words = n => Array(n).fill('word').join(' ');

    check('adult: 130 words (within 100-170) -> no length warning', !KidbusterCore.analyzePreplyOutput(words(130), 'adult').some(w => w.includes('words')));
    check('adult: 50 words (under 100) -> under-length warning', KidbusterCore.analyzePreplyOutput(words(50), 'adult').some(w => w.includes('under')));
    check('adult: 200 words (over 170) -> over-length warning', KidbusterCore.analyzePreplyOutput(words(200), 'adult').some(w => w.includes('over')));

    check('parent: 120 words (within 90-150) -> no length warning', !KidbusterCore.analyzePreplyOutput(words(120), 'parent').some(w => w.includes('words')));
    check('parent: 160 words (over parent\'s 150 cap, but would be fine for adult) -> over-length warning', KidbusterCore.analyzePreplyOutput(words(160), 'parent').some(w => w.includes('over')));
    check('the SAME 160-word text is fine for adult (proves the ranges are truly independent per module)', !KidbusterCore.analyzePreplyOutput(words(160), 'adult').some(w => w.includes('words')));

    check('trial: 130 words (within 100-170) -> no length warning', !KidbusterCore.analyzePreplyOutput(words(130), 'trial').some(w => w.includes('words')));

    check('unrecognized module key -> falls back to adult\'s range rather than crashing', !KidbusterCore.analyzePreplyOutput(words(130), 'not_a_real_module').some(w => w.includes('words')));
  }

  console.log('\n6) analyzePreplyOutput: hard format rules (no emoji, no lists, no unfilled placeholders)');
  {
    const words = n => Array(n).fill('word').join(' ');

    check('emoji anywhere -> flagged', KidbusterCore.analyzePreplyOutput(words(120) + ' 😊', 'adult').some(w => w.includes('emoji')));
    check('clean text -> not flagged for emoji', !KidbusterCore.analyzePreplyOutput(words(120), 'adult').some(w => w.includes('emoji')));

    check('a bullet-point line -> flagged', KidbusterCore.analyzePreplyOutput('- did well today\n' + words(120), 'adult').some(w => w.includes('bullet')));
    check('a numbered-list line -> flagged', KidbusterCore.analyzePreplyOutput('1. did well today\n' + words(120), 'adult').some(w => w.includes('bullet')));
    check('plain prose -> not flagged for lists', !KidbusterCore.analyzePreplyOutput(words(120), 'adult').some(w => w.includes('bullet')));

    check('an unfilled [Student]-style placeholder -> flagged', KidbusterCore.analyzePreplyOutput('[Student] did well. ' + words(120), 'adult').some(w => w.includes('placeholder')));
    check('real text with no brackets -> not flagged for placeholders', !KidbusterCore.analyzePreplyOutput(words(120), 'adult').some(w => w.includes('placeholder')));

    check('empty output -> flagged as empty, not silently passed', KidbusterCore.analyzePreplyOutput('', 'adult').some(w => w.includes('empty')));
    check('whitespace-only output -> also flagged as empty', KidbusterCore.analyzePreplyOutput('   \n  ', 'adult').some(w => w.includes('empty')));
  }

  console.log('\n7) PROTOCOLS.PREPLY.analyze correctly threads the 7th positional arg (preplyModule) through, ignoring every other protocol\'s params');
  {
    const words = n => Array(n).fill('word').join(' ');
    // Signature: (text, lvl, teacherName, lengthFormat, studentGender, signoffEmoji, preplyModule)
    const result = KidbusterCore.PROTOCOLS.PREPLY.analyze(words(160), '5', 'Layne', 'long', 'boy', '🐺', 'parent');
    check('wrapper correctly uses position 7 as the module, applying parent\'s 150-word cap', result.some(w => w.includes('over')));
    const resultAdult = KidbusterCore.PROTOCOLS.PREPLY.analyze(words(160), '5', 'Layne', 'long', 'boy', '🐺', 'adult');
    check('same word count, module: adult -> no length warning (proves positions 2-6 are genuinely ignored, only 7 matters)', !resultAdult.some(w => w.includes('words')));
  }

  console.log('\n8) Trial Follow-up: the audience person is an explicit Fact, never left for the model to guess');
  {
    const adultTrialMsg = KidbusterCore.buildUserMessage({ studentName: 'Marco', teacherName: 'Layne', notes: 'x', protocol: 'PREPLY', preplyModule: 'trial', preplyTrialPerson: 'adult' });
    check('adult trial student -> Fact says second person, addressed directly', adultTrialMsg.includes('Trial audience') && adultTrialMsg.includes('ADULT trial student') && adultTrialMsg.includes('second person'));

    const childTrialMsg = KidbusterCore.buildUserMessage({ studentName: 'Marco', teacherName: 'Layne', notes: 'x', protocol: 'PREPLY', preplyModule: 'trial', preplyTrialPerson: 'child' });
    check('child trial student -> Fact says third person, addressed to the parent', childTrialMsg.includes('Trial audience') && childTrialMsg.includes('PARENT of a child') && childTrialMsg.includes('third person'));

    check('missing preplyTrialPerson on a trial-module message -> still defaults to the adult phrasing, not a crash', (() => {
      const msg = KidbusterCore.buildUserMessage({ studentName: 'Marco', teacherName: 'Layne', notes: 'x', protocol: 'PREPLY', preplyModule: 'trial' });
      return msg.includes('ADULT trial student');
    })());

    const adultModuleMsg = KidbusterCore.buildUserMessage({ studentName: 'Marco', teacherName: 'Layne', notes: 'x', protocol: 'PREPLY', preplyModule: 'adult', preplyTrialPerson: 'adult' });
    check('Adult MODULE (not Trial) never gets the Trial audience Fact at all', !adultModuleMsg.includes('Trial audience'));

    const parentModuleMsg = KidbusterCore.buildUserMessage({ studentName: 'Marco', teacherName: 'Layne', notes: 'x', protocol: 'PREPLY', preplyModule: 'parent', preplyTrialPerson: 'child' });
    check('Parent MODULE (not Trial) never gets the Trial audience Fact either', !parentModuleMsg.includes('Trial audience'));

    check('the Trial module\'s own prompt instructions reference the Fact rather than leaving the audience ambiguous', KidbusterCore.PREPLY_MODULES.trial.instructions.includes('specified explicitly as a Fact'));
  }

  return getFailures();
};

if(require.main === module){
  const failures = module.exports();
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
