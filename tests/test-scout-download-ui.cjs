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
  let released=false;
  page.on('request',r=>{
   if(!r.url().includes('/assets/scout-release.json')) return r.continue();
   return r.respond({status:200,contentType:'application/json',body:JSON.stringify(released?{
    available:true,platform:'Windows',version:'1.0.2',
    sha256:'abcdef0123456789'.repeat(4),
    downloadUrl:'https://github.com/thembones90-sudo/classbuster-scout/releases/download/v1.0.2/ScoutSetup.exe'
   }:{available:false})});
  });
  const url='http://127.0.0.1:'+server.address().port+'/';
  await page.goto(url,{waitUntil:'load'});
  check('unreleased Scout has no public download card',await page.$eval('#scoutReleaseBanner',el=>el.hidden&&getComputedStyle(el).display==='none'));
  released=true;
  for(const width of [1440,390]){
   await page.setViewport({width,height:900});
   await page.reload({waitUntil:'load'});
   await page.waitForFunction(()=>!document.querySelector('#scoutReleaseBanner').hidden);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const view=await page.evaluate(()=>{
    const card=document.querySelector('#scoutReleaseBanner'),link=document.querySelector('#scoutReleaseLink'),rect=link.getBoundingClientRect();
    return {visible:!card.hidden,label:link.textContent.trim(),url:link.href,rel:link.rel,
     version:document.querySelector('#scoutReleaseVersion').textContent,
     checksum:document.querySelector('#scoutReleaseChecksum').textContent,
     btnHeight:link.offsetHeight,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   check(width+'px verified release presents working download CTA without overflow',
    view.visible&&view.label==='Download Scout for Windows'&&view.url.includes('/releases/download/v1.0.2/ScoutSetup.exe')&&
    view.rel.includes('noopener')&&view.version.includes('1.0.2')&&view.checksum.includes('abcdef')&&view.btnHeight>=44&&!view.overflow);
  }
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
 return getFailures();
};
