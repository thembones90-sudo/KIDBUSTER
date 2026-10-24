'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
module.exports=async function(){
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){res.writeHead(403,{'content-type':'application/json'});return res.end('{}');}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
  res.end(fs.readFileSync(file));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await require('puppeteer').launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.evaluate(()=>document.fonts.ready);
  for(const [width,height] of [[1440,900],[900,550],[390,780],[320,480]])for(const populated of [false,true]){
   await page.setViewport({width,height});
   await page.evaluate(full=>{
    const panel=document.getElementById('krispInboxPanel');
    document.getElementById('krispPendingGroup').hidden=false;
    document.getElementById('radarVanPendingGroup').hidden=false;
    document.getElementById('krispInboxEmpty').hidden=full;
    document.getElementById('radarVanPendingPopoverStatus').textContent=full?'1 lesson ready to import.':'No Scout transcripts pending.';
    document.getElementById('krispInboxContent').innerHTML=full?'<div class="krisp-pending-card" style="display:flex;justify-content:space-between"><div>Morning lesson<br><small>Today · 25 minutes</small></div><div><button class="krisp-insert-btn">Insert</button></div></div>':'';
    document.getElementById('radarVanPendingPopoverList').innerHTML=full?'<li class="radar-van-item"><strong class="radar-van-item-title">Afternoon lesson with a longer title that wraps naturally</strong><span class="radar-van-item-meta">Today · 43 minutes</span><p class="radar-van-item-preview">A captured lesson is ready for review. This is synthetic visual test content, not a student transcript.</p><div class="radar-van-row"><button class="radar-van-claim">Claim into Notes</button><button class="radar-van-dismiss">Dismiss</button></div></li>':'';
    if(!panel.matches(':popover-open'))panel.showPopover();
    panel.style.left='50%';panel.style.top='50%';panel.style.bottom='auto';panel.style.right='auto';panel.style.transform='translate(-50%,-50%)';
    panel.scrollTop=0;
   },populated);
   const layout=await page.$eval('#krispInboxPanel',el=>{
    const r=el.getBoundingClientRect(),s=getComputedStyle(el),title=getComputedStyle(el.querySelector('h2'));
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,overflow:el.scrollWidth-el.clientWidth,
     titleFont:title.fontFamily,titleSize:parseFloat(title.fontSize),bg:s.backgroundImage,
     groupBg:getComputedStyle(el.querySelector('#krispPendingGroup')).backgroundImage,
     emptyBorder:getComputedStyle(el.querySelector('#krispInboxEmpty')).borderTopWidth,
     closeHeight:el.querySelector('#krispInboxClose').getBoundingClientRect().height};
   });
   assert.ok(layout.left>=-1&&layout.right<=width+1&&layout.top>=-1&&layout.bottom<=height+1,'popover fits '+width+'x'+height);
   assert.ok(layout.overflow<=1,'no horizontal inbox clipping');
   assert.ok(!/Georgia|Times/.test(layout.titleFont)&&layout.titleSize<=22,'compact sans-serif heading');
   assert.ok(layout.bg.includes('37, 40, 43'),'granite background');
   assert.equal(layout.groupBg,'none');assert.equal(layout.emptyBorder,'0px');assert.ok(layout.closeHeight>=44);
   if(!populated)assert.ok(layout.height<360,'empty state is compact: '+JSON.stringify({width,height,...layout}));
   if(process.env.INBOX_SCREENSHOTS&&[1440,390].includes(width)){
    fs.mkdirSync(process.env.INBOX_SCREENSHOTS,{recursive:true});
    await page.screenshot({path:path.join(process.env.INBOX_SCREENSHOTS,'inbox-'+width+'-'+(populated?'populated':'empty')+'.png')});
   }
  }
  await page.keyboard.press('Escape');assert.equal(await page.$eval('#krispInboxPanel',e=>e.matches(':popover-open')),false);
  console.log('PASS granite inbox: empty/populated desktop, mobile, short windows, compact typography, no nested empty boxes, Escape');return 0;
 }finally{await browser.close();await new Promise(r=>server.close(r));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
