'use strict';
const assert=require('node:assert/strict');
module.exports=async()=>{
 const fixture=await require('./helpers/transcript-card-fixture.cjs')();
 const browser=await require('puppeteer').launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.emulateTimezone('Europe/Belgrade');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  await page.evaluateOnNewDocument(()=>localStorage.setItem('kidbuster_access_key','synthetic-card-preview'));
  await page.goto(fixture.url,{waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelectorAll('.radar-van-item').length===2&&document.querySelectorAll('.krisp-pending-card').length===1);
  await page.click('#krispPendingBtn');
  assert.deepEqual(await page.$$eval('.radar-van-item-title',es=>es.map(e=>e.textContent)),['Jackie','Lesson · Oct 24, 12:59 PM']);
  assert.equal(await page.$eval('.radar-van-item-meta',e=>e.textContent),'26 min recorded · Scout');
  assert.match(await page.$eval('.radar-van-item-time',e=>e.textContent),/12:59.*1:25/);
  assert.ok(!(await page.$eval('.radar-van-item-meta',e=>e.textContent)).includes('Classbuster Scout lesson'),'generic title is not repeated below a known student');
  assert.deepEqual(await page.$$eval('.radar-van-claim,.krisp-insert-btn',es=>es.map(e=>e.textContent)),Array(3).fill('Import into notes'));
  assert.equal(await page.$eval('#krispPendingWrap>div:first-child',e=>getComputedStyle(e).display),'none','one visible source counter, no nested duplicate badges');
  assert.equal(await page.$eval('#krispNotes',e=>e.value),'','rendering must not import either provider');
  for(const [width,height] of [[1440,1000],[900,550],[390,780],[320,480]]){
   await page.setViewport({width,height});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.$$eval('.radar-van-item',es=>es.map(e=>{
    const r=e.getBoundingClientRect(),body=e.querySelector('.radar-van-item-body').getBoundingClientRect(),actions=e.querySelector('.radar-van-row').getBoundingClientRect();
    return {left:r.left,right:r.right,overflow:e.scrollWidth-e.clientWidth,bodyRight:body.right,bodyBottom:body.bottom,actionsLeft:actions.left,actionsTop:actions.top};
   }));
   for(const card of layout){assert.ok(card.left>=0&&card.right<=width&&card.overflow<=1,JSON.stringify({width,...card}));if(width>520)assert.ok(card.actionsLeft>=card.bodyRight);else assert.ok(card.actionsTop>=card.bodyBottom);}
  }
  assert.deepEqual(fixture.state.actions,[],'visual presentation never claims, dismisses, ACKs or generates');
  fixture.state.scout[0].studentLabel='<img src=x onerror="window.__injected=true">';
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>document.querySelector('.radar-van-item-title')?.textContent.includes('<img'));
  assert.equal(await page.$eval('.radar-van-item-title',e=>e.children.length),0,'explicit labels render only as text');
  assert.equal(await page.evaluate(()=>!!window.__injected),false);
  console.log('PASS transcript cards: explicit names, dated fallback, no speech-name guessing, shared actions, responsive hierarchy and safe text rendering');
  return 0;
 }finally{await browser.close();await new Promise(r=>fixture.server.close(r));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
