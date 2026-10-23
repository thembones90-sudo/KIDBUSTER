'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),puppeteer=require('puppeteer');
module.exports=async function(){
 const live=process.env.CB_RESPONSIVE_LIVE_URL;
 if(live)assert(process.env.CB_VERIFY_PRODUCTION==='1'&&new URL(live).origin==='https://classbuster.com','Only explicitly authorized read-only Classbuster live verification is supported');
 const root=path.resolve(__dirname,'..'),shots=path.join(root,'.v2-local/responsive');fs.mkdirSync(shots,{recursive:true});
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.statusCode=403;return res.end('{}');}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  fs.readFile(file,(error,data)=>{if(error){res.statusCode=404;return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await puppeteer.launch({headless:true});
 try{
  const page=await browser.newPage(),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.url());});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.goto(live||'http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
  const viewports=[{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768},{width:1280,height:720},{width:1024,height:768},{width:900,height:600},{width:820,height:1180},{width:768,height:1024},{width:600,height:900},{width:390,height:844},{width:320,height:568},{width:640,height:360,deviceScaleFactor:2}];
  for(const viewport of viewports)for(const skin of ['dark','light']){
   await page.setViewport(viewport);
   await page.evaluate(skin=>{document.documentElement.dataset.appearance=skin;window.scrollTo(0,0);},skin);
   for(const protocol of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
    await page.evaluate(value=>document.querySelector('input[name="protocol"][value="'+value+'"]').click(),protocol);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const layout=await page.evaluate(()=>{
     const rect=id=>document.getElementById(id).getBoundingClientRect();
     const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
     const controls=[...document.querySelectorAll('.header button,.scout-workspace-entry button,.grid input[type="text"],.grid select,.grid textarea,#protocolSelect>label,#lengthFormatSelect>label,.grid .generate-btn')].filter(visible);
     return {overflow:document.documentElement.scrollWidth>innerWidth+1,
      fit:controls.every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;}),
      readable:parseFloat(getComputedStyle(document.getElementById('krispNotes')).fontSize)>=15,
      badTargets:controls.filter(e=>e.matches('button,input[type="text"],select,#protocolSelect>label,#lengthFormatSelect>label')&&e.getBoundingClientRect().height<43).map(e=>e.id+':'+e.getBoundingClientRect().height),
      titles:[...document.querySelectorAll('#protocolSelect>label')].every(e=>{const text=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());const range=document.createRange();range.selectNodeContents(text);return range.getBoundingClientRect().bottom-e.getBoundingClientRect().top<parseFloat(getComputedStyle(e,'::after').top);}),
      sidebarMin:getComputedStyle(document.querySelector('.grid>div:first-child>.panel')).minHeight,
      columns:getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length,
      ratingFits:[...document.querySelectorAll('#ratingTrack button')].filter(visible).every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight-8;}),
      fitted:document.body.classList.contains('workspace-height-fit'),
      outputFits:['outputLabel','actionRow','copyBtn','clearBtn','newStudentBtn','workspaceOutputScroll'].every(id=>{const e=document.getElementById(id);if(!e)return false;const r=e.getBoundingClientRect();return r.height>0&&r.top>=0&&r.bottom<=innerHeight-8;}),
      notes:rect('krispNotes').height,generate:rect('generateBtn').bottom,
      scale:getComputedStyle(document.body).zoom,transform:getComputedStyle(document.querySelector('.wrap')).transform,
      summary:document.getElementById('generateSummary').scrollWidth<=document.getElementById('generateSummary').clientWidth+1};
    });
    const label=viewport.width+'x'+viewport.height+' '+skin+' '+protocol;
    assert(!layout.overflow&&layout.fit,label+' has no clipped controls or horizontal scroll');
    assert(layout.readable&&layout.badTargets.length===0,label+' keeps readable text and usable targets: '+layout.badTargets.join(', '));
    assert(layout.titles,label+' protocol names stay separate from subtitles');
    assert.equal(layout.scale,'1',label+' does not shrink the app using zoom');assert.equal(layout.transform,'none');
    assert.equal(layout.columns,viewport.width<=860?1:2,label+' uses the appropriate column layout');
    if(viewport.width<=1100||viewport.height<=820){assert.equal(layout.sidebarMin,'0px',label+' has no fixed-height sidebar');assert(layout.summary,label+' summary wraps without clipping');}
    if(viewport.width>860&&viewport.height<=820){assert(layout.notes<=187,label+' note area responds to short height');assert(layout.generate<viewport.height,label+' Generate remains above the fold');}
    if(viewport.width>860)assert(layout.ratingFits,label+' every rating button is inside the visible browser height');
    if(layout.fitted)assert(layout.outputFits,label+' output viewport and its actions are fully inside the visible browser height');
   }
   await page.evaluate(()=>document.querySelector('input[name="protocol"][value="MA"]').click());
   // Include both integration controls without accessing any real account.
   await page.evaluate(()=>{document.getElementById('krispIntegrationBtn').hidden=false;document.getElementById('krispPendingBtn').hidden=false;});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   if(viewport.width>860)assert(await page.$$eval('#ratingTrack button',els=>els.every(e=>e.getBoundingClientRect().bottom<=innerHeight-8)),viewport.width+' ratings remain visible with all header controls');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),viewport.width+' authenticated header reflows');
   assert(await page.$$eval('.header button',els=>{
    const rects=els.filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
    return rects.every((a,i)=>a.left>=0&&a.right<=innerWidth&&rects.every((b,j)=>i===j||a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1));
   }),viewport.width+' header buttons stay visible without overlapping');
   await page.screenshot({path:path.join(shots,(live?'live-':'')+viewport.width+'x'+viewport.height+'-'+skin+'.png')});
   await page.evaluate(()=>{document.getElementById('krispIntegrationBtn').hidden=true;document.getElementById('krispPendingBtn').hidden=true;});
   console.log('PASS adaptive '+viewport.width+'x'+viewport.height+' '+skin+': seven protocols, readable controls, header reflow');
  }
  // Reproduce the user's sequence in one tab: normal, narrower, then shorter.
  await page.evaluate(()=>{
   document.querySelector('input[name="protocol"][value="MA"]').click();
   document.getElementById('teacherName').value='Synthetic Teacher';
   document.getElementById('studentName').value='Synthetic Student';
   document.getElementById('krispNotes').value='Synthetic lesson notes retained during resizing.';
   document.getElementById('krispIntegrationBtn').hidden=false;
   document.getElementById('krispPendingBtn').hidden=false;
  });
  const resizeHeights=[];
  for(const viewport of [{width:1600,height:1300},{width:1000,height:1100},{width:1000,height:720},{width:1000,height:560}]){
   await page.setViewport(viewport);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const state=await page.evaluate(()=>{
    const ratings=[...document.querySelectorAll('#ratingTrack button')];
    const panel=document.querySelector('.grid>div:first-child>.panel');
    return {height:panel.getBoundingClientRect().height,fit:ratings.every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight-8;}),mode:document.body.classList.contains('workspace-height-fit'),outputFits:['outputLabel','actionRow','copyBtn','workspaceOutputScroll'].every(id=>{const e=document.getElementById(id);if(!e)return false;const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight-8;})};
   });
   assert(state.fit,'all ratings remain visible after live resize to '+viewport.width+'x'+viewport.height);
   resizeHeights.push(state.height);
   if(viewport.height===1300)assert(!state.mode,'tall windows retain the unrestricted original layout');
   if(viewport.height===560){
    assert(state.mode,'short windows activate actual height fitting');
    assert(state.outputFits,'short windows keep Output and Copy inside the viewport as well as ratings');
    await page.evaluate(()=>document.getElementById('teacherName').focus());
    assert(await page.evaluate(()=>{const input=document.getElementById('teacherName').getBoundingClientRect(),settings=document.getElementById('workspaceSettingsScroll').getBoundingClientRect();return input.top>=settings.top&&input.bottom<=settings.bottom;}),'keyboard focus reveals identity controls inside the settings scroller');
    await page.evaluate(()=>document.querySelector('#ratingTrack button:last-child').click());
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert(await page.$$eval('#ratingTrack button',els=>els.every(e=>e.getBoundingClientRect().bottom<=innerHeight-8)),'selected rating and caption cannot push ratings below the viewport');
    await page.screenshot({path:path.join(shots,(live?'live-':'')+'resized-short-ratings.png')});
   }
  }
  assert(resizeHeights[3]<resizeHeights[2],'settings panel really resizes when the bottom edge is dragged upward');
  assert(await page.evaluate(()=>document.getElementById('teacherName').value==='Synthetic Teacher'&&document.getElementById('studentName').value==='Synthetic Student'&&document.getElementById('krispNotes').value==='Synthetic lesson notes retained during resizing.'),'window resizing preserves entered lesson data');
  await page.setViewport({width:1024,height:768});
  // Real keyboard input must keep the caret visible, including editing in the
  // middle of a long comment. Counter updates must not refit the whole page.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  for(const id of ['krispNotes','specialRemarks']){
   await page.evaluate(id=>{
    const field=document.getElementById(id);
    field.value=Array.from({length:30},(_,i)=>'Synthetic comment line '+i).join('\n');
    field.focus();field.setSelectionRange(field.value.length,field.value.length);
    field.scrollTop=field.scrollHeight;
   },id);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
   await new Promise(resolve=>setTimeout(resolve,150));
   await page.evaluate(()=>{
    window.typingRefits=0;
    window.typingObserver=new MutationObserver(records=>{window.typingRefits+=records.length;});
    window.typingObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
   });
   await page.keyboard.type(' additional words',{delay:30});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert(await page.$eval('#'+id,e=>e.scrollTop>0&&e.scrollHeight-e.clientHeight-e.scrollTop<6),id+' follows the caret while typing at the end');
   assert.equal(await page.evaluate(()=>window.typingRefits),0,id+' counter updates do not refit the layout');
   await page.evaluate(id=>{
    window.typingObserver.disconnect();
    const field=document.getElementById(id),position=field.value.indexOf('line 15')+7;
    field.setSelectionRange(position,position);
   },id);
   await page.keyboard.type(' middle edit',{delay:30});
   assert(await page.$eval('#'+id,e=>e.selectionStart<e.value.length-100&&e.scrollTop>0&&e.scrollTop<e.scrollHeight-e.clientHeight-10),id+' editing the middle does not force the beginning or end');
   const cursor=await page.$eval('#'+id,e=>e.selectionStart);
   await page.setViewport({width:1024,height:720});
   await new Promise(resolve=>setTimeout(resolve,150));
   assert(await page.$eval('#'+id,(e,cursor)=>e.selectionStart===cursor&&e.scrollTop>0,cursor),id+' layout resizing preserves the editing position');
   await page.setViewport({width:1024,height:768});
  }
  console.log('PASS keyboard editing: notes and remarks retain caret visibility without layout refits');
  const grows=await page.evaluate(()=>{const box=document.getElementById('outputBox');box.className='output-box';box.textContent=('Synthetic report text for responsive testing.\n').repeat(100);return box.getBoundingClientRect().height>1000&&box.scrollHeight<=box.clientHeight+2;});
  assert(grows,'generated reports grow naturally instead of clipping into a fixed-height box');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const reportScroll=await page.$eval('#workspaceOutputScroll',e=>{e.scrollTop=e.scrollHeight;return e.scrollHeight>e.clientHeight&&e.scrollTop>0&&e.getBoundingClientRect().bottom<=innerHeight;});
  assert(reportScroll,'long reports scroll within the visible output viewport');
  assert(await page.$eval('#copyBtn',e=>e.getBoundingClientRect().bottom<=innerHeight-8),'Copy remains visible while a long report scrolls');
  await page.evaluate(()=>document.getElementById('krispNotes').style.height='360px');
  assert(await page.$eval('#krispNotes',e=>e.getBoundingClientRect().height>=360),'manual note resize remains available');
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'layout verification never submits account or generation requests');return 0;
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
