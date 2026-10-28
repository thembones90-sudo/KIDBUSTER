'use strict';
const assert = require('node:assert/strict');
module.exports = async function(){
  const {scoutStudentLabel:name} = await import('../api/_lib/scout-student-name.js');
  const record = transcript => ({transcript,teacherLabel:'Layne'});
  assert.equal(name({...record('[00:01] TEACHER: Hi Kevin.'),studentLabel:'Ernest'}),'Ernest');
  assert.equal(name(record('[00:05] TEACHER: Tom and Tom.\n[04:49] TEACHER: Hello hello hello my Kevin nice to see you.')),'Kevin');
  assert.equal(name(record('[00:05] TEACHER: Tom and Tom.\n[04:49] TEACHER: Hello hello hello my Kevin, nice to see you.')),'Kevin');
  assert.equal(name(record('[00:01] TEACHER: Hi, Andy!\n[04:00] TEACHER: Hello Andy.')),'Andy');
  assert.equal(name(record('[00:01] STUDENT: My name is Zoë.')),'Zoë');
  assert.equal(name(record('[00:01] TEACHER: Hi Layne.')),null,'teacher cannot become the student');
  assert.equal(name(record('[00:01] TEACHER: Hi Kevin.\n[00:02] TEACHER: Hello Andy.')),null,'conflicting direct addresses stay unnamed');
  for(const text of ['Hi buddy.','Hello everyone.','Hi can you hear me?','Hi Kevin and Andy.','Tom practiced football.','The story is about Kevin.'])
    assert.equal(name(record('[00:01] TEACHER: '+text)),null,text);
  assert.equal(name(record('[00:01] STUDENT: Hi Layne.')),null);
  assert.equal(name(record('Hello Kevin.')),null,'unlabelled text does not establish speaker roles');
  assert.equal(name(record('[00:01] TEACHER: Hi <script>.')),null);
  // Exercise the real inbox summary against an in-memory store: legacy items
  // are enriched on read, without changing persisted content or importing it.
  process.env.KIDBUSTER_TEST_KV='1';
  const rv=await import('../api/_lib/radar-van.js');
  const token=await rv.issueRadarToken('synthetic-scout-names');
  const crypto=require('node:crypto');
  const lesson={lessonId:crypto.randomUUID(),title:'Classbuster Scout lesson 2026-10-27',
    startedAt:new Date().toISOString(),durationSeconds:120,
    transcript:'[00:01] TEACHER: Hello Kevin, nice to see you.',teacherLabel:'Layne'};
  const receipt=await rv.ingestRadarLesson('synthetic-scout-names',lesson,crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(receipt.studentLabel,'Kevin','delivery receipt uses the stored lesson identity');
  const retry=await rv.ingestRadarLesson('synthetic-scout-names',{...lesson,studentLabel:'Wrong retry name'},crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(retry.studentLabel,'Kevin','retry cannot replace the receipt with changed payload identity');
  const session=await rv.readRadarSession('synthetic-scout-names');
  assert.equal(session.pending[0].studentLabel,'Kevin','server enriches existing unlabelled inbox records');
  assert.equal(session.pending[0].title,lesson.title,'original lesson metadata remains intact');
  console.log('PASS Scout student names: explicit priority, role-aware evidence, Unicode, teacher exclusion, ambiguity and safe fallback');
  return 0;
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
