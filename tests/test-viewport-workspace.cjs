'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer');

module.exports=async function run(){
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',r=>/^https?:/.test(r.url())?r.abort():r.continue());
  await page.goto(pathToFileURL(path.join(__dirname,'..','index.html')).href);
  // Reserve the same header space as a signed-in teacher without using an
  // account or making live API requests.
  await page.addStyleTag({content:'html body .header-actions>#krispIntegrationBtn,html body .header-actions>#krispPendingBtn{display:inline-flex!important}'});
  assert.equal(await page.$$eval('.header-actions>button',els=>els.filter(e=>getComputedStyle(e).display!=='none').length),4,'fixture includes all four signed-in header controls');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [width,height] of [[1909,990],[1536,864],[1440,720],[1366,650],[1280,720]]){
   await page.setViewport({width,height});
   for(const protocol of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
    await page.evaluate(p=>document.querySelector('input[name="protocol"][value="'+p+'"]').click(),protocol);
    await page.evaluate(()=>scrollTo(0,0));
    const geometry=await page.evaluate(()=>{
     const rect=s=>{const e=document.querySelector(s),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height,display:getComputedStyle(e).display};};
     return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
      controls:['#teacherName','#teacherSignoffEmoji','#studentName','#generateBtn','#actionRow'].map(rect),
      ratings:[...document.querySelectorAll('#ratingTrack button')].map(e=>({bottom:e.getBoundingClientRect().bottom,visible:getComputedStyle(e).display!=='none'})),
      protocols:[...document.querySelectorAll('#protocolSelect>label')].map(e=>e.getBoundingClientRect().bottom)};
    });
    assert(geometry.scrollWidth<=width+1,`${protocol} ${width}x${height}: horizontal overflow`);
    for(const r of geometry.controls)assert(r.top>=0&&r.bottom<=height&&r.left>=0&&r.right<=width&&r.width>0,`${protocol} ${width}x${height}: essential control outside viewport ${JSON.stringify(r)}`);
    assert(geometry.protocols.length===7&&geometry.protocols.every(bottom=>bottom<=height),`${protocol}: all protocol choices fit`);
    assert(geometry.ratings.filter(r=>r.visible).every(r=>r.bottom<=height),`${protocol}: ratings fit`);
    assert(await page.$$eval('.header-actions>button',els=>els.filter(e=>getComputedStyle(e).display!=='none').every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;})),`${protocol} ${width}: signed-in header fits`);
   }
  }
  // A long report must be scrollable without pushing its action buttons away.
  await page.setViewport({width:1909,height:990});
  await page.evaluate(()=>{
   document.querySelector('input[name="protocol"][value="MA"]').click();
   document.querySelector('#krispNotes').value='Synthetic notes survive window resizing.';
   const output=document.querySelector('#outputBox');output.classList.remove('empty');
   output.textContent='Synthetic report paragraph.\n'.repeat(300);
  });
  assert(await page.$eval('#outputBox',e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'),'long report scrolls within output');
  assert(await page.$eval('#actionRow',e=>e.getBoundingClientRect().bottom<=innerHeight),'report actions stay visible');
  for(const [width,height] of [[1024,768],[820,600],[390,844],[320,568]]){
   await page.setViewport({width,height});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}: no horizontal overflow including tooltips`);
   for(const selector of ['#studentName','#generateBtn','#actionRow']){
    await page.$eval(selector,e=>e.scrollIntoView({block:'center'}));
    assert(await page.$eval(selector,e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),`${width}: ${selector} remains reachable`);
   }
  }
  await page.setViewport({width:1909,height:990});
  assert.equal(await page.$eval('#krispNotes',e=>e.value),'Synthetic notes survive window resizing.');
  assert.deepEqual(errors,[]);
  console.log('PASS viewport workspace: all seven protocols at five desktop sizes; small-screen reachability, long-report scrolling and live resizing');
  return 0;
 }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
