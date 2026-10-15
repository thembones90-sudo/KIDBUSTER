'use strict';
const {extractKidbusterCore}=require('./helpers/extract-core.cjs');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=function run(){
  const core=extractKidbusterCore();
  const {check,getFailures}=createChecker();
  console.log('\n=== test-fairy-protocol.cjs ===');

  function report({rating='4',section=true,stars=true,signoff='Love,\nTeacher Layne',extra='',includeGrammar=true,includePositive=true}={}){
    const sections=[
      'Hi Momo!',
      'Today we practiced how to describe magical animals.',
      'Key Vocabulary with Pronunciation & Notes:',
      'dragon - a friendly mythical animal',
      'castle - a strong old building',
      'Grammar & Sentence Practice:',
      '"The dragon is flying."',
      'Grammar Points We Covered:',
      'Present continuous: is flying.',
      'Positive Feedback: You described the dragon with a full sentence after one example. 👍👏',
      'Mini Homework:',
      'Write two sentences describing a magical animal.'
    ];
    if(!section)sections.splice(sections.indexOf('Mini Homework:'),1);
    if(!includeGrammar)sections.splice(sections.indexOf('Grammar Points We Covered:'),1);
    if(!includePositive)sections.splice(sections.findIndex(x=>x.startsWith('Positive Feedback:')),1);
    if(stars)sections.push('Total Stars Today:', '⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐');
    if(extra)sections.push(extra);
    sections.push(signoff);
    return sections.join('\n\n');
  }

  check('Fairy protocol registered with dedicated builder and validator',
    core.PROTOCOLS.FAIRY?.label==='Fairy' && typeof core.PROTOCOLS.FAIRY?.analyze==='function' &&
    typeof core.PROTOCOLS.FAIRY?.buildSystemPrompt==='function');

  const valid=core.analyzeFairyOutput(report(), '4', 'Layne', core.LENGTH_TIERS.long);
  check('valid complete Fairy report has zero warnings', valid.length===0);
  check('missing homework is flagged',core.analyzeFairyOutput(report({section:false}),'4','Layne').some(w=>w.includes('Mini Homework')));
  check('missing Positive Feedback section is flagged',core.analyzeFairyOutput(report({includePositive:false}),'4','Layne').some(w=>w.includes('Positive Feedback section is missing')));
  check('missing grammar points is flagged',core.analyzeFairyOutput(report({includeGrammar:false}),'4','Layne').some(w=>w.includes('Grammar Points We Covered')));
  check('wrong teacher signoff is flagged',core.analyzeFairyOutput(report({signoff:'Love,\nTeacher Nina'}),'4','Layne').some(w=>w.includes('Closing sign-off')));
  check('under-3 rating with stars is flagged',core.analyzeFairyOutput(report(),'2.5','Layne').some(w=>w.includes('omitted')));
  check('under-3 rating without stars is accepted for star rule',!core.analyzeFairyOutput(report({stars:false}),'2.5','Layne').some(w=>w.toLowerCase().includes('star')));
  check('high rating missing stars is flagged',core.analyzeFairyOutput(report({stars:false}),'4','Layne').some(w=>w.includes('Star count')));
  check('placeholder is flagged',core.analyzeFairyOutput(report({extra:'[Student]'}),'4','Layne').some(w=>w.includes('placeholder')));
  check('horizontal divider is flagged',core.analyzeFairyOutput(report({extra:'-----'}),'4','Layne').some(w=>w.includes('horizontal divider')));
  check('markdown bold is forbidden',core.analyzeFairyOutput(report({extra:'**bad markdown**'}),'4','Layne').some(w=>w.includes('Bold text')));
  check('hard length limit is flagged critical',core.analyzeFairyOutput(report({extra:'z'.repeat(5000)}),'4','Layne').some(w=>w.startsWith('CRITICAL:')));
  return getFailures();
};
if(require.main===module)process.exit(module.exports()?1:0);
