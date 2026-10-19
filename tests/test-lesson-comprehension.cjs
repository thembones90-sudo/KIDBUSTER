'use strict';
const { extractKidbusterCore } = require('./helpers/extract-core.cjs');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = function run(){
  const core = extractKidbusterCore();
  const {check, getFailures} = createChecker();
  console.log('\n=== lesson comprehension / transcript role preservation ===');

  const radar = [
    '[00:00] TEACHER: What matters most to you?',
    '[00:01] STUDENT: Time with my family.',
    '[00:03] STUDENT: And freedom to travel.',
    '[00:04] TEACHER: What about your career?',
    '[00:06] STUDENT: It supports that freedom.',
    '[00:07] UNCLEAR: possibly overlapping speech',
    '[00:08] STUDENT: We should practice interviews next time.'
  ].join('\n');
  const result = core.cleanTranscript(radar);
  check('RADAR VAN teacher preserved with original elapsed marker', result.includes('[00:00] Teacher: What matters most to you?'));
  check('RADAR VAN student preserved with elapsed marker', result.includes('[00:01] Student: Time with my family.'));
  check('same-speaker fragments joined without losing words', result.includes('Time with my family. And freedom to travel.'));
  check('teacher turn remains distinct from student turn', result.includes('\n[00:04] Teacher: What about your career?'));
  check('unclear role is not credited to the student', result.includes('Unclear: possibly overlapping speech'));
  check('next-lesson request remains present', result.includes('We should practice interviews next time.'));

  const mixed = core.cleanTranscript([
    '[00:00] STUDENT: Good morning.',
    '[00:01] STUDENT: I have questions.',
    'unlabelled ambiguous words',
    '[00:02] TEACHER: Go ahead.',
    '[00:03] STUDENT: Thank you.'
  ].join('\n'));
  check('unlabelled text never silently attributed to preceding student',
    mixed.includes('Unclear: unlabelled ambiguous words') && !mixed.includes('Student: Good morning. I have questions. unlabelled ambiguous words'));

  const plain = core.cleanTranscript([
    'Teacher: How was work?',
    'Student: Busy today.',
    'Student: My colleague joined.',
    'Teacher: Tell me more.'
  ].join('\n'));
  check('plain role labels preserved', /Teacher: How was work\?\nStudent: Busy today\. My colleague joined\.\nTeacher: Tell me more\./.test(plain));

  check('unlabelled single line keeps legacy cleanup',
    core.cleanTranscript('Teacher: An example sentence.') === 'An example sentence.');
  check('speaker 1 legacy label still removed',
    core.cleanTranscript('Speaker 1: Hello there.') === 'Hello there.');
  check('noisy marker removed but other transcript evidence kept',
    core.cleanTranscript('[00:00] TEACHER: Hi.\n[00:02] STUDENT: [inaudible] I agree.\n[00:04] TEACHER: Good.') .includes('Student: I agree.'));

  const long = Array.from({length:150}, (_,i) => '[12:' + String(i%60).padStart(2,'0') + '] STUDENT: argument ' + i + ' illustrates an idea.').join('\n')
    + '\n[15:00] TEACHER: Thank you.\n[15:02] STUDENT: Thanks.';
  const longResult = core.cleanTranscript(long);
  check('long RADAR VAN student turns retain later time anchors',
    longResult.split('\n').filter(x=>x.includes('Student:')).length > 2);
  check('large transcripts preserve ending', longResult.includes('Student: Thanks.'));
  const prompt = core.buildPreplySystemPrompt({module:'adult'});
  check('Preply prompt prioritizes whole-lesson comprehension',
    prompt.includes('LESSON UNDERSTANDING') && prompt.includes('Position is not importance'));
  check('Preply prompt guards against invented unifying themes',
    prompt.includes('Never invent depth to sound insightful'));
  check('Preply preserves explicit request scope',
    prompt.includes('send some ideas') && prompt.includes('send an outline'));
  check('Preply still caps adult length at 100-170 words',
    prompt.includes('Length: 100-170 words.'));
  return getFailures();
};
module.exports.run = module.exports;
