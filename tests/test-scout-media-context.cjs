'use strict';
// Scout Media Intelligence integration contract: no media transcript may
// masquerade as teacher/student speech inside Classbuster feedback prompts.
// Tests use the real KidbusterCore code from index.html, not a copy.
const {extractKidbusterCore} = require('./helpers/extract-core.cjs');
const {createChecker} = require('./helpers/assert.cjs');
const {parseLesson} = {};

module.exports = async function run(){
  const {check,getFailures}=createChecker();
  const core=extractKidbusterCore();
  const {buildServerGeneration}=await import('../api/_lib/server-generation.js');
  const rv=await import('../api/_lib/radar-van.js');
  const note='(Scout recording note: music detected in the computer/call audio for about 1m 12s; 6 transcript lines withheld. Who was speaking during this time could not be determined.)';
  const raw=[
    '[00:01] TEACHER: We will play a song about animals.',
    note,
    '[01:21] STUDENT: There was a lion.',
    '[01:24] TEACHER: Which other animal?',
    '[01:27] STUDENT: A monkey.'
  ].join('\n\n');
  const lesson={
    version:1, lessonId:'a23e4567-e89b-42d3-a456-426614174012',
    title:'Scout media synthetic contract',durationSeconds:100,transcript:raw
  };
  const p=rv.parseLesson(lesson);
  check('v1 server still accepts note with no new MEDIA headers',!p.error);
  const cleaned=core.cleanTranscript(raw);
  check('teacher words retain speaker identity',cleaned.includes('Teacher: We will play a song about animals.'));
  check('student response retains speaker identity',cleaned.includes('Student: There was a lion.'));
  check('media note becomes neutral nonspoken context',cleaned.includes('Media activity (not speech): Scout detected music'));
  check('media note is never prefixed Student/Teacher',!/^(?:Teacher|Student): Scout detected music/m.test(cleaned));
  check('media note does not claim learner understood',cleaned.includes('does not identify a speaker or establish student comprehension'));
  check('media note is not merged with the teacher turn',!/Teacher:[^\n]*Media activity/m.test(cleaned));
  check('no lyric text appears in the converted media note',!cleaned.includes('6 transcript lines withheld'));
  const noNote=core.cleanTranscript('[00:01] STUDENT: I can play the guitar.\n[00:02] TEACHER: Yes.');
  check('ordinary labeled speech is not converted',noNote.includes('Student: I can play the guitar.')&&!noNote.includes('Media activity'));
  const metadataOnly=core.cleanTranscript('[00:01] TEACHER: Here we go.\n'+note+'\n[00:08] STUDENT: Dog.');
  check('media note handling survives line breaks with no blank lines',metadataOnly.includes('Media activity (not speech)')&&metadataOnly.includes('Student: Dog.'));
  const options={
    MA:{rating:'3'},MS:{rating:'3'},FAIRY:{rating:'3'},BLITZ:{rating:'3'},
    BEIDA:{rating:'try_harder'},OF:{rating:'Medium'},PREPLY:{rating:''}
  };
  const base={teacherName:'Nora',studentName:'Mia',notes:cleaned,remarks:'',
    lengthFormat:'medium',studentGender:'girl',signoffEmoji:'',
    blitzVoice:'warm',preplyModule:'parent',preplyTrialPerson:'child'};
  for(const [protocol,settings] of Object.entries(options)){
    const prompt=buildServerGeneration({...base,protocol,...settings}).systemPrompt;
    check(protocol+' has immutable media grounding rule',
          prompt.includes('Scout media notes and lines labelled Media activity (not speech):'));
    check(protocol+' forbids inferred music comprehension',
          prompt.includes('not that a student listened, understood'));
    check(protocol+' requires demonstrated student response',
          prompt.includes('credible Student line'));
  }
  console.log('\n=== test-scout-media-context.cjs ===');
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
