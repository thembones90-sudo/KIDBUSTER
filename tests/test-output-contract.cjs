'use strict';
// Final-output contract (2026-10-15 generation quality repair). Fictional
// fixtures only. Proves which findings block delivery, which stay advisory,
// and that structural compliance is never presented as educational review.
const {extractKidbusterCore}=require('./helpers/extract-core.cjs');
const {createChecker}=require('./helpers/assert.cjs');
const {validReport}=require('./helpers/valid-reports.cjs');

module.exports=function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-output-contract.cjs ===');
  const core=extractKidbusterCore();
  const ALL=['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY'];
  const ctx=(p,o={})=>({rating:p==='BEIDA'?'excellent':p==='OF'?'Medium':p==='PREPLY'?'':'4',teacherName:'Layne',lengthFormat:'medium',
    studentGender:'boy',signoffEmoji:'',preplyModule:'parent',studentName:'Test Student',preplyTrialPerson:'adult',...o});
  const evaluate=(p,text,o)=>core.evaluateOutputContract(p,text,ctx(p,o));
  const codes=r=>r.blocking.map(b=>b.code);

  console.log('\n1) every protocol has a valid baseline and never claims content review');
  for(const p of ALL){
    const r=evaluate(p,validReport(p));
    check(p+': valid fixture is structurally compliant',r.compliant&&r.blocking.length===0);
    check(p+': valid fixture needs no correction call',!r.softRepair);
    check(p+': compliance is never labelled as educational review',r.contentReviewed===false);
  }

  console.log('\n2) correct formatting with fabricated content is not "verified"');
  const fabricated=validReport('MA').replace('You answered each ocean question with a full sentence after I gave one example, and you kept trying.',
    'Every single lesson you speak perfectly, and today you mastered all forty words on your own without any help at all.');
  const fab=evaluate('MA',fabricated);
  check('fabricated-but-well-formatted report passes the structural contract',fab.compliant);
  check('...and is still explicitly marked contentReviewed:false',fab.contentReviewed===false);

  console.log('\n3) hard length limits block delivery (repairable)');
  const longFairy=validReport('FAIRY',{extraVocab:20});
  check('fixture really exceeds the 3000-character Medium ceiling',longFairy.length>=3000);
  const lf=evaluate('FAIRY',longFairy);
  check('overlong Fairy (Medium) is not send-ready',!lf.compliant&&codes(lf).includes('length_hard'));
  check('the length finding is repairable',lf.blocking.every(b=>b.repairable));
  check('the same Fairy text is compliant under the Long ceiling',evaluate('FAIRY',longFairy,{lengthFormat:'long'}).compliant===(longFairy.length<4800));
  const longMA=validReport('MA',{extraVocab:30});
  check('overlong Classic (Medium) is blocked',codes(evaluate('MA',longMA)).includes('length_hard'));
  check('Blitz over its 150-word hard limit is blocked',codes(evaluate('BLITZ',validReport('BLITZ',{overlong:true}))).includes('length_hard'));
  const beidaLong=validReport('BEIDA').replace('We also looked at pictures',('We also looked at pictures. ').repeat(80));
  check('Beida Learning Content over 2000 characters is blocked',codes(evaluate('BEIDA',beidaLong)).includes('length_field'));
  const ofLong=validReport('OF').replace(/^(Strengths\n\n)([^\n]+)/,(m,h,b)=>h+b+' '+b+' '+b);
  check('OF Strengths over 1300 characters is blocked',codes(evaluate('OF',ofLong)).includes('length_field'));

  console.log('\n4) missing mandatory sections are detected');
  const noSuper=evaluate('MS',validReport('MS',{omitSuperpower:true}));
  check('Sugarcoat without Today\'s Superpower is blocked',!noSuper.compliant&&codes(noSuper).includes('section'));
  const emojiOnly=validReport('MS').replace(/🦸 Speaking\n\n[^\n]+/,'🦸');
  check('Sugarcoat with a bare 🦸 emoji is still blocked (emoji alone is not enough)',codes(evaluate('MS',emojiOnly)).includes('section'));
  check('Fairy without Positive Feedback is blocked',codes(evaluate('FAIRY',validReport('FAIRY').replace(/Positive Feedback:[^\n]+\n/,''))).includes('section'));
  check('OF missing a section is blocked',codes(evaluate('OF',validReport('OF').replace('Learning Suggestions\n\n',''))).includes('section'));
  check('Beida missing its second field delimiter is blocked',codes(evaluate('BEIDA',validReport('BEIDA').replace('GENERAL AND DETAILED PERFORMANCE:',''))).includes('structure'));
  check('Classic at rating 2 without a Parent Note is blocked',codes(evaluate('MA',validReport('MA',{rating:'4'}),{rating:'2'})).includes('section'));

  console.log('\n5) identity, voice and pronoun facts block delivery');
  check('wrong teacher sign-off is blocked',codes(evaluate('MA',validReport('MA'),{teacherName:'Nina'})).includes('signoff'));
  const wrongPronoun=evaluate('OF',validReport('OF'),{studentGender:'girl'});
  check('OF wrong pronoun is reported to the teacher as a warning',wrongPronoun.advisory.some(a=>a.includes('student pronoun')));
  check('OF wrong pronoun is advisory, not blocking (check cannot tell student from story characters)',wrongPronoun.compliant);
  const girlOF=validReport('OF').replace(/\bHe\b/g,'She').replace(/\bhe\b/g,'she').replace(/\bhim\b/g,'her').replace(/\bhis\b/g,'her')
    .replace('without hesitation','without hesitation, and she said "He is brave" about the firefighter in the story');
  check('a quoted story sentence ("He is brave") is not flagged as the student pronoun',!evaluate('OF',girlOF,{studentGender:'girl'}).advisory.some(a=>a.includes('student pronoun')));
  const sweetLow=validReport('MS',{rating:'2'}).replace('Parent Note:','Parent Note');
  check('Sugarcoat at rating 2 with its own colon-less "Parent Note" heading is accepted',evaluate('MS',sweetLow,{rating:'2'}).compliant);
  check('Sugarcoat at rating 2 with no Parent Note at all is still blocked',codes(evaluate('MS',validReport('MS',{rating:'4'}),{rating:'2'})).includes('section'));
  check('Beida greeting with the wrong teacher is blocked',codes(evaluate('BEIDA',validReport('BEIDA'),{teacherName:'Nina'})).includes('signoff'));
  const thirdPerson=validReport('PREPLY').replace('after I gave one example','after Layne gave one example');
  const tp=evaluate('PREPLY',thirdPerson);
  check('Preply naming the teacher in the third person is blocked',codes(tp).includes('voice'));
  for(const signoff of ['\n\nBest regards,\nLayne','\n\nKind regards, Layne','\n\nThanks,\nTeacher Layne','\n\n— Layne']){
    check('Preply signed "'+signoff.trim().replace(/\n/g,' / ')+'" is not third-person self-reference',evaluate('PREPLY',validReport('PREPLY')+signoff).compliant);
  }
  check('...but naming the teacher in the body is still blocked even with a signature',codes(evaluate('PREPLY',thirdPerson+'\n\nBest regards,\nLayne')).includes('voice'));
  check('a teacher name that is only part of another word is not flagged',evaluate('PREPLY',validReport('PREPLY'),{teacherName:'Ann'}).compliant);
  check('student greeting mismatch is blocked',codes(evaluate('MA',validReport('MA',{student:'Somebody'}))).includes('identity'));
  check('leaked placeholder is blocked',codes(evaluate('BLITZ',validReport('BLITZ').replace('Thank you','[Student] thank you'))).includes('placeholder'));

  console.log('\n6) stylistic word targets are advisory; only large overshoots request one correction');
  const preplyLong=validReport('PREPLY',{overlong:true});
  const pl=evaluate('PREPLY',preplyLong);
  check('Preply parent message far over its target stays compliant (not a hard limit)',pl.compliant);
  check('...but requests one bounded shortening pass',pl.softRepair===true);
  check('...and the overshoot is reported as an advisory',pl.advisory.some(a=>a.includes('over the 150-word target')));
  const ofSlight=validReport('OF').replace('Learning Suggestions\n\n','Learning Suggestions\n\n'+'He enjoyed the pictures. '.repeat(31));
  const os=evaluate('OF',ofSlight);
  const ofWords=ofSlight.trim().split(/\s+/).length;
  check('fixture is just over the 300-word OF ceiling',ofWords>300&&ofWords<=345);
  check('OF over its stated 300-word ceiling stays deliverable (stylistic, not hard)',os.compliant&&os.advisory.some(a=>a.includes('words')));
  check('...but earns one shortening attempt (OF names 300 as the top of its range)',os.softRepair===true);
  check('OF within its range needs no correction call',!evaluate('OF',validReport('OF')).softRepair);
  check('Classic between soft target and hard ceiling is advisory only',(()=>{const t=validReport('MA',{extraVocab:14});const r=evaluate('MA',t);return t.length>2800&&t.length<3000&&r.compliant&&!r.softRepair;})());

  console.log('\n6b) rating-driven star rules are authoritative configuration');
  const lowStars=evaluate('MS',validReport('MS',{rating:'2'}).replace('Parent Note:','Parent Note').replace('Mini Homework:','Total Stars Today:\n\n⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐\n\nMini Homework:'),{rating:'2'});
  check('stars printed at rating 2 block delivery (repairable)',codes(lowStars).includes('rating_rule'));
  check('eleven stars at rating 4 block delivery',codes(evaluate('MA',validReport('MA').replace('⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐','⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐'))).includes('rating_rule'));
  check('Fairy stars at rating 2 block delivery',codes(evaluate('FAIRY',validReport('FAIRY'),{rating:'2'})).includes('rating_rule'));

  // Benchmark 2026-10-16: a decorative star inside the closing sentence was
  // counted as an 11th star (and as "stars below 3"). Only a star-only line counts.
  const sweetStars=validReport('MS').replace('Total Stars Today:\n\n','').replace('See you next time!','See you next time, superstar! 🌟');
  check('Sugarcoat: 10-star line plus a decorative 🌟 in the closing sentence is compliant',evaluate('MS',sweetStars).compliant);
  const sweetLowDecor=validReport('MS',{rating:'2'}).replace('Parent Note:','Parent Note').replace('See you next time!','You are a tiny superpower! 🌟');
  check('Sugarcoat at rating 2: no star line but a decorative 🌟 in prose is compliant',evaluate('MS',sweetLowDecor,{rating:'2'}).compliant);
  const sweetEleven=validReport('MS').replace('Total Stars Today:\n\n','').replace('⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐','⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐');
  check('Sugarcoat: an 11-star star line is still blocked',codes(evaluate('MS',sweetEleven)).includes('rating_rule'));
  const sweetNoLine=validReport('MS').replace('Total Stars Today:\n\n⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐\n\n','');
  check('Sugarcoat at rating 4 with no star line is still blocked',codes(evaluate('MS',sweetNoLine)).includes('rating_rule'));
  const sweetLowLine=validReport('MS',{rating:'2'}).replace('Parent Note:','Parent Note').replace('See you next time!','⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐\n\nSee you next time!');
  check('Sugarcoat at rating 2 with a real star line is still blocked',codes(evaluate('MS',sweetLowLine,{rating:'2'})).includes('rating_rule'));

  // Benchmark 2026-10-16: OF headings written as **Strengths** were reported as
  // "missing sections"; they are present but wrongly formatted.
  const boldOF=validReport('OF').replace(/^Strengths$/m,'**Strengths**').replace(/^Areas for Improvement$/m,'**Areas for Improvement**').replace(/^Learning Suggestions$/m,'**Learning Suggestions**');
  const bo=evaluate('OF',boldOF);
  check('OF bold headings are recognised as present sections',!bo.blocking.some(b=>b.code==='section'));
  check('...and blocked as a repairable formatting problem with an accurate message',bo.blocking.some(b=>b.code==='formatting'&&b.repairable));
  const blanks=validReport('MS').replace('Say three sentences about ocean animals.','Say "It\'s a __" or "It\'s an __" for each animal.');
  check('fill-in blanks (__ … __) are not mistaken for a bold heading',evaluate('MS',blanks).compliant);

  // Benchmark 2026-10-16: OF written about the student as "they" despite he/him.
  const theyOF=validReport('OF').replace(/\bHe\b/g,'They').replace(/\bhe\b/g,'they').replace(/\bhim\b/g,'them').replace(/\bhis\b/g,'their');
  check('OF that never uses the selected pronoun but uses "they" is blocked',codes(evaluate('OF',theyOF)).includes('pronoun_missing'));
  check('OF using "he" and mentioning "they" for other people is fine',evaluate('OF',validReport('OF').replace('stayed engaged','stayed engaged while classmates said they liked it')).compliant);
  check('OF with no pronoun set never triggers the pronoun-missing rule',!codes(evaluate('OF',theyOF,{studentGender:''})).includes('pronoun_missing'));
  const twice=validReport('MS').replace('Hi Test Student!\n','Hi Test Student!\nHello, my dear Test Student! ');
  check('Sugarcoat greeting the student twice is blocked (repairable)',codes(evaluate('MS',twice)).includes('greeting'));
  check('a single greeting is fine',!codes(evaluate('MS',validReport('MS'))).includes('greeting'));
  const facts='Student: Test Student\nStudent pronoun: use he/him/his throughout.';
  const withFacts=core.buildComplianceRepairPrompt('OF',theyOF,evaluate('OF',theyOF),facts);
  check('repair prompt carries the fixed per-report facts when given',withFacts.includes('FIXED FACTS FOR THIS REPORT')&&withFacts.includes('he/him/his'));

  console.log('\n6c) pronunciation diagnoses read off speech-to-text are blocked');
  const diagnosed=validReport('MS').replace('Grammar & Sentence Practice:','Pronunciation Focus\n\n🗣 Swim → SWIM (not "swing")\n\nGrammar & Sentence Practice:');
  check('a 🗣 cue saying not "swing" is blocked as a grounding violation',codes(evaluate('MS',diagnosed)).includes('grounding'));
  const modelOnly=validReport('MS').replace('Grammar & Sentence Practice:','Pronunciation Focus\n\n🗣 Swim → SWIM, rhymes with "him"\n\nGrammar & Sentence Practice:');
  check('a 🗣 cue that only gives the model pronunciation is allowed',evaluate('MS',modelOnly).compliant);
  const fairyNote=validReport('FAIRY').replace('Note: used it in a sentence with help','Note: You sometimes said "show" instead of "shoot", so practise the oo sound');
  check('a Fairy Note claiming "said X instead of Y" about a sound is blocked',codes(evaluate('FAIRY',fairyNote)).includes('grounding'));
  const grammarNote=validReport('MA').replace('Note: named it with support','Note: say "to my friend", not "with my friend"');
  check('a grammar Note with not "…" is NOT treated as a pronunciation diagnosis',evaluate('MA',grammarNote).compliant);

  console.log('\n7) the single repair prompt is bounded and grounding-safe');
  const prompt=core.buildComplianceRepairPrompt('FAIRY',longFairy,lf);
  check('repair prompt lists the failed check',prompt.includes('CRITICAL: Report is'));
  check('repair prompt forbids adding new facts',prompt.includes('Use only facts already present in the draft'));
  check('repair prompt protects required sections and sign-off',prompt.includes('Never remove a required section'));
  check('repair prompt states the protocol length goal',prompt.includes('under 2800 characters'));
  check('repair prompt is explicitly a single attempt',prompt.includes('ONE ATTEMPT ONLY'));
  check('repair prompt contains the draft but no transcript field',prompt.includes('DRAFT:')&&!/Krisp notes|Lesson evidence/.test(prompt));
  check('unknown protocol is refused',(()=>{try{core.evaluateOutputContract('EVIL','x',{});return false;}catch{return true;}})());
  check('empty output is blocked and not repairable',(()=>{const r=evaluate('MA','   ');return !r.compliant&&r.blocking[0].repairable===false;})());

  return getFailures();
};

if(require.main===module)process.exit(module.exports()?1:0);
