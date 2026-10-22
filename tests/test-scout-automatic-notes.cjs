'use strict';
// Current owner-only contract: real browser + real handlers, synthetic data,
// loopback server and in-memory KV. No production credentials or HTTP calls.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createChecker} = require('./helpers/assert.cjs');
const ROOT = path.resolve(__dirname, '..');
const OWNER = 'scout-automatic-synthetic-owner';
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const body = n => ({version:1, lessonId:id(n), title:'Synthetic '+n,
  startedAt:'2026-10-21T08:00:00Z', durationSeconds:1500,
  transcript:'[00:00] TEACHER: Automatic lesson '+n+'\n\n[00:02] STUDENT: Hello'});

module.exports = async function run(){
  const {check,getFailures} = createChecker();
  console.log('\n=== test-scout-automatic-notes.cjs ===');
  const names = ['KIDBUSTER_TEST_KV','OWNER_LICENSE_KEYS','RADAR_VAN_ENABLED','RADAR_VAN_OWNER_SHA256'];
  const previous = Object.fromEntries(names.map(k=>[k,process.env[k]]));
  process.env.KIDBUSTER_TEST_KV='1'; process.env.OWNER_LICENSE_KEYS=OWNER;
  process.env.RADAR_VAN_ENABLED='true'; delete process.env.RADAR_VAN_OWNER_SHA256;
  let browser,server;
  try{
    const kvmod = await import('../api/_lib/kv-client.js'); kvmod.__resetForTests();
    const rv = await import('../api/_lib/radar-van.js');
    const handler = (await import('../api/_lib/radar-van-session-handler.js')).default;
    async function invoke(method='GET',data,lease=false,key=OWNER){
      const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
      await handler({method,headers:{'x-app-key':key,'content-type':'application/json',...(lease?{'x-radar-lease':'1'}:{})},body:data},res);
      return res;
    }
    const action = (action,extra={})=>invoke('POST',{action,...extra});
    const ingest = async (token,n)=>rv.ingestRadarLesson(OWNER,rv.parseLesson(body(n)).lesson,rv.hashRadarToken(token));

    const token=(await action('connect',{automatic:true})).body.token;
    check('connect enables automatic import in one operation',(await invoke()).body.automatic===true);
    check('new lesson goes straight to automatic queue without ARM',(await ingest(token,1)).matched===true);
    check('busy browser read receives no full transcript',(await invoke()).body.matched===null);
    const [first,second]=await Promise.all([invoke('GET',null,true),invoke('GET',null,true)]);
    check('two tabs cannot lease the same lesson', [first,second].filter(r=>r.body.matched?.lessonId===id(1)).length===1);
    await action('ack-matched',{meetingId:'rv:'+id(1)});
    check('retry after acknowledgement is still deduplicated',(await ingest(token,1)).duplicate===true);
    check('stale DISARM cannot silently pause an automatic connection',(await action('disarm')).body.reason==='automatic');
    check('nonowner cannot enable automatic import',(await invoke('POST',{action:'enable-automatic'},false,'kb_regular_pro')).code===403);
    await action('disconnect');
    check('disconnect stops automatic import',(await invoke()).body.automatic===false);
    check('revoked desktop credential is refused',(await ingest(token,2)).revoked===true);

    // Create an older, formerly disarmed connection and its pending lessons.
    const oldToken=await rv.issueRadarToken(OWNER);
    await ingest(oldToken,10); await ingest(oldToken,11);
    const tokenHash=(await rv.readRadarSettings(OWNER)).tokenHash;
    check('legacy pending lessons exist before migration',(await invoke()).body.pendingCount===2);
    const pageErrors=[]; let generateCalls=0;
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/api/radar-van-session'){
        let raw=''; for await(const chunk of req)raw+=chunk;
        const out={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){res.writeHead(this.code,{'content-type':'application/json',...this.headers});res.end(JSON.stringify(data));return this;}};
        return handler({method:req.method,headers:req.headers,body:raw?JSON.parse(raw):undefined},out);
      }
      if(url.pathname==='/api/generate')generateCalls++;
      if(url.pathname==='/api/license-status'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({plan:'pro',status:'active',founder:true,usageCount:0,remainingFreeReports:5}));}
      if(url.pathname.startsWith('/api/')){res.writeHead(404);return res.end('{}');}
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
    const page=await browser.newPage();
    page.on('pageerror',e=>pageErrors.push(e.message));
    await page.setRequestInterception(true);
    let lateDraft = false;
    page.on('request',async r=>{
      if(lateDraft && r.url().includes('/api/radar-van-session') && r.headers()['x-radar-lease']==='1'){
        lateDraft=false;
        await page.evaluate(()=>{const n=document.getElementById('krispNotes');n.value='Typed while fetching';n.dispatchEvent(new Event('input',{bubbles:true}));});
      }
      return r.url().startsWith(base)||r.url().startsWith('data:')?r.continue():r.abort();
    });
    await page.evaluateOnNewDocument(key=>{
      localStorage.setItem('kidbuster_access_key',key);
      document.addEventListener('DOMContentLoaded',()=>{document.getElementById('krispNotes').value='Keep my draft';});
    },OWNER);
    await page.goto(base,{waitUntil:'load'});
    const wait=fn=>page.waitForFunction(fn,{timeout:12000});
    await wait(()=>document.getElementById('radarVanState').textContent.includes('automatic'));
    check('existing connection migrates automatically without rotating token',(await rv.readRadarSettings(OWNER)).tokenHash===tokenHash&&(await invoke()).body.automatic===true);
    check('Scout ARM control is removed',await page.$('#radarVanArmBtn')===null);
    check('Krisp ARM remains in the page',!!(await page.$('#krispWaitBtn')));
    check('existing draft survives migration',await page.$eval('#krispNotes',e=>e.value)==='Keep my draft');
    check('waiting notification is outside the account panel and visible',await page.$eval('#scoutNotesStatus',e=>!e.hidden&&!e.closest('#accountPanel')&&/waiting/.test(e.textContent)));
    const clear=()=>page.evaluate(()=>{const n=document.getElementById('krispNotes');n.value='';n.dispatchEvent(new Event('input',{bubbles:true}));});
    await clear();
    await wait(()=>document.getElementById('krispNotes').value.includes('Automatic lesson 10'));
    check('old pending lesson imports without Claim',await page.$eval('#krispNotes',e=>e.value.includes('Automatic lesson 10')&&!e.value.includes('lesson 11')));
    await clear();
    await wait(()=>document.getElementById('krispNotes').value.includes('Automatic lesson 11'));
    check('second waiting lesson imports separately',true);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await wait(()=>document.getElementById('radarVanCount').textContent==='0');
    check('import receipts clear both server queues',(await invoke()).body.waitingCount===0);
    await page.reload({waitUntil:'load'});
    await wait(()=>document.getElementById('radarVanState').textContent.includes('automatic'));
    check('automatic mode survives refresh',(await invoke()).body.automatic===true);
    check('acknowledged lessons are not inserted again',await page.$eval('#krispNotes',e=>!e.value.includes('Automatic lesson')));
    await page.evaluate(()=>document.getElementById('generateBtn').setAttribute('aria-busy','true'));
    await ingest(oldToken,12); await clear();
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await wait(()=>document.getElementById('scoutNotesStatus').textContent.includes('waiting'));
    check('generation blocks import even with empty notes and output',await page.$eval('#krispNotes',e=>e.value)===''&&(await invoke()).body.waitingCount===1);
    await page.evaluate(()=>{document.getElementById('generateBtn').setAttribute('aria-busy','false');const o=document.getElementById('outputBox');o.classList.remove('empty');o.textContent='Keep my report';document.dispatchEvent(new Event('visibilitychange'));});
    check('existing output prevents automatic import',await page.$eval('#krispNotes',e=>e.value)===''&&(await invoke()).body.waitingCount===1);
    await page.evaluate(()=>{const o=document.getElementById('outputBox');o.classList.add('empty');o.textContent='';document.dispatchEvent(new CustomEvent('kidbuster:workspace-reset'));});
    await wait(()=>document.getElementById('krispNotes').value.includes('Automatic lesson 12'));
    check('finished report reset releases the waiting lesson',true);
    await wait(()=>document.getElementById('radarVanCount').textContent==='0');
    await ingest(oldToken,13); lateDraft=true; await clear();
    await wait(()=>document.getElementById('krispNotes').value==='Typed while fetching');
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    check('notes typed during the lease request are not overwritten',await page.$eval('#krispNotes',e=>e.value)==='Typed while fetching');
    check('unapplied lesson remains unacknowledged',(await invoke()).body.waitingCount===1);
    check('automatic import never generates a report',generateCalls===0);
    check('no browser exceptions',pageErrors.length===0);
    check('Krisp server state is untouched',(await kvmod.kv.get('krisp:user:'+OWNER))===null);
    check('no ARM/DISARM strings remain in Scout browser source',!fs.readFileSync(path.join(ROOT,'assets/radar-van-client.js'),'utf8').includes('ARM RADAR VAN'));
  }catch(e){console.error(e.stack||e);check('automatic flow completed without exception',false);}
  finally{
    if(browser)await browser.close();
    if(server)await new Promise(r=>server.close(r));
    for(const k of names){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
  }
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exitCode=n?1:0);
