'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const {normalizeClassicEnding,evaluateGeneratedOutput}=await import('../api/_lib/server-generation.js');
 const form={rating:'4',teacherName:'Layne',studentName:'Cyrus',lengthFormat:'medium'};
 const evidence=[
  {at:'01:32',speaker:'Cyrus',quote:'I have a bunny.',classification:'prompted completion'},
  {at:'03:44',speaker:'Cyrus',quote:'Rainbow.',classification:'answer to boat colour question'},
  {at:'08:58',speaker:'Cyrus',quote:'Millie.',classification:'named character'},
  {at:'17:37',speaker:'Cyrus',quote:"No, she don't like bugs.",classification:'student grammar error'},
  {at:'17:39',speaker:'Layne',quote:"She doesn't like them.",classification:'teacher correction'},
  {at:'20:06',speaker:'Layne',quote:'we need six, no sis. Six.',classification:'explicit pronunciation correction'},
  {at:'22:28',speaker:'Cyrus',quote:'Shoulder.',classification:'identified body part'}
 ];
 assert.equal(evidence.length,7);
 assert.equal(evidence.filter(x=>x.classification==='explicit pronunciation correction').length,1);
 assert.equal(evidence.filter(x=>x.classification==='teacher correction').length,1);
 const stars='⭐ 🌟 ⭐ 🌟 ✨ ⭐ 🌟 💫 ⭐ 🌠';
 const body=['Hi Cyrus and QQ!','','Today we explored bugs, a story, and a goodbye song.','',"Today's Lesson:",'📚 Today with Max','','Key Vocabulary with Pronunciation & Notes:','bug 🐛 – a small insect | Pronunciation: BUG | Note: counted several bug groups','','Grammar & Sentence Practice:',"“She doesn't like bugs.”",'',"Today's Superpower:",'🦸 Persistence','You tried counting the moving bugs several times, continuing after corrections and looking for the new total.','','Mini Homework:','Speaking Mission 🎯','Practise counting bugs.','','Total Stars Today:','',stars,''].join('\n');
 const bad=body+'Mini Homework:\nSing a song.\n\nThanks for the lesson.\n\nCheers,\nTeacher Layne 🐺';
 const raw=evaluateGeneratedOutput('MA',bad,form);
 assert(raw.blocking.some(x=>x.code==='signoff'), 'invalid placement must block delivery');
 const fixed=normalizeClassicEnding('MA',bad,form);
 assert(fixed.endsWith('Total Stars Today:\n\n'+stars+'\n\nCheers,\nTeacher Layne 🐺'));
 assert(!fixed.includes('Sing a song.')&&!fixed.includes('Thanks for the lesson.'));
 const accepted=evaluateGeneratedOutput('MA',fixed,form);
 assert(!accepted.blocking.some(x=>x.code==='signoff'),'fixed ending should not trigger signoff block');
 assert.strictEqual(normalizeClassicEnding('MS',bad,form),bad,'other protocol untouched');
 assert.strictEqual(normalizeClassicEnding('MA',bad,{...form,lengthFormat:'short'}),bad,'Classic Short untouched');
 assert.strictEqual(normalizeClassicEnding('MA',bad,{...form,lengthFormat:'long'}),bad,'Classic Long untouched');
 const noStars=bad.replace(stars,'⭐ ⭐');
 assert.strictEqual(normalizeClassicEnding('MA',noStars,form),noStars,'ambiguous stars must not be silently replaced');
 console.log(JSON.stringify({status:'PASS',kind:'offline contract/normalization (NOT live model generation)',evidencePoints:evidence.length,rawSignoffBlocked:true,normalizedSignoffClean:true,otherProtocolsUntouched:true,invalidStarsPreservedForRepair:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
