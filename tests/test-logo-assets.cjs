'use strict';
// Slice 11: protocol logos live in assets/logos/*.png instead of ~1.3 MB of base64
// inside index.html. They must exist, be real PNGs, load for every protocol, and
// keep the "no flourish when nothing changed" behaviour.
const fs=require('fs');
const path=require('path');
const http=require('http');
const {createChecker}=require('./helpers/assert.cjs');
const ROOT=path.join(__dirname,'..');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-logo-assets.cjs ===');
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');

  console.log('\n1) static: index.html is slim and the logo files are real');
  check('index.html is under 600 KB',Buffer.byteLength(html)<600*1024);
  check('no large base64 image remains inline',!/data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+\/=]{4000,}/.test(html));
  const tag=(html.match(/<img[^>]*id="kbLogo"[^>]*>/)||[''])[0];
  const refs=[...tag.matchAll(/(?:src|data-logo-[a-z]+)="(assets\/brand\/classbuster\/[^"]+)"/g)].map(m=>m[1]);
  check('all six logo slots use the approved Classbuster artwork',refs.length===6&&new Set(refs).size===1);
  let allPng=refs.length>0;
  for(const r of refs){
    const f=path.join(ROOT,r);
    if(!fs.existsSync(f)){allPng=false;continue;}
    const b=fs.readFileSync(f);
    if(b.length<10000||b.slice(0,8).toString('hex')!=='89504e470d0a1a0a')allPng=false;
  }
  check('every referenced logo exists and is a valid PNG',allPng);

  let puppeteer,launchOptions;
  try{
    puppeteer=require('puppeteer');
    const installed=process.platform==='win32'?['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']:[];
    const executablePath=installed.find(p=>fs.existsSync(p));
    launchOptions=executablePath?{executablePath}:{};
  }catch(e){console.log('  SKIPPED browser part - no usable puppeteer ('+e.message+')');return getFailures();}

  const server=http.createServer((req,res)=>{
    let rel=decodeURIComponent(new URL(req.url,'http://x').pathname);if(rel==='/')rel='/index.html';
    const file=path.join(ROOT,rel);
    if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    const ext=path.extname(file);
    res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.png':'image/png','.woff2':'font/woff2'}[ext]||'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await puppeteer.launch({args:['--no-sandbox'],...launchOptions});
  try{
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const failedImages=[];page.on('requestfailed',r=>{if(/\.png/.test(r.url()))failedImages.push(r.url());});
    page.on('response',r=>{if(/\.png/.test(r.url())&&r.status()!==200)failedImages.push(r.status()+' '+r.url());});
    await page.setViewport({width:1280,height:900});
    await page.goto(origin+'/',{waitUntil:'load'});

    console.log('\n2) browser: every protocol shows a loaded logo');
    const protocols=await page.evaluate(()=>[...document.querySelectorAll('#protocolSelect input[name="protocol"]')].map(i=>i.value));
    const seen={};
    for(const p of protocols){
      await page.evaluate(v=>document.querySelector('#protocolSelect input[value="'+v+'"]').click(),p);
      await page.waitForFunction(()=>{const i=document.getElementById('kbLogo');return i.complete&&i.naturalWidth>0;},{timeout:5000}).catch(()=>{});
      seen[p]=await page.evaluate(()=>{const i=document.getElementById('kbLogo');return {src:i.getAttribute('src')||i.src,w:i.naturalWidth};});
    }
    check('all seven protocols were exercised',protocols.length===7);
    check('every protocol logo has real pixels',protocols.every(p=>seen[p].w>0));
    check('no logo request failed or returned a non-200',failedImages.length===0);
    check('all seven protocols retain the Classbuster platform logo',
      new Set(protocols.map(p=>seen[p].src)).size===1);

    console.log('\n3) no pointless flourish when the logo does not change');
    const flourishes=await page.evaluate(()=>{
      const img=document.getElementById('kbLogo');let n=0;const orig=img.animate;
      img.animate=function(){n++;return orig.apply(this,arguments);};
      document.querySelector('#protocolSelect input[value="OF"]').click();
      const afterFirst=n;
      updateLogo();updateLogo();updateLogo();
      return {afterFirst,afterRepeats:n};
    });
    check('repeating updateLogo() for the same protocol plays no extra animation',flourishes.afterRepeats===flourishes.afterFirst);
    check('no uncaught JavaScript errors',errors.length===0);
  }finally{
    await browser.close();await new Promise(r=>server.close(r));
  }
  return getFailures();
};
if(require.main===module){module.exports().then(n=>process.exit(n?1:0));}
