'use strict';
const {createChecker}=require('./helpers/assert.cjs');
const fs=require('fs'),http=require('http'),path=require('path');
const puppeteer=require('puppeteer');
module.exports=async function run() {
 const {check,getFailures}=createChecker();
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  let target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(target,(err,bytes)=>{
   if(err){res.writeHead(404);return res.end();}
   const ext=path.extname(target);
   res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'application/octet-stream');
   res.end(bytes);
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser=await puppeteer.launch({headless:true});
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  let released=false,override=null;
  page.on('request',r=>{
   if(!r.url().includes('/assets/scout-release.json')) return r.continue();
   return r.respond({status:200,contentType:'application/json',body:JSON.stringify(override|| (released?{
    available:true,platform:'Windows',version:'1.0.2',
    sha256:'abcdef0123456789'.repeat(4),
    downloadUrl:'https://github.com/thembones90-sudo/classbuster-scout/releases/download/v1.0.2/ScoutSetup.exe'
   }:{available:false}))});
  });
  const url='http://127.0.0.1:'+server.address().port+'/';
  await page.goto(url,{waitUntil:'load'});
  check('unreleased Scout has no public download card',await page.$eval('#scoutReleaseBanner',el=>el.hidden&&getComputedStyle(el).display==='none'));
  released=true;
  for(const width of [1440,390]){
   await page.setViewport({width,height:900});
   await page.reload({waitUntil:'load'});
   await page.waitForFunction(()=>!document.querySelector('#scoutReleaseBanner').hidden);
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const view=await page.evaluate(()=>{
    const card=document.querySelector('#scoutReleaseBanner'),link=document.querySelector('#scoutReleaseLink'),rect=link.getBoundingClientRect();
    return {visible:!card.hidden,label:link.textContent.trim(),url:link.href,rel:link.rel,
     technical:/SHA-256|Version \d|abcdef/.test(card.innerText),
     btnHeight:link.offsetHeight,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   check(width+'px Account names the verified manifest build',await page.$eval('#radarVanReleaseInfo',el=>el.textContent==='Scout 1.0.2 · Windows · Included with Pro'));
   check(width+'px verified release presents working download CTA without overflow',
    view.visible&&view.label.includes('Download for Windows')&&view.url.includes('/releases/download/v1.0.2/ScoutSetup.exe')&&
    view.rel.includes('noopener')&&!view.technical&&view.btnHeight>=44&&!view.overflow);
   const geometry=()=>page.evaluate(()=>{
    const b=document.querySelector('#scoutReleaseBanner').getBoundingClientRect(),g=document.querySelector('.grid').getBoundingClientRect();
    return {banner:[b.x,b.y,b.width,b.height],grid:[g.x,g.y,g.width,g.height],zoom:getComputedStyle(document.querySelector('.wrap')).zoom};
   });
   const before=await geometry();
   if(process.env.SCOUT_CARD_PREVIEW)await (await page.$('#scoutReleaseBanner')).screenshot({path:path.join(process.env.SCOUT_CARD_PREVIEW,'scout-card-'+width+'.png')});
   // Keep the test offline while exercising the actual download click handler.
   await page.$eval('#scoutReleaseLink',e=>e.addEventListener('click',event=>event.preventDefault(),{once:true}));
   await page.click('#scoutReleaseLink');
   await page.waitForFunction(()=>document.querySelector('#scoutReleaseBanner').hidden);
   const after=await geometry();
   check(width+'px download removes the entire banner and its layout space',after.banner[2]===0&&after.banner[3]===0&&after.grid[1]<before.grid[1]);
   check(width+'px hiding the banner keeps workspace width and scale',before.grid[2]===after.grid[2]&&before.zoom===after.zoom);
   check(width+'px keyboard focus moves to notes after removing the focused download',await page.evaluate(()=>document.activeElement.id==='krispNotes'));
   await page.reload({waitUntil:'load'});
   await page.waitForNetworkIdle({idleTime:100});
   check(width+'px next visit has no banner or replacement strip',await page.$eval('#scoutReleaseBanner',e=>e.hidden&&e.offsetHeight===0)&&!(await page.$('.scout-release-done')));
   await page.evaluate(()=>localStorage.removeItem('classbuster_scout_download_started_v1'));
  }
  const valid={available:true,platform:'Windows',version:'1.4.14',sha256:'a'.repeat(64),downloadUrl:'https://github.com/thembones90-sudo/KIDBUSTER/releases/download/scout-1.4.14/ScoutSetup.exe'};
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!document.querySelector('#scoutReleaseBanner').hidden);
  await page.focus('#accountBtn');
  await page.evaluate(()=>window.dispatchEvent(new Event('classbuster:scout-download-started')));
  check('account download removes the banner without stealing focus',await page.evaluate(()=>document.querySelector('#scoutReleaseBanner').hidden&&document.activeElement.id==='accountBtn'&&localStorage.getItem('classbuster_scout_download_started_v1')==='1'));
  await page.evaluate(()=>localStorage.removeItem('classbuster_scout_download_started_v1'));
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!document.querySelector('#scoutReleaseBanner').hidden);
  await page.click('#scoutReleaseDismiss');
  check('existing users can dismiss and remember the banner',await page.evaluate(()=>document.querySelector('#scoutReleaseBanner').hidden&&localStorage.getItem('classbuster_scout_download_started_v1')==='1'));
  await page.evaluate(()=>localStorage.removeItem('classbuster_scout_download_started_v1'));
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!document.querySelector('#scoutReleaseBanner').hidden);
  await page.evaluate(()=>window.dispatchEvent(new Event('classbuster:scout-connected')));
  check('verified Scout connection hides and remembers the banner',await page.evaluate(()=>document.querySelector('#scoutReleaseBanner').hidden&&localStorage.getItem('classbuster_scout_download_started_v1')==='1'));
  await page.evaluate(()=>localStorage.removeItem('classbuster_scout_download_started_v1'));
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!document.querySelector('#scoutReleaseBanner').hidden);
  const peer=await browser.newPage();await peer.goto(url,{waitUntil:'load'});
  await peer.evaluate(()=>localStorage.setItem('classbuster_scout_download_started_v1','1'));
  await page.waitForFunction(()=>document.querySelector('#scoutReleaseBanner').hidden);
  check('dismissal is shared with another open tab',await page.$eval('#scoutReleaseBanner',e=>e.offsetHeight===0));
  await peer.close();
  await page.evaluate(()=>localStorage.removeItem('classbuster_scout_download_started_v1'));
  // A delayed manifest cannot resurrect a banner hidden by a connection event.
  const earlyConnection=await page.evaluateOnNewDocument(()=>window.addEventListener('DOMContentLoaded',()=>window.dispatchEvent(new Event('classbuster:scout-connected'))));
  await page.reload({waitUntil:'load'});await page.waitForNetworkIdle({idleTime:100});
  check('connection before manifest completion never resurrects the banner',await page.$eval('#scoutReleaseBanner',e=>e.hidden));
  await page.removeScriptToEvaluateOnNewDocument(earlyConnection.identifier);
  await page.evaluate(()=>localStorage.removeItem('classbuster_scout_download_started_v1'));
  for(const invalid of [{sha256:'broken'},{version:'<script>'},{downloadUrl:'https://evil.example/ScoutSetup.exe'},{downloadUrl:valid.downloadUrl+'?token=secret'},{available:false}]){
   override={...valid,...invalid};await page.reload({waitUntil:'load'});
   await page.waitForNetworkIdle({idleTime:100});
   check('invalid release remains unavailable: '+Object.keys(invalid)[0],await page.$eval('#scoutReleaseBanner',e=>e.hidden));
  }
  override=null;
  await page.evaluateOnNewDocument(()=>Object.defineProperty(Storage.prototype,'setItem',{value(){throw new Error('Storage disabled');}}));
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>!document.querySelector('#scoutReleaseBanner').hidden);
  await page.click('#scoutReleaseDismiss');
  check('blocked browser storage still allows immediate dismissal',await page.$eval('#scoutReleaseBanner',e=>e.hidden&&e.offsetHeight===0));
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
 return getFailures();
};
