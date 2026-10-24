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
  await page.waitForFunction(()=>[...document.querySelectorAll('.source-pending-icon img')].every(e=>e.complete&&e.naturalWidth>0));
  const logos=await page.$$eval('.source-pending-icon img',es=>es.map(e=>({src:e.getAttribute('src'),alt:e.alt,width:parseFloat(getComputedStyle(e).width),height:parseFloat(getComputedStyle(e).height)})));
  assert.deepEqual(logos,[{src:'assets/logos/krisp-neutral.png',alt:'',width:28,height:28},{src:'assets/brand/classbuster/apple-touch-icon.png',alt:'',width:28,height:28}],'use Krisp K and current Classbuster book/lightning brand, never the retired Pathfinder compass');
  assert.equal(await page.$eval('.krisp-source-icon',e=>getComputedStyle(e).backgroundColor),'rgb(231, 235, 230)','dark Krisp mark has a readable pale backing');
  assert.equal(await page.$$eval('.source-pending-icon svg',es=>es.length),0,'generic source glyphs are replaced, not overlaid');
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
   const centers=await page.$$eval('.source-pending-icon img',es=>es.map(e=>{
    const badge=e.parentElement.getBoundingClientRect(),image=e.getBoundingClientRect(),style=getComputedStyle(e.parentElement);
    const canvas=document.createElement('canvas');canvas.width=e.naturalWidth;canvas.height=e.naturalHeight;
    const ctx=canvas.getContext('2d');ctx.drawImage(e,0,0);const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let left=canvas.width,top=canvas.height,right=0,bottom=0;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    return{dx:image.left+(left+right)/2/canvas.width*image.width-(badge.left+badge.width/2),dy:image.top+(top+bottom)/2/canvas.height*image.height-(badge.top+badge.height/2),padding:style.padding,badgeWidth:badge.width,badgeHeight:badge.height};
   }));
   for(const center of centers){assert.equal(center.padding,'0px','legacy count span padding must not affect logo badges');assert.equal(center.badgeWidth,28);assert.equal(center.badgeHeight,28);assert.ok(Math.abs(center.dx)<.3&&Math.abs(center.dy)<.3,'visible provider artwork must be centered: '+JSON.stringify({width,...center}));}
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
