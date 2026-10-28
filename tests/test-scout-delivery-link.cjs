'use strict';
const assert=require('node:assert/strict');
module.exports=async()=>{
 const fixture=await require('./helpers/transcript-card-fixture.cjs')();
 const browser=await require('puppeteer').launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.evaluateOnNewDocument(()=>localStorage.setItem('kidbuster_access_key','synthetic-card-preview'));
  for(const [id,found] of [['00000000-0000-4000-8000-000000000001',true],['00000000-0000-4000-8000-000000000099',false]]){
   await page.goto(fixture.url+'/?scout-lesson='+id,{waitUntil:'load'});
   await page.waitForFunction(()=>document.getElementById('krispInboxPanel').matches(':popover-open'));
   if(found)await page.waitForFunction(id=>document.activeElement?.dataset.meetingId==='rv:'+id,{},id);
   else await page.waitForFunction(()=>document.getElementById('radarVanPendingPopoverStatus').textContent.includes('no longer pending'));
   assert.equal(await page.$eval('#krispNotes',e=>e.value),'','receipt cannot import a transcript');
   assert.ok(!page.url().includes('scout-lesson'),'receipt parameter consumed without changing account');
  }
  await page.goto(fixture.url+'/?scout-lesson=invalid',{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelectorAll('.radar-van-item').length===2);
  assert.equal(await page.$eval('#krispInboxPanel',e=>e.matches(':popover-open')),false);
  assert.deepEqual(fixture.state.actions,[],'links never claim, dismiss, ACK or generate');
  console.log('PASS Scout delivery links: exact card, missing card, invalid link and no mutations');
  return 0;
 }finally{await browser.close();await new Promise(r=>fixture.server.close(r));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
