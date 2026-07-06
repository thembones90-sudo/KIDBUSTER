'use strict';
const { extractKidbusterCore } = require('./helpers/extract-core.cjs');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = function run(){
  const KidbusterCore = extractKidbusterCore();
  const { check, getFailures } = createChecker();

  console.log('\n=== test-wolf-emoji.cjs ===');

  console.log('\n1) Prompt-level: wolf emoji present for Layne, stripped for anyone else');
  {
    const promptLayne = KidbusterCore.buildMASystemPrompt({ rating: '4', lengthFormat: 'long' });
    const promptLayneIdentity = KidbusterCore.applyTeacherIdentity(promptLayne, 'Layne');
    check('Layne (explicit) -> prompt still contains 🐺', promptLayneIdentity.includes('🐺'));

    const promptDefault = KidbusterCore.applyTeacherIdentity(promptLayne, '');
    check('empty teacher name -> defaults to Layne, prompt still contains 🐺', promptDefault.includes('🐺'));

    const promptNina = KidbusterCore.applyTeacherIdentity(promptLayne, 'Nina');
    check('Nina -> prompt no longer contains 🐺', !promptNina.includes('🐺'));
    check('Nina -> prompt now says "Teacher Nina"', promptNina.includes('Teacher Nina'));
    check('Nina -> no leftover "Layne" anywhere', !promptNina.includes('Layne'));
  }

  console.log('\n2) Validator: expects the wolf emoji only for Layne');
  function makeReport(teacherLine){
    return [
      'Hi Sam!', '', "Today's Lesson:", '📚 Test', '',
      'Key Vocabulary with Pronunciation & Notes:', '', 'word 🐑 – def | Pronunciation: WERD | Note: ok', '',
      'Grammar & Sentence Practice:', '', '"Example one."', '"Example two."', '"Example three."', '',
      "Today's Superpower:", '🦸 Speaking', '', 'Great job!', '', 'Mini Homework:', '', 'Vocabulary Mission 🎯', 'Task.', '',
      'Total Stars Today:', '⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐', '', 'Cheers,', teacherLine
    ].join('\n');
  }
  {
    const reportLayne = makeReport('Teacher Layne 🐺');
    const warnLayne = KidbusterCore.PROTOCOLS.MA.analyze(reportLayne, '4', 'Layne', 'long');
    check('Layne + "Teacher Layne 🐺" -> sign-off NOT flagged', !warnLayne.some(w => w.includes('sign-off')));

    const reportLayneNoEmoji = makeReport('Teacher Layne');
    const warnLayneNoEmoji = KidbusterCore.PROTOCOLS.MA.analyze(reportLayneNoEmoji, '4', 'Layne', 'long');
    check('Layne + missing 🐺 -> sign-off IS flagged (emoji required for Layne)', warnLayneNoEmoji.some(w => w.includes('sign-off')));

    const reportNinaNoEmoji = makeReport('Teacher Nina');
    const warnNinaNoEmoji = KidbusterCore.PROTOCOLS.MA.analyze(reportNinaNoEmoji, '4', 'Nina', 'long');
    check('Nina + "Teacher Nina" (no emoji) -> sign-off NOT flagged', !warnNinaNoEmoji.some(w => w.includes('sign-off')));

    const reportNinaWithEmoji = makeReport('Teacher Nina 🐺');
    const warnNinaWithEmoji = KidbusterCore.PROTOCOLS.MA.analyze(reportNinaWithEmoji, '4', 'Nina', 'long');
    check('Nina + "Teacher Nina 🐺" -> sign-off IS flagged (emoji not allowed for non-Layne)', warnNinaWithEmoji.some(w => w.includes('sign-off')));
  }

  console.log('\n3) Sweet Voice (MS) is unaffected — always expects 💖 regardless of teacher');
  {
    const msPromptNina = KidbusterCore.applyTeacherIdentity(
      KidbusterCore.buildSweetSystemPrompt({ rating: '4', lengthFormat: 'long' }),
      'Nina'
    );
    check('MS prompt for Nina still contains 💖', msPromptNina.includes('💖'));

    function makeMSReport(teacherLine){
      return [
        'Hi Sam!', '', "Today's Lesson:", '📚 Test', '',
        'Key Vocabulary with Pronunciation & Notes:', '', 'word 🐑 – def | Pronunciation: WERD | Note: ok', '',
        'Grammar & Sentence Practice:', '', '"Example one."', '"Example two."', '"Example three."', '',
        'Positive Feedback', '', 'Great job!', '', 'Mini Homework:', '', 'Vocabulary Mission 🎯', 'Task.', '',
        'Total Stars Today:', '⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐', '', 'Love,', teacherLine
      ].join('\n');
    }
    const msReportNina = makeMSReport('Teacher Nina 💖');
    const warnMS = KidbusterCore.PROTOCOLS.MS.analyze(msReportNina, '4', 'Nina', 'long');
    check('MS + Nina + "Teacher Nina 💖" -> sign-off NOT flagged (MS unaffected by this rule)', !warnMS.some(w => w.includes('sign-off')));
  }

  return getFailures();
};

if(require.main === module){
  const failures = module.exports();
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
