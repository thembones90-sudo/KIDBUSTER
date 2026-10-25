const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const puppeteer=require('puppeteer');
module.exports=async function(){
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){
   res.writeHead(pathname==='/api/license-status'?200:403,{'content-type':'application/json'});
   return res.end(JSON.stringify(pathname==='/api/license-status'?{status:'active',plan:'pro',founder:true}:{}));
  }
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>localStorage.setItem('kidbuster_access_key','synthetic-initial-fit-owner'));
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
  await page.evaluate(()=>document.fonts.ready);
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
  for(const [width,height] of [[1909,943],[1536,864],[1440,720],[1366,650],[1280,600],[1024,768],[390,844]]){
   await page.setViewport({width,height,isMobile:width===390});
   for(const protocol of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
    await page.evaluate(p=>document.querySelector('input[name="protocol"][value="'+p+'"]').click(),protocol);await settle();
    const before=await page.evaluate(()=>({zoom:document.querySelector('.wrap').style.zoom,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight}));
    assert(before.width<=width&&before.height<=height,protocol+' initial workspace fits '+width+'x'+height+' '+JSON.stringify(before));
    assert(+before.zoom>0&&+before.zoom<=1);
    const hasSix=await page.evaluate(()=>{const b=document.querySelector('#ratingTrack [data-lvl="6"]');if(b)b.click();return !!b;});
    if(hasSix){
     await new Promise(r=>setTimeout(r,180));await settle();
     assert.equal(await page.evaluate(()=>document.querySelector('.wrap').style.zoom),before.zoom,'rating 6 never changes initial scale '+protocol);
     assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),'rating explanation remains on screen');
    }
   }
  }
  await page.setViewport({width:1909,height:943,isMobile:false});await settle();
  await page.click('#accountBtn');
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('accountPanel')).display!=='none');await settle();
  const account=await page.evaluate(()=>({zoom:getComputedStyle(document.querySelector('.wrap')).zoom,width:document.querySelector('.wrap').getBoundingClientRect().width,title:getComputedStyle(document.querySelector('#accountPanel .account-title')).fontSize,fitted:document.body.classList.contains('initial-workspace-fit')}));
  assert.equal(account.zoom,'1');assert.equal(account.width,1240);assert.equal(account.title,'20px');assert.equal(account.fitted,false);
  await page.click('#accountBtn');await settle();
  assert(await page.evaluate(()=>document.body.classList.contains('initial-workspace-fit')),'closing Account restores only initial fitting');
  const popover=await page.evaluate(()=>{const p=document.getElementById('krispInboxPanel');window.testPopoverParent=p.parentElement;p.showPopover();return true;});
  await settle();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.wrap')).zoom),'1','native popovers use original unscaled workspace');
  assert(await page.evaluate(()=>document.getElementById('krispInboxPanel').parentElement===window.testPopoverParent),'popover DOM parent is preserved');
  await page.evaluate(()=>document.getElementById('krispInboxPanel').hidePopover());await settle();
  await page.evaluate(()=>{
   document.querySelector('input[name="protocol"][value="MA"]').click();
   document.querySelector('#ratingTrack [data-lvl="6"]').click();
   for(const [id,value] of Object.entries({teacherName:'Teacher',studentName:'Synthetic Student',krispNotes:'A fictional lesson about past tense and vocabulary.'})){
    const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
   }
   callClaude=()=>new Promise(resolve=>{
    window.finishSyntheticFitReport=()=>resolve({text:'Hi Synthetic Student!\n\n'+('Fictional vocabulary and past-tense practice.\n\n').repeat(80)+'Teacher',usage:null,trialStatus:null});
   });
   copyOutputToClipboard=()=>true;
  });
  await new Promise(r=>setTimeout(r,180));await settle();
  const dimensions=()=>page.evaluate(()=>{
   const box=s=>document.querySelector(s).getBoundingClientRect();
   return {zoom:getComputedStyle(document.querySelector('.wrap')).zoom,canvas:box('.wrap').width,notes:box('#krispNotes').width,notesHeight:box('#krispNotes').height,teacher:box('#teacherName').height,logo:box('#kbLogo').width};
  });
  const beforeGenerate=await dimensions();
  await page.click('#generateBtn');
  await page.waitForFunction(()=>typeof window.finishSyntheticFitReport==='function');await settle();
  assert.deepEqual(await dimensions(),beforeGenerate,'Generate must not resize the canvas, notes, teacher input or logo while preparing');
  await page.evaluate(()=>window.finishSyntheticFitReport());
  await page.waitForFunction(()=>document.getElementById('outputBox').textContent.includes('Hi Synthetic Student!'));
  await page.waitForFunction(()=>!document.getElementById('generateBtn').disabled);
  await page.waitForFunction(()=>window.scrollY>0);await settle();
  const report=await page.evaluate(()=>{const o=document.getElementById('outputBox');return {zoom:getComputedStyle(document.querySelector('.wrap')).zoom,length:o.textContent.length,internal:o.scrollHeight-o.clientHeight,panel:o.parentElement.scrollHeight-o.parentElement.clientHeight,height:document.documentElement.scrollHeight};});
  assert.deepEqual(await dimensions(),beforeGenerate,'completed report must retain the exact pre-Generate display dimensions');
  assert.equal(report.zoom,beforeGenerate.zoom);assert(report.length>3000&&report.height>943);assert(report.internal<=1&&report.panel<=1,'natural report, without internal scrollbars');
  await page.evaluate(()=>{
   const notes=document.getElementById('krispNotes');notes.value='A second fictional lesson.';notes.dispatchEvent(new Event('input',{bubbles:true}));
   void generate();
  });
  await page.waitForFunction(()=>document.getElementById('outputBox').classList.contains('is-generating'));
  assert.deepEqual(await dimensions(),beforeGenerate,'generating a second report keeps the same display size');
  await page.evaluate(()=>window.finishSyntheticFitReport());
  await page.waitForFunction(()=>!document.getElementById('outputBox').classList.contains('is-generating'));await settle();
  await page.waitForFunction(()=>!document.getElementById('generateBtn').disabled);
  assert.deepEqual(await dimensions(),beforeGenerate,'previous-report controls cannot change the display size');
  await page.click('#newStudentBtn');
  await page.waitForFunction(()=>document.getElementById('outputBox').classList.contains('empty')&&document.body.classList.contains('initial-workspace-fit'));
  await settle();
  assert(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),'New Student returns to fitted initial workspace');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS fixed workspace scale: 7 protocols/7 screens, stable rating 6; identical dimensions before/during/after repeated generation, normal page scrolling, original Account/popovers and New Student');return 0;
 }finally{await browser.close();await new Promise(r=>server.close(r));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
