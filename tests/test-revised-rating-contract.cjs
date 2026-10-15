'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {extractKidbusterCore}=require('./helpers/extract-core.cjs');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 const c=extractKidbusterCore();
 const {buildServerGeneration}=await import('../api/_lib/server-generation.js');
 console.log('\n=== test-revised-rating-contract.cjs ===');
 const levels=['1','1.5','2','2.5','3','3.5','4','4.5','5','6'];
 const toneStarts={
  '1':'The student experienced substantial difficulty',
  '1.5':'The student demonstrated significant difficulty',
  '2':"The student's performance fell below the expected standard",
  '2.5':'The student showed emerging understanding',
  '3':'The student met the basic expectations',
  '3.5':'The student performed satisfactorily',
  '4':'The student performed well',
  '4.5':'The student demonstrated consistently strong performance',
  '5':'The student delivered an outstanding performance',
  '6':'The student demonstrated truly extraordinary performance'
 };
 const ratingNames={
  '1':'Critical.', '1.5':'Struggling.', '2':'Below Expectations.',
  '2.5':'Developing.', '3':'Satisfactory.', '3.5':'Promising.',
  '4':'Very Good.', '4.5':'Excellent.', '5':'Outstanding.', '6':'Legendary.'
 };
 check('all 10 canonical numeric levels remain unchanged',c.LEVELS.join(',')===levels.join(','));
 const prompts={};
 for(const rating of levels){
  check(rating+' new tone description is present and extensive',
   c.LEVEL_TONE_DESC[rating].startsWith(toneStarts[rating])&&c.LEVEL_TONE_DESC[rating].length>=145);
  prompts[rating]={};
  for(const protocol of ['MA','MS','FAIRY']){
   const input={protocol,teacherName:'Synthetic Teacher',studentName:'Fictional Child',
    notes:'A fictional pupil practiced irregular plurals. No real student evidence.',
    remarks:'',rating,lengthFormat:'long',signoffEmoji:''};
   const result=buildServerGeneration(input);
   prompts[rating][protocol]=result.systemPrompt;
   const expected=c.LEVEL_TONE_DESC[rating];
   check(protocol+' rating '+rating+' uses the exact new tone description',
     result.systemPrompt.includes(expected));
   check(protocol+' '+rating+' includes no-fabrication score/evidence distinction',
     result.systemPrompt.includes('rating controls tone and level of encouragement, not the underlying facts') &&
     result.systemPrompt.includes('solely from a score'));
   check(protocol+' '+rating+' preserves explicit selected score without rounding',
     result.systemPrompt.includes('Selected rating: '+rating+'/5.') ||
     result.systemPrompt.includes('Selected rating for this report: '+rating+'/5.'));
   check(protocol+' '+rating+' retains core report headings',
     result.systemPrompt.includes('Key Vocabulary with Pronunciation & Notes:') &&
     result.systemPrompt.includes('Grammar & Sentence Practice'));
  }
 }
 check('5 and 6 are clearly distinct, without invented exceptional performance',
  prompts['5'].MA.includes('outstanding performance')&&
  prompts['6'].MA.includes('truly extraordinary performance')&&
  prompts['6'].MA.includes('the score alone is not evidence'));
 check('low ratings preserve Parent Note and no-stars rules',
  prompts['2'].MA.includes('INCLUDE it (this rating is 1, 1.5, 2, or 2.5).') &&
  prompts['2.5'].MS.includes('OMIT the entire Total Stars Today section.'));
 check('rating 3 preserves star requirement',
  prompts['3'].MA.includes('INCLUDE it with exactly 10 star emojis'));
 check('Fairy half-point 3.5 does not round to 3 or 4',
  prompts['3.5'].FAIRY.includes('Selected rating for this report: 3.5/5.'));
 check('no obsolete old-style low-score instruction survives',
  !prompts['2'].MA.includes('honest about lack of effort or weak results') &&
  !prompts['1'].FAIRY.includes('Complete shambles.'));
 const other={
  BLITZ:buildServerGeneration({protocol:'BLITZ',teacherName:'Synthetic Teacher',studentName:'Fictional Child',notes:'Reviewed weather.',rating:'3',blitzVoice:'warm'}).systemPrompt,
  BEIDA:buildServerGeneration({protocol:'BEIDA',teacherName:'Synthetic Teacher',studentName:'Fictional Child',notes:'Reviewed weather.',rating:'excellent'}).systemPrompt,
  OF:buildServerGeneration({protocol:'OF',teacherName:'Synthetic Teacher',studentName:'Fictional Child',notes:'Reviewed weather.',rating:'Medium',studentGender:'girl'}).systemPrompt,
  PREPLY:buildServerGeneration({protocol:'PREPLY',teacherName:'Synthetic Teacher',studentName:'Fictional Child',notes:'Reviewed weather.',rating:'',preplyModule:'adult'}).systemPrompt
 };
 check('Blitz, Beida, OF and Preply keep independent rating instruction systems',
  Object.values(other).every(prompt=>!prompt.includes('RATING EVIDENCE RULE (ALL RATINGS)') &&
    !prompt.includes('truly extraordinary performance')));

 let puppeteer;
 try{puppeteer=require('puppeteer');}catch(e){console.log('Browser skipped:',e.message);return getFailures();}
 const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 const browser=await puppeteer.launch({args:['--no-sandbox'],...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
 try{
  const page=await browser.newPage();
  await page.goto('file://'+path.join(__dirname,'..','index.html'));
  for(const rating of levels){
   await page.click('#ratingTrack .rating-btn[data-lvl="'+rating+'"]');
   await new Promise(resolve=>setTimeout(resolve,160));
   const ui=await page.evaluate(()=>({
    caption:document.getElementById('ratingCaption').textContent,
    rating:state.rating
   }));
   check('UI '+rating+' shows revised verdict and keeps exact selected score',
    ui.rating===rating &&
    ui.caption.includes(rating==='6'?'Legendary':ratingNames[rating].replace('.','')));
  }
  await page.close();
 }finally{await browser.close();}
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});
