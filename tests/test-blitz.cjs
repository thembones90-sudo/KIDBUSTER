'use strict';
const { extractKidbusterCore } = require('./helpers/extract-core.cjs');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = function run(){
  const KidbusterCore = extractKidbusterCore();
  const { check, getFailures } = createChecker();

  console.log('\n=== test-blitz.cjs ===');

  console.log('\n1) Blitz is registered correctly in PROTOCOLS, and the pool is the new Focus x Voice structure');
  check('PROTOCOLS.BLITZ exists', !!KidbusterCore.PROTOCOLS.BLITZ);
  check('PROTOCOLS.BLITZ.label is "Blitz ⚡"', KidbusterCore.PROTOCOLS.BLITZ.label === 'Blitz ⚡');
  const focusKeys = Object.keys(KidbusterCore.BLITZ_MODEL_POOL);
  check('BLITZ_MODEL_POOL has exactly 10 Focus entries', focusKeys.length === 10);
  check('BLITZ_VOICES lists exactly warm/simple/polished, in that order', JSON.stringify(KidbusterCore.BLITZ_VOICES) === JSON.stringify(['warm', 'simple', 'polished']));
  check('BLITZ_DEFAULT_VOICE is "warm"', KidbusterCore.BLITZ_DEFAULT_VOICE === 'warm');
  focusKeys.forEach(key => {
    const focus = KidbusterCore.BLITZ_MODEL_POOL[key];
    check(key + ' has a label', typeof focus.label === 'string' && focus.label.length > 0);
    KidbusterCore.BLITZ_VOICES.forEach(voice => {
      check(key + '.' + voice + ' is a non-empty string', typeof focus[voice] === 'string' && focus[voice].length > 0);
    });
  });

  console.log('\n2) Exactly one Focus is selected per generation, never blended (Voice held constant at the default here)');
  {
    const seenKeys = new Set();
    for(let i = 0; i < 60; i++){
      const prompt = KidbusterCore.buildBlitzSystemPrompt({});
      // Count how many of the 10 focuses' warm text (the default voice) appears verbatim in the prompt.
      const matches = focusKeys.filter(key => prompt.includes(KidbusterCore.BLITZ_MODEL_POOL[key].warm));
      if(matches.length === 1) seenKeys.add(matches[0]);
      check('Call ' + i + ': exactly one focus\'s text present (found ' + matches.length + ')', matches.length === 1);
      if(matches.length !== 1) break; // stop spamming failures if something is fundamentally wrong
    }
    check('Randomness actually varies across calls (saw >1 distinct focus in 60 calls)', seenKeys.size > 1);
    console.log('  (distinct focuses seen across 60 calls: ' + seenKeys.size + '/10)');
  }

  console.log('\n3) forcedModelKey override works for Focus (test-only path), independent of Voice');
  focusKeys.forEach(key => {
    const focus = KidbusterCore.BLITZ_MODEL_POOL[key];
    const prompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: key });
    check('forcedModelKey=' + key + ' -> prompt contains that focus\'s default (warm) text', prompt.includes(focus.warm));
    check('forcedModelKey=' + key + ' -> prompt contains its label', prompt.includes('Model: ' + focus.label));
    const otherFocusesPresent = focusKeys.filter(other => other !== key && prompt.includes(KidbusterCore.BLITZ_MODEL_POOL[other].warm));
    check('forcedModelKey=' + key + ' -> no other focus\'s text present', otherFocusesPresent.length === 0);
  });

  console.log('\n4) Voice selection: Focus + Voice together determine which single text gets injected');
  {
    const focus = KidbusterCore.BLITZ_MODEL_POOL.balanced;
    const warmPrompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'balanced', voice: 'warm' });
    check('voice: warm -> injects the warm text', warmPrompt.includes(focus.warm));
    check('voice: warm -> does NOT inject simple or polished text', !warmPrompt.includes(focus.simple) && !warmPrompt.includes(focus.polished));

    const simplePrompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'balanced', voice: 'simple' });
    check('voice: simple -> injects the simple text', simplePrompt.includes(focus.simple));
    check('voice: simple -> does NOT inject warm or polished text', !simplePrompt.includes(focus.warm) && !simplePrompt.includes(focus.polished));

    const polishedPrompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'balanced', voice: 'polished' });
    check('voice: polished -> injects the polished text', polishedPrompt.includes(focus.polished));
    check('voice: polished -> does NOT inject warm or simple text', !polishedPrompt.includes(focus.warm) && !polishedPrompt.includes(focus.simple));

    const noVoiceGiven = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'balanced' });
    check('no voice given at all -> defaults to warm', noVoiceGiven.includes(focus.warm));

    const invalidVoice = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'balanced', voice: 'nonexistent-voice' });
    check('unrecognized voice value -> fails safe to warm rather than crashing', invalidVoice.includes(focus.warm));

    // The label is Focus-only — it must not vary by Voice, since Voice is
    // purely a change in how the SAME focus sounds, not a different focus.
    check('label is identical across all 3 voices for the same focus', warmPrompt.includes('Model: Balanced') && simplePrompt.includes('Model: Balanced') && polishedPrompt.includes('Model: Balanced'));
  }

  console.log('\n5) All 30 example texts (10 Focus x 3 Voice) are short, fact-free skeletons (V1.2)');
  {
    const banned = ['performed well', 'completed successfully', 'developed english skills', 'continued developing', 'demonstrated understanding', 'superstar', 'rockstar'];
    focusKeys.forEach(key => {
      KidbusterCore.BLITZ_VOICES.forEach(voice => {
        const text = KidbusterCore.BLITZ_MODEL_POOL[key][voice];
        const wc = text.trim().split(/\s+/).filter(Boolean).length;
        // V1.2: examples model short notes; every fact is a [slot] filled from the notes.
        check(key + '.' + voice + ' is 20-55 words (found ' + wc + ')', wc >= 20 && wc <= 55);
        check(key + '.' + voice + ' has [Student], [topics] and at least one notes slot', text.includes('[Student]') && text.includes('[topics]') && (text.match(/\[[^\]]+\]/g) || []).length >= 3);
        check(key + '.' + voice + ' makes no history, group or unsupported-skill claim',
          !/lessons? ago|recent (classes|lessons)|usual dip|whole class|every (activity|lesson)|(than|as) before|explained once|listened|pronunciation|fluen|confidence|\u2014/i.test(text.replace(/\[[^\]]*\]/g, '')));
        const foundBanned = banned.filter(b => text.toLowerCase().includes(b));
        check(key + '.' + voice + ' avoids corporate/exaggerated phrasing', foundBanned.length === 0);
        check(key + '.' + voice + ' contains no literal emoji (Blitz forbids emoji entirely, including in its own examples)', !/\p{Extended_Pictographic}/u.test(text));
      });
    });
  }

  console.log('\n6) Prompt contains no leftover tokens and no rating/length-tier concepts');
  {
    const prompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'standard' });
    check('no leftover __BLITZ_MODEL_LABEL__ token', !prompt.includes('__BLITZ_MODEL_LABEL__'));
    check('no leftover __BLITZ_MODEL_TEXT__ token', !prompt.includes('__BLITZ_MODEL_TEXT__'));
    check('describes the adaptive length (V1.2) and never pads', prompt.includes('LENGTH (ADAPTIVE)') && prompt.includes('Never pad'));
    check('mentions the 150-word hard limit', prompt.includes('150 words'));
  }

  console.log('\n7) buildUserMessage: Blitz rating is optional (V1.2), every other rated protocol keeps its Rating line');
  {
    const blitzMsg = KidbusterCore.buildUserMessage({ studentName:'Sam', notes:'practiced past tense', rating:'4', protocol:'BLITZ' });
    check('Blitz user message has a "Rating:" line when a rating was chosen', blitzMsg.includes('Rating: 4/5'));
    const unrated = KidbusterCore.buildUserMessage({ studentName:'Sam', notes:'practiced past tense', protocol:'BLITZ' });
    check('Blitz without a rating sends no Rating line (no invented 3/5)', !/Rating:/.test(unrated));
    check('Blitz user message carries the suggested length', /Suggested length for this comment: \d+-\d+ words/.test(unrated));
    check('Blitz user message still has Student/notes', blitzMsg.includes('Student: Sam') && blitzMsg.includes('practiced past tense'));

    const maMsg = KidbusterCore.buildUserMessage({ studentName:'Sam', notes:'practiced past tense', rating:'4', protocol:'MA' });
    check('MA user message still has "Rating:" line', maMsg.includes('Rating: 4/5'));
  }

  console.log('\n8) Validator: word count target/ceiling');
  function words(n){ return new Array(n).fill('word').join(' '); }
  {
    const tooLong = words(160);
    const warnTooLong = KidbusterCore.analyzeBlitzOutput(tooLong);
    check('160 words -> CRITICAL over 150-word hard limit', warnTooLong.some(w => w.includes('CRITICAL') && w.includes('150')));

    const overTarget = words(135);
    const warnOverTarget = KidbusterCore.analyzeBlitzOutput(overTarget);
    check('135 words -> soft warning over the range, not CRITICAL', warnOverTarget.some(w => w.includes('over the suggested 30-120')) && !warnOverTarget.some(w => w.includes('CRITICAL')));

    const tooShort = words(20);
    const warnTooShort = KidbusterCore.analyzeBlitzOutput(tooShort);
    check('20 words -> advisory warning under the range', warnTooShort.some(w => w.includes('under the suggested 30-120')) && !warnTooShort.some(w => w.includes('CRITICAL')));

    const justRight = words(100);
    const warnJustRight = KidbusterCore.analyzeBlitzOutput(justRight);
    check('100 words -> no length warning at all', !warnJustRight.some(w => w.includes('word')));
  }

  console.log('\n9) Validator: no emojis');
  {
    const withEmoji = words(90) + ' 🎉';
    const warn = KidbusterCore.analyzeBlitzOutput(withEmoji);
    check('comment with an emoji -> flagged', warn.some(w => w.includes('emoji')));

    const withoutEmoji = words(90);
    const warnClean = KidbusterCore.analyzeBlitzOutput(withoutEmoji);
    check('comment without emoji -> NOT flagged for emoji', !warnClean.some(w => w.includes('emoji')));
  }

  console.log('\n10) Validator: no bullet points or headings');
  {
    const withBullet = 'Great lesson.\n- practiced verbs\n- did homework\n' + words(80);
    check('bulleted list -> flagged', KidbusterCore.analyzeBlitzOutput(withBullet).some(w => w.includes('bullet')));

    const withNumberedList = 'Great lesson.\n1. practiced verbs\n2. did homework\n' + words(80);
    check('numbered list -> flagged as bullet-like', KidbusterCore.analyzeBlitzOutput(withNumberedList).some(w => w.includes('bullet')));

    const withHeading = '## Summary\n' + words(90);
    check('markdown heading -> flagged', KidbusterCore.analyzeBlitzOutput(withHeading).some(w => w.includes('heading')));

    const plain = words(90);
    const warnPlain = KidbusterCore.analyzeBlitzOutput(plain);
    check('plain prose -> NOT flagged for bullets or headings', !warnPlain.some(w => w.includes('bullet') || w.includes('heading')));
  }

  console.log('\n11) Validator: leftover placeholder detection');
  {
    const withPlaceholder = 'Great job today, [Student]! ' + words(85);
    const warn = KidbusterCore.analyzeBlitzOutput(withPlaceholder);
    check('literal [Student] left in output -> flagged', warn.some(w => w.includes('placeholder') && w.includes('[Student]')));

    const filled = 'Great job today, Oscar! ' + words(85);
    const warnFilled = KidbusterCore.analyzeBlitzOutput(filled);
    check('placeholder properly filled in -> NOT flagged', !warnFilled.some(w => w.includes('placeholder')));
  }

  console.log('\n12) PROTOCOLS.BLITZ.analyze wraps analyzeBlitzOutput correctly (ignores rating/teacher/lengthFormat args)');
  {
    const text = words(100);
    const viaProtocol = KidbusterCore.PROTOCOLS.BLITZ.analyze(text, '4', 'Nina', 'short');
    const direct = KidbusterCore.analyzeBlitzOutput(text);
    check('PROTOCOLS.BLITZ.analyze gives same result regardless of extra args', JSON.stringify(viaProtocol) === JSON.stringify(direct));
  }

  console.log('\n13) Shuffle bag: all 10 focuses used once before any repeat (Voice is independent of this and never affects it)');
  {
    const allFocusKeys = Object.keys(KidbusterCore.BLITZ_MODEL_POOL);
    function matchFocus(prompt){
      return allFocusKeys.filter(key => prompt.includes(KidbusterCore.BLITZ_MODEL_POOL[key].warm));
    }

    KidbusterCore.resetBlitzShuffleBag();
    const seenInCycle = [];
    for(let i = 0; i < 10; i++){
      const prompt = KidbusterCore.buildBlitzSystemPrompt({});
      const matches = matchFocus(prompt);
      seenInCycle.push(matches.length === 1 ? matches[0] : null);
    }
    const uniqueInCycle = new Set(seenInCycle.filter(Boolean));
    check('10 draws after reset -> exactly 10 distinct focuses, no repeats', uniqueInCycle.size === 10 && seenInCycle.every(Boolean));

    // 11th draw must come from a freshly reshuffled bag (i.e. still a valid focus)
    const prompt11 = KidbusterCore.buildBlitzSystemPrompt({});
    const match11 = matchFocus(prompt11);
    check('11th draw (bag refilled) -> still exactly one valid focus', match11.length === 1);

    // Run several full cycles and confirm every cycle of 10 is a full permutation
    KidbusterCore.resetBlitzShuffleBag();
    let allCyclesClean = true;
    for(let cycle = 0; cycle < 5; cycle++){
      const cycleKeys = [];
      for(let i = 0; i < 10; i++){
        const prompt = KidbusterCore.buildBlitzSystemPrompt({});
        const matches = matchFocus(prompt);
        if(matches.length !== 1){ allCyclesClean = false; break; }
        cycleKeys.push(matches[0]);
      }
      if(new Set(cycleKeys).size !== 10) allCyclesClean = false;
    }
    check('5 consecutive cycles of 10 draws -> each cycle is a full, repeat-free permutation', allCyclesClean);
  }

  console.log('\n14) Adaptive word count (V1.2): range follows the notes, 150 hard ceiling');
  {
    const sparse = 'John was great today. Thanks.';
    const rich = 'Practised past simple irregular verbs went saw ate bought; read a short market story aloud; bought still difficult; strong storytelling about weekend park trip; asked good questions; needs article practice; homework idea review verbs list';
    check('sparse notes -> 30-55 words suggested', JSON.stringify(KidbusterCore.blitzLengthBand(sparse, '', 'John')) === JSON.stringify({ min: 30, max: 55 }));
    check('repeated words do not raise the range', JSON.stringify(KidbusterCore.blitzLengthBand('good good very good good lesson good', '', 'Sam')) === JSON.stringify({ min: 30, max: 55 }));
    check('informative notes -> 85-120 words suggested', KidbusterCore.blitzLengthBand(rich, '', 'Lucas').max === 120);
    check('special remarks count as information', KidbusterCore.blitzLengthBand(sparse, 'Distracted, interrupted often, animals topic, answered few questions, tried hard', 'John').min > 30);
    check('40 words for sparse notes -> no length warning', !KidbusterCore.analyzeBlitzOutput(words(40), 'Layne', '', sparse, '', 'John').some(w => w.includes('word')));
    check('90 words for sparse notes -> advisory over-range warning, not CRITICAL', KidbusterCore.analyzeBlitzOutput(words(90), 'Layne', '', sparse, '', 'John').some(w => w.includes('over the suggested 30-55')) && !KidbusterCore.analyzeBlitzOutput(words(90), 'Layne', '', sparse, '', 'John').some(w => w.includes('CRITICAL')));
    const at135 = words(135);
    const warn135 = KidbusterCore.analyzeBlitzOutput(at135, 'Layne', '', rich, '', 'Lucas');
    check('135 words for rich notes -> over-range warning, not CRITICAL', warn135.some(w => w.includes('over the suggested 85-120')) && !warn135.some(w => w.includes('CRITICAL')));

    const at160 = words(160);
    check('160 words -> still CRITICAL over 150 hard ceiling (unchanged)', KidbusterCore.analyzeBlitzOutput(at160).some(w => w.includes('CRITICAL') && w.includes('150')));

    const prompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'standard' });
    check('prompt no longer imposes a fixed "70-120 words" target', !prompt.includes('70-120 words'));
    check('prompt no longer says the old "80-120 words"', !prompt.includes('80-120 words'));
  }

  console.log('\n15) Anti-copying: prompt instruction + validator safety net');
  {
    const prompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'standard' });
    check('prompt contains "Never copy the selected model verbatim"', prompt.includes('Never copy the selected model verbatim'));
    check('prompt tells the model to rewrite using this lesson\'s own evidence', prompt.includes('naturally rewriting every sentence using this lesson\'s own evidence'));

    // A near-verbatim reproduction of the Standard (warm) model (only the
    // bracketed parts changed) should be caught by the shingle-matching
    // safety net — using the CURRENT warm library text directly, so this
    // test doesn't silently stop testing anything real if the library is
    // ever revised again.
    const standardWarm = KidbusterCore.BLITZ_MODEL_POOL.standard.warm;
    const copiedComment = standardWarm.split('[Student]').join('Oscar').split('[topics]').join('animal vocabulary');
    const warnCopied = KidbusterCore.analyzeBlitzOutput(copiedComment);
    check('near-verbatim copy of the Standard model -> flagged', warnCopied.some(w => w.includes('reproduces wording') && w.includes('Standard')));

    // The same check must also catch copying from a DIFFERENT voice of the
    // same focus, or a different focus entirely — not just whichever one
    // happens to be "Standard warm".
    const balancedPolished = KidbusterCore.BLITZ_MODEL_POOL.balanced.polished;
    const copiedFromPolished = balancedPolished.split('[Student]').join('Maya').split('[topics]').join('past tense');
    const warnCopiedPolished = KidbusterCore.analyzeBlitzOutput(copiedFromPolished);
    check('near-verbatim copy of a DIFFERENT focus/voice (Balanced, polished) -> also flagged', warnCopiedPolished.some(w => w.includes('reproduces wording') && w.includes('Balanced') && w.includes('polished')));

    // A genuinely rewritten comment inspired by the same model's structure
    // should NOT trip the check.
    const rewrittenComment = "Oscar had a strong lesson today, working through animal vocabulary with real focus and energy. He grasped the core ideas quickly and applied them confidently during our activities. Going forward, a bit more review of the trickier words at home would help lock things in. Nice progress overall, and I'm looking forward to building on it next time.";
    const warnRewritten = KidbusterCore.analyzeBlitzOutput(rewrittenComment);
    check('genuinely rewritten comment (same topic, different wording) -> NOT flagged for copying', !warnRewritten.some(w => w.includes('reproduces wording')));
  }

  console.log('\n16) Lesson Evidence Rule: Blitz formally supports any evidence type, not just a full transcript');
{
  const prompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'standard' });
  check('has a named "LESSON EVIDENCE RULE (IMMUTABLE)" section', prompt.includes('LESSON EVIDENCE RULE (IMMUTABLE)'));
  check('explicitly lists transcript/teacher notes/summary/bullet points/combination as valid evidence', prompt.includes('a full transcript,') && prompt.includes('teacher notes,') && prompt.includes('a short lesson summary,') && prompt.includes('bullet points,') && prompt.includes('or any combination of these'));
  check('says to treat supplied evidence as the complete factual record of the lesson', prompt.includes('Treat all supplied lesson evidence as the complete factual record of the lesson'));
  check('explicitly rules out inventing behavioral observations, not just activities/vocabulary', prompt.includes('achievements, strengths, weaknesses, or behavioral observations'));
  check('says brief evidence should produce a naturally simpler comment, not filled-in assumptions', prompt.includes('generate a naturally simpler comment rather than filling missing information with assumptions'));
  check('design goal: explicitly states there is no separate manual mode', prompt.includes('There is no separate "manual mode"'));
  check('updated core rule uses the exact specified wording', prompt.includes('Use only information supported by the supplied lesson evidence. Lesson evidence may consist of a transcript, teacher notes, a short lesson summary, bullet points, or any combination of these. Never invent information beyond what the supplied evidence reasonably supports.'));
}

  console.log('\n17) Safe Inference Principle: the exact worked example is present, with correct safe/unsafe lists');
{
  const prompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'standard' });
  check('has a named "SAFE INFERENCE PRINCIPLE" section', prompt.includes('SAFE INFERENCE PRINCIPLE'));
  check('includes the exact Timmy example evidence', prompt.includes('Timmy was great today. We did a lesson about colors and animals. He was very interested and we had a lot of fun.'));
  check('lists all 4 safe conclusions', ['Timmy participated well.', 'Lesson topics were colors and animals.', 'The atmosphere was positive.', 'The student was engaged.'].every(s => prompt.includes(s)));
  check('lists all 5 unsafe conclusions as things NOT to assume', ['Pronunciation improved.', 'Present Simple was practiced.', 'Reading exercises were completed.', 'Speaking confidence increased.', 'Vocabulary retention was excellent.'].every(s => prompt.includes(s)));
  check('validation checklist has a matching Safe Inference line', prompt.includes('Conclusions drawn are safe inferences from the supplied evidence, per the Safe Inference Principle'));
}

  console.log('\n18) Terminology consistency: "lesson evidence" replaces bare "notes"/"transcript" framing throughout, in both the prompt and the outgoing user message');
{
  const prompt = KidbusterCore.buildBlitzSystemPrompt({ forcedModelKey: 'standard' });
  check('no leftover "lesson transcript" phrasing implying evidence must be a full transcript', !prompt.includes('lesson transcript'));
  check('no leftover "the transcript actually supports" phrasing', !prompt.includes('the transcript actually supports'));
  // V1.2: no invented participation fallback; short notes give a short comment.
  check('participation is claimed only when the notes say so', prompt.includes('If the notes say nothing about participation, effort or a specific strength, do not claim any.') && !prompt.includes('are safe and appropriate when nothing more specific was given'));
  check('short notes produce a short, graceful comment, never padding', prompt.includes('a short, honest, graceful comment is the correct result for short notes'));

  const msg = KidbusterCore.buildUserMessage({ studentName: 'Sam', notes: 'x', rating: '4', protocol: 'BLITZ' });
  check('outgoing user message now labels this "Lesson evidence", not "Lesson notes"', msg.includes('Lesson evidence ('));
  check('outgoing user message explains it may be transcript/notes/summary/bullet points/combination', msg.includes('teacher notes, a short summary, bullet points, or any combination'));
}

return getFailures();
};

if(require.main === module){
  const failures = module.exports();
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
