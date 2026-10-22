'use strict';
// Read-only hosted acceptance check. No login, signup, payment or generation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
(async()=>{
 const url=new URL(process.env.KIDBUSTER_LIVE_URL||'');
 const production=url.origin==='https://classbuster.com'&&process.env.CB_VERIFY_PRODUCTION==='1';
 assert(url.protocol==='https:'&&(production||(url.hostname.startsWith('pathfinder-v2-staging-')&&url.hostname.endsWith('.vercel.app'))),'Requires isolated staging Preview URL or explicit read-only Classbuster production verification');
 const shots=path.resolve(__dirname,'../.v2-local/onboarding/screenshots');fs.mkdirSync(shots,{recursive:true});
 const browser=await puppeteer.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1440,height:1000});
  await page.evaluateOnNewDocument(()=>localStorage.setItem('pathfinder_appearance_v1','dark'));
  await page.goto(url.href,{waitUntil:'networkidle0'});
  assert(await page.$eval('#cbOnboardingOverlay',e=>e.hidden),'No pre-registration onboarding');
  for(const {width,height} of [{width:1440,height:900},{width:390,height:640},{width:320,height:568}]){
   await page.setViewport({width,height});
   const newcomer=await page.$eval('#helpBtn',e=>!e.classList.contains('onboarding-done'));
   await page.click('#helpBtn');if(!newcomer)await page.click('#replayOnboardingBtn');
   const titles=['Welcome to Classbuster','Your first report','Meet Scout','You’re ready!'];
   for(let i=0;i<4;i++){
    assert.equal(await page.$eval('#cbTourTitle',e=>e.textContent),titles[i]);
    if(i===1)assert(await page.$eval('.cb-trial-note',e=>e.textContent.includes('5 Classic reports every month')&&e.textContent.includes('each other style with 5 free reports')&&e.textContent.includes('one-time allowances')));
    assert(await page.$eval('.cb-tour',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth;}));
    if(i===1)await page.click('#cbExampleBtn');
    for(const bottom of [false,true])assert(await page.evaluate(bottom=>{
     const body=document.querySelector('#cbTourBody');body.scrollTop=bottom?body.scrollHeight:0;
     return [...document.querySelectorAll('#cbTourFooter button')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.right<=innerWidth;});
    },bottom),'Navigation remains visible while explanation scrolls');
    await page.evaluate(()=>Promise.all(document.querySelector('#cbTourContent').getAnimations().map(a=>a.finished.catch(()=>{}))));
    await page.screenshot({path:path.join(shots,(production?'live':'preview')+'-'+width+'-stage-'+(i+1)+'.png')});
    if(i===2){assert(await page.$eval('[data-scout-download]',e=>e.hidden&&!e.hasAttribute('href')));await page.click('#cbSkipScout');}
    else if(i<3)await page.click('[data-next]');
   }
   await page.click('[data-done]');
   assert(await page.$eval('#cbOnboardingOverlay',e=>e.hidden));
   assert.equal(await page.$eval('#helpBtn',e=>e.textContent),'Help & guide');
   await page.click('#scoutWorkspaceBtn');
   assert.equal(await page.$eval('#cbTourTitle',e=>e.textContent),'Meet Scout');
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'scoutWorkspaceBtn');
   console.log('PASS hosted '+width+'px: all four stages, replay, permanent Scout, unavailable gate, Escape and focus');
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS hosted onboarding has no JavaScript exceptions; no accounts or integrations were modified');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
