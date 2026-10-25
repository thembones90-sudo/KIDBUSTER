'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
 const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  const sample='Strengths\n\nSam practised fruit vocabulary. He answered with support.\n\nAreas for Improvement\n\nHe needs more sentence practice.\n\nLearning Suggestions\n\nPractise naming fruit.\n\nCheers,\nTeacher Nora';
  await page.click('#protocolSelect label:has(input[value="OF"])');
  const parsed=await page.evaluate(sample=>{
   window.ofSample=sample;window.copiedParts=[];
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copiedParts.push(text)}});
   const split=splitOFDisplayOutput(sample);
   return {split,crlf:splitOFDisplayOutput(sample.replace(/\n/g,'\r\n')),bold:splitOFDisplayOutput(sample.replace('Areas for Improvement','**Areas for Improvement**:')),
     missing:splitOFDisplayOutput('Strengths\nOnly one field.'),inline:splitOFDisplayOutput('Strengths\nWe discussed Areas for Improvement in class.\nLearning Suggestions\nPractise.'),
     duplicate:splitOFDisplayOutput(sample+'\nAreas for Improvement\nExtra')};
  },sample);
  assert.equal(parsed.split.strengths,sample.split('\n\nAreas for Improvement')[0]);
  assert.equal(parsed.split.followup,'Areas for Improvement'+sample.split('\n\nAreas for Improvement')[1]);
  assert.ok(parsed.crlf&&parsed.bold);assert.equal(parsed.missing,null);assert.equal(parsed.inline,null);assert.equal(parsed.duplicate,null);
  await page.evaluate(async sample=>{
   document.getElementById('teacherName').value='Nora';document.getElementById('studentName').value='Sam';document.getElementById('krispNotes').value='Synthetic fruit lesson notes.';
   document.querySelector('input[name="studentGender"][value="boy"]').checked=true;
   state.rating='Medium';callClaude=async()=>({text:sample,usage:null,trialStatus:null});await generate();
  },sample);
  assert.equal(await page.evaluate(()=>window.copiedParts.length),0,'split reports never auto-copy only one half');
  assert.equal(await page.$eval('#copyBtn',e=>e.hidden),true);
  await page.click('#copyOFStrengthsBtn');await page.click('#copyOFFollowupBtn');
  assert.deepEqual(await page.evaluate(()=>window.copiedParts),['Sam practised fruit vocabulary. He answered with support.','He needs more sentence practice.\n\nPractise naming fruit.\n\nCheers,\nTeacher Nora']);
  assert.ok(await page.$eval('#outputBox',e=>e.textContent.startsWith('Strengths')),'headings remain visible for navigation');
  assert.match(await page.$eval('#protocolBadge',e=>e.textContent),/Lingo Ace/);
  const cleaned=await page.evaluate(()=>({bold:cleanLingoAceCopy('**Strengths**:\r\n\r\nWe discussed Areas for Improvement in class.'),closing:cleanLingoAceCopy('Learning Suggestions\n\nPractise daily.\n\nCheers,\nTeacher Nora 🐺')}));
  assert.equal(cleaned.bold,'We discussed Areas for Improvement in class.');
  assert.equal(cleaned.closing,'Practise daily.\n\nCheers,\nTeacher Nora 🐺','closing and custom emoji are preserved verbatim');
  await page.$eval('#ofFollowupBox',e=>e.textContent+='\nEdited by teacher.');await page.click('#copyOFFollowupBtn');
  assert.ok((await page.evaluate(()=>window.copiedParts.at(-1))).endsWith('Edited by teacher.'),'copy uses editable current text');
  const fallback=await page.evaluate(async()=>{
   const original=navigator.clipboard.writeText,exec=document.execCommand;let copied='';
   navigator.clipboard.writeText=async()=>{throw Error('Synthetic clipboard denial');};
   document.execCommand=()=>{copied=document.activeElement.value;return true;};
   const source=document.getElementById('ofFollowupBox');await copyOutputToClipboard(source,document.getElementById('copyOFFollowupBtn'),cleanLingoAceCopy(source.textContent));
   navigator.clipboard.writeText=original;document.execCommand=exec;return copied;
  });
  assert.ok(!fallback.includes('Learning Suggestions'));assert.ok(fallback.includes('Cheers,\nTeacher Nora'),'legacy clipboard keeps the closing too');
  await page.click('#protocolSelect label:has(input[value="MA"])');
  assert.equal(await page.$eval('#ofFollowupField',e=>e.hidden),true);
  assert.ok((await page.$eval('#outputBox',e=>e.textContent)).endsWith('Edited by teacher.'),'switch preserves both halves and edits');
  await page.click('#protocolSelect label:has(input[value="OF"])');
  assert.equal(await page.$eval('#ofFollowupField',e=>e.hidden),false);
  await page.evaluate(sample=>{setCurrentReport(sample,[]);setCurrentReport(sample.replace('Sam','Alex'),[]);renderReportToOutput(state.currentReportText);},sample);
  await page.click('#prevReportToggle');assert.match(await page.$eval('#outputBox',e=>e.textContent),/Sam/);
  assert.equal(await page.$eval('#ofFollowupField',e=>e.hidden),false);
  await page.click('#prevReportToggle');assert.match(await page.$eval('#outputBox',e=>e.textContent),/Alex/);
  for(const width of [1440,768,390,320]){
   await page.setViewport({width,height:1000});
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'no overflow at '+width);
   assert.equal(await page.$eval('#copyOFFollowupBtn',e=>e.offsetHeight>=44),true);
   if(process.env.V2_OF_SCREENSHOTS) await (await page.$('#ofFollowupField')).screenshot({path:path.join(process.env.V2_OF_SCREENSHOTS,'of-split-'+width+'.png')});
  }
  await page.evaluate(()=>renderReportToOutput('Malformed output remains fully visible.'));
  assert.equal(await page.$eval('#outputBox',e=>e.textContent),'Malformed output remains fully visible.');
  assert.equal(await page.$eval('#ofFollowupField',e=>e.hidden),true);assert.equal(await page.$eval('#copyBtn',e=>e.hidden),false);
  await page.evaluate(sample=>{renderReportToOutput(sample);resetWorkspace();},sample);
  assert.equal(await page.$eval('#ofFollowupField',e=>e.hidden),true);assert.equal(await page.$eval('#ofFollowupBox',e=>e.textContent),'');
  assert.equal(await page.$eval('#copyOFStrengthsBtn',e=>e.disabled),true);
  assert.deepEqual(errors,[]);
  console.log('PASS OF split: exact independent copies, sign-off, edits, no half auto-copy, switching, recall, fallback, reset and mobile');return 0;
 }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});
