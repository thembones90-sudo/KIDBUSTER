'use strict';
// Scout public release (owner approval 2026-11-02), real browser + real
// session and download handlers, in-memory KV, loopback server, synthetic keys:
// a Pro teacher sees the Scout panel; a Free teacher does not; the panel's
// Download button uses the public release when it is published, says "not
// available yet" before that, and never hands a Pro teacher the private
// master installer. No production credentials or network.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createChecker} = require('./helpers/assert.cjs');
const ROOT = path.resolve(__dirname, '..');
const PRO = 'kb_live_' + '4'.repeat(48), FREE = 'kb_live_' + '5'.repeat(48);
const RELEASE = 'https://github.com/thembones90-sudo/KIDBUSTER/releases/download/scout-1.4.11/ScoutSetup.exe';

module.exports = async function run(){
  const {check,getFailures} = createChecker();
  console.log('\n=== test-scout-pro-browser.cjs ===');
  const names = ['KIDBUSTER_TEST_KV','OWNER_LICENSE_KEYS','RADAR_VAN_ENABLED','RADAR_VAN_OWNER_SHA256','BLOB_STORE_ID'];
  const previous = Object.fromEntries(names.map(k=>[k,process.env[k]]));
  process.env.KIDBUSTER_TEST_KV='1'; process.env.OWNER_LICENSE_KEYS='scout-pro-browser-owner';
  process.env.RADAR_VAN_ENABLED='true';
  process.env.RADAR_VAN_OWNER_SHA256=require('node:crypto').createHash('sha256').update('scout-pro-browser-owner').digest('hex');
  process.env.BLOB_STORE_ID='synthetic-store';
  let browser,server;
  try{
    const kvmod = await import('../api/_lib/kv-client.js'); kvmod.__resetForTests();
    const lic = await import('../api/_lib/licensing.js');
    await lic.saveLicense(PRO,{plan:'pro',status:'active',source:'subscription',subscriptionStatus:'active'});
    await lic.saveLicense(FREE,{plan:'free',status:'active'});
    const session = (await import('../api/_lib/radar-van-session-handler.js')).default;
    const download = (await import('../api/_lib/radar-van-download-handler.js')).default;
    let published = false, downloadCalls = 0;
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
      const send=(code,data)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(data));};
      const route=async h=>{
        let raw=''; for await(const chunk of req)raw+=chunk;
        const out={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){res.writeHead(this.code,{'content-type':'application/json',...this.headers});res.end(JSON.stringify(data));return this;}};
        return h({method:req.method,headers:req.headers,body:raw?JSON.parse(raw):undefined,query:{}},out);
      };
      if(url.pathname==='/api/radar-van-session') return route(session);
      if(url.pathname==='/api/radar-van-download'){ downloadCalls++; return route(download); }
      if(url.pathname==='/assets/scout-release.json') return send(200, published
        ? {available:true,platform:'Windows',version:'1.4.11',sha256:'ab'.repeat(32),downloadUrl:RELEASE}
        : {available:false});
      if(url.pathname==='/api/license-status'){
        const key=req.headers['x-app-key'];
        return send(200, key===PRO ? {plan:'pro',status:'active',usageCount:0} : {plan:'free',status:'active',usageCount:0,remainingFreeReports:5});
      }
      if(url.pathname.startsWith('/api/')) return send(404,{});
      const file=path.join(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));
      if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
      res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const base='http://127.0.0.1:'+server.address().port;
    const puppeteer=require('puppeteer');
    const executablePath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p=>fs.existsSync(p));
    browser=await puppeteer.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox']});

    async function openAs(key){
      const context=await browser.createBrowserContext();
      const page=await context.newPage();
      const errors=[], external=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setRequestInterception(true);
      page.on('request',r=>{
        if(r.url().startsWith('https://github.com/')){ external.push(r.url()); return r.respond({status:200,contentType:'application/octet-stream',body:'synthetic'}); }
        if(!r.url().startsWith(base)) return r.abort();
        return r.continue();
      });
      await page.evaluateOnNewDocument(k=>localStorage.setItem('kidbuster_access_key',k),key);
      await page.setViewport({width:1440,height:900});
      await page.goto(base+'/',{waitUntil:'load'});
      return {page,errors,external};
    }
    const sectionVisible = page => page.$eval('#radarVanSection', s => !s.hidden);

    // Free: the Scout panel never appears.
    const free=await openAs(FREE);
    await free.page.evaluate(()=>new Promise(r=>setTimeout(r,1500)));
    check('Free teacher: no Scout panel', !(await sectionVisible(free.page)));

    // Pro: the panel appears, with Pro wording.
    const pro=await openAs(PRO);
    await pro.page.waitForFunction(()=>!document.getElementById('radarVanSection').hidden,{timeout:8000});
    check('Pro teacher: Scout panel appears', await sectionVisible(pro.page));
    check('panel says Scout is included with Pro', /Included with Pro/.test(await pro.page.$eval('#radarVanSection', s=>s.textContent)));
    check('panel no longer says owner-only', !/owner-only|master account/i.test(await pro.page.$eval('#radarVanSection', s=>s.textContent)));
    // First-run clarity (2026-11-03): three plain steps; token method folded away.
    const guide = await pro.page.evaluate(() => {
      const steps = document.getElementById('radarVanSteps'), adv = document.getElementById('radarVanAdvanced');
      return { steps: steps && !steps.hidden ? [...steps.querySelectorAll('li')].map(li => li.textContent) : [],
        advancedClosed: !!adv && !adv.open, tokenButtonVisible: document.getElementById('radarVanConnectBtn').getClientRects().length > 0 };
    });
    check('not connected: three plain steps, starting in Scout', guide.steps.length === 3 && /Connect to Classbuster/.test(guide.steps[1]) && /Approve the code/.test(guide.steps[2]));
    check('the device-token method is folded under Advanced', guide.advancedClosed && !guide.tokenButtonVisible);

    // Before the public release: a clear message, and no private installer.
    await pro.page.evaluate(()=>document.getElementById('radarVanDownloadBtn').click());
    await pro.page.waitForFunction(()=>/not available yet/.test(document.getElementById('radarVanDownloadStatus').textContent),{timeout:5000});
    check('unpublished: Pro is told the download is not available yet, no private link', downloadCalls===1 && pro.external.length===0);

    // After the public release: Download goes straight to the public installer.
    published=true;
    const before=downloadCalls;
    await pro.page.evaluate(()=>document.getElementById('radarVanDownloadBtn').click());
    await new Promise(r=>setTimeout(r,1500));
    check('published: Download opens the public GitHub installer', pro.external.includes(RELEASE));
    check('published: the private installer route is not even asked', downloadCalls===before);
    check('no uncaught browser errors', free.errors.length===0 && pro.errors.length===0);
  }catch(err){
    console.log('  FAIL  unexpected exception: '+(err&&err.stack||err));
    check('suite completed without exception',false);
  }finally{
    if(browser)await browser.close();
    if(server)await new Promise(r=>server.close(r));
    for(const n of names){ if(previous[n]===undefined)delete process.env[n]; else process.env[n]=previous[n]; }
  }
  return getFailures();
};
if(require.main===module) module.exports().then(n=>process.exit(n?1:0));
