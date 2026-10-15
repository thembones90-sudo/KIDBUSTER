'use strict';
const path=require('path');
const fs=require('fs');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-critical-autocopy.cjs ===');
 let puppeteer;
 try{puppeteer=require('puppeteer');}catch(e){
  console.log('SKIPPED browser unavailable:',e.message);
  return 0;
 }
 const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 const options={args:['--no-sandbox'],...(fs.existsSync(chrome)?{executablePath:chrome}:{})};
 const browser=await puppeteer.launch(options);
 try{
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto('file://'+path.join(__dirname,'..','index.html'));
  const gate=await page.evaluate(async()=>{
   const originalRead=readFormState;
   const originalCall=callClaude;
   const originalCopy=copyOutputToClipboard;
   const originalSave=saveDraft;
   const state={
     teacherName:'Layne',studentName:'Synthetic Student',protocol:'MA',
     notes:'Practised spelling irregular plurals in a fictional lesson.',
     remarks:'',rating:'4',lengthFormat:'long',studentGender:'',
     signoffEmoji:'',blitzVoice:'warm',preplyModule:'adult',preplyTrialPerson:'adult'
   };
   let copied=0;
   try{
    readFormState=()=>({...state});
    document.getElementById('krispNotes').value=state.notes;
    saveDraft=()=>{};
    callClaude=async()=>({text:'x'.repeat(5000),usage:null,trialStatus:null});
    copyOutputToClipboard=()=>{copied++;return true;};
    const criticalPredicate=shouldAutoCopyReport(['CRITICAL: Report is over the hard limit'])===false;
    const advisoryPredicate=shouldAutoCopyReport(['Missing optional detail'])===true;
    await generate();
    const critical={
      copied,
      textPresent:outputBox.textContent.includes('x'.repeat(30)),
      button:copyBtn.textContent,
      notesRetained:document.getElementById('krispNotes').value===state.notes
    };
    // The invalid length must not pollute the next synthetic run.
    callClaude=async()=>({text:'A deliberately short report',usage:null,trialStatus:null});
    await generate();
    const normalCopyCount=copied,normalNotesCleared=document.getElementById('krispNotes').value==='';
    document.getElementById('krispNotes').value=state.notes;
    copied=0;
    callClaude=async()=>({text:'Hi Wrong Student! We practised plurals.',usage:null,trialStatus:null});
    await generate();
    const identity={copied,notesRetained:document.getElementById('krispNotes').value===state.notes,textPresent:outputBox.textContent.includes('Wrong Student'),warning:document.body.textContent.includes('Student identity mismatch')};
    return {critical,normalCopyCount,normalNotesCleared,criticalPredicate,advisoryPredicate,identity};
   }finally{
    readFormState=originalRead;
    callClaude=originalCall;
    copyOutputToClipboard=originalCopy;
    saveDraft=originalSave;
   }
  });
  check('critical and advisory lint are distinguished by actual page helper',gate.criticalPredicate&&gate.advisoryPredicate);
  check('CRITICAL output displayed for teacher review but not auto-copied',gate.critical.copied===0&&gate.critical.textPresent&&gate.critical.button.includes('Review warnings'));
  check('critical result retains editable lesson notes',gate.critical.notesRetained);
  check('normal report still auto-copies once',gate.normalCopyCount===1&&gate.normalNotesCleared);
  check('wrong student greeting blocks auto-copy while preserving report and notes',gate.identity.copied===0&&gate.identity.notesRetained&&gate.identity.textPresent&&gate.identity.warning);
  check('browser has no uncaught exceptions',pageErrors.length===0);
  if(pageErrors.length)console.log('page-errors',pageErrors);
  await page.close();
 }finally{await browser.close();}
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});
