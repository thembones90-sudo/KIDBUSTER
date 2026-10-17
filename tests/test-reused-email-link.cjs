'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createChecker}=require('./helpers/assert.cjs');
const puppeteer=require('puppeteer');

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 const root=path.resolve(__dirname,'..');
 const payloads=[];
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/license-verify')){
   payloads.push({url:req.url});
   res.writeHead(400,{'Content-Type':'application/json'});
   res.end(JSON.stringify({error:'This secure link is invalid or has expired. Request a new one.'}));
   return;
  }
  if(req.url.startsWith('/api/license-status')){
   const key=req.headers['x-app-key'];
   const active=key==='synthetic-already-active-test-key';
   res.writeHead(active?200:401,{'Content-Type':'application/json'});
   res.end(JSON.stringify(active?{
    status:'active',plan:'free',expired:false,
    remainingFreeReports:5,usageCount:0,email:'test@example.test'
   }:{error:'Invalid license'}));
   return;
  }
  if(req.url.startsWith('/api/')){
   res.writeHead(404,{'Content-Type':'application/json'});
   res.end('{}');
   return;
  }
  const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
  const rel=pathname==='/'?'index.html':pathname.slice(1);
  const filename=path.resolve(root,rel);
  if(!filename.startsWith(root+path.sep)&&filename!==path.join(root,'index.html')){
   res.writeHead(403);res.end();return;
  }
  fs.readFile(filename,(err,contents)=>{
   if(err){res.writeHead(404);res.end();return}
   res.writeHead(200,{'Content-Type':/\.css$/.test(filename)?'text/css':/\.js$/.test(filename)?'application/javascript':'text/html'});
   res.end(contents);
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const chromeCandidates=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'];
 const executablePath=chromeCandidates.find(s=>fs.existsSync(s));
 let browser;
 try{
  browser=await puppeteer.launch({headless:'new',args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
  async function caseCheck(active){
   const context=await browser.createBrowserContext();
   const page=await context.newPage();
   const failures=[];
   page.on('pageerror',e=>failures.push(e.message));
   if(active){
    await page.evaluateOnNewDocument(()=>{
     localStorage.setItem('kidbuster_access_key','synthetic-already-active-test-key');
    });
   }
   await page.goto(origin+'/?access_token=invalid-consumed-token-example',{waitUntil:'domcontentloaded'});
   await new Promise(resolve=>setTimeout(resolve,250));
   await page.waitForFunction(()=>{
    const txt=document.querySelector('#outputBox')?.textContent||'';
    return txt.includes('already active')||txt.includes('invalid or has expired');
   },{timeout:5000});
   const result=await page.evaluate(()=>({
    text:document.querySelector('#outputBox')?.textContent,
    isError:document.querySelector('#outputBox')?.classList.contains('error'),
    url:window.location.href,
    storedKey:!!localStorage.getItem('kidbuster_access_key')
   }));
   await context.close();
   return {...result,failures};
  }
  const active=await caseCheck(true);
  check('consumed link with a verified active license displays a helpful, non-error notice',active.text.includes('already active')&&!active.isError);
  check('active access key is retained and bearer link scrubbed from browser URL',active.storedKey&&!active.url.includes('access_token'));
  check('active account flow does not trigger page errors',active.failures.length===0);
  const noAccount=await caseCheck(false);
  check('invalid link without active access remains an error; no access granted',noAccount.isError&&noAccount.text.includes('invalid or has expired')&&!noAccount.storedKey);
  check('both URLs remove one-time token from browser location',!noAccount.url.includes('access_token'));
  check('server verification is always attempted; active saved account does not bypass token validation',payloads.length===2);
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
