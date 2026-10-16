'use strict';
// Krisp speaker normalization (2026-10-16 Haiku quality work). Fictional text.
const {extractKidbusterCore}=require('./helpers/extract-core.cjs');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-speaker-normalization.cjs ===');
  const core=extractKidbusterCore();
  const {buildServerGeneration}=await import('../api/_lib/server-generation.js');
  const names={teacherName:'Nora',studentName:'Mia'};
  const krisp=['Nora | 00:00','Hello Mia. How are you?','Mia | 00:04','I am …','Mia | 00:05','fine.','Nora | 00:07',"Great. Let's say I played with my.",
    'Mia | 00:09','I played with my.','Nora | 00:11','Dad. With my dad. There we go.','Mia | 00:15','I can pass.','Nora | 00:16',"So let's say I can.",'Mia | 00:18','Run fast. I like running.'].join('\n');
  const out=core.normalizeSpeakerTranscript(krisp,names);
  const lines=out.split('\n');
  check('known teacher and student are relabelled Teacher/Student',lines[0].startsWith('Teacher: Hello Mia')&&lines.some(l=>l.startsWith('Student: ')));
  check('timestamps and name headers are removed',!/\|\s*\d{2}:\d{2}/.test(out)&&!/^(Nora|Mia) \|/m.test(out));
  check('consecutive turns of one speaker are merged',lines.includes('Student: I am … fine.'));
  check('complete-and-model split is marked on both sides',out.includes('Student: I played with my …')&&out.includes('Teacher: (split) Dad. With my dad.'));
  check('a student genuinely answering a prompt is NOT marked as a split',out.includes('Student: Run fast. I like running.')&&!out.includes('(split) Run fast'));
  check('text not in Krisp format is returned unchanged',core.normalizeSpeakerTranscript('Lesson on clothes. Ben joined the song.',names)==='Lesson on clothes. Ben joined the song.');
  const unknown=['Speaker 1 | 00:00','Hi.','Speaker 2 | 00:02','Hello.','Speaker 1 | 00:03','Ready?','Speaker 2 | 00:04','Yes.'].join('\n');
  check('unknown speakers keep their labels rather than being guessed',core.normalizeSpeakerTranscript(unknown,names).startsWith('Speaker 1: Hi.'));
  const twoOneKnown=['Nora | 00:00','Hi.','Leo2 | 00:02','Hello.','Nora | 00:03','Ready?','Leo2 | 00:04','Yes.'].join('\n');
  check('with two speakers and only the teacher matched, the other is the Student',core.normalizeSpeakerTranscript(twoOneKnown,names).includes('Student: Hello.'));
  const built=buildServerGeneration({protocol:'BLITZ',rating:'3',notes:krisp,teacherName:'Nora',studentName:'Mia',remarks:'',lengthFormat:'medium',studentGender:'girl',signoffEmoji:'',blitzVoice:'warm',preplyModule:'parent',preplyTrialPerson:'child'});
  check('server prompt receives the normalized transcript',built.userMessage.includes('Teacher: (split) Dad.')&&!built.userMessage.includes('Nora | 00:00'));
  check('grounding rules explain the (split) marker and Teacher/Student labels',built.systemPrompt.includes('"(split)"')&&built.systemPrompt.includes('labelled Teacher: and Student:'));
  check('grounding rule: credit only words the student said',built.systemPrompt.includes('Credit the student only with words the student said'));
  check('grounding rule: no facial expressions, smiles, tone or feelings',built.systemPrompt.includes('Never describe facial expressions, smiles, laughter'));
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(f=>process.exit(f?1:0));}
