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
  check('OF wrong pronoun is blocked',codes(evaluate('OF',validReport('OF'),{studentGender:'girl'})).includes('pronoun'));
  check('Beida greeting with the wrong teacher is blocked',codes(evaluate('BEIDA',validReport('BEIDA'),{teacherName:'Nina'})).includes('signoff'));
  const thirdPerson=validReport('PREPLY').replace('after I gave one example','after Layne gave one example');
  const tp=evaluate('PREPLY',thirdPerson);
  check('Preply naming the teacher in the third person is blocked',codes(tp).includes('voice'));
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
  check('fixture is slightly over the 300-word OF ceiling but within tolerance',ofWords>300&&ofWords<=345);
  check('slightly-long OF is advisory only and incurs no correction call',os.compliant&&!os.softRepair&&os.advisory.some(a=>a.includes('words')));
  check('Classic between soft target and hard ceiling is advisory only',(()=>{const t=validReport('MA',{extraVocab:14});const r=evaluate('MA',t);return t.length>2800&&t.length<3000&&r.compliant&&!r.softRepair;})());

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
