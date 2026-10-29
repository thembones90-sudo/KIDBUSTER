'use strict';
// P0 2026-10-29: the Krisp inbox poll must not spend Redis commands in hidden
// tabs, must slow down when nothing can be auto-delivered and back off during
// outages -- while armed delivery keeps its 15-second cadence and anything
// that arrived while hidden is applied the moment the tab is visible again.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
module.exports=async function(){
  const root=path.resolve(__dirname,'..');
  const state={waiting:false,error:false,delayMs:0,matched:null,gets:{},actions:[]};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://local').pathname;
    const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    if(pathname==='/api/krisp-session'){
      const who=req.headers['x-app-key'];
      if(req.method==='GET'){
        state.gets[who]=(state.gets[who]||0)+1;
        if(state.error)return json({error:'Synthetic outage'},503);
        return setTimeout(()=>json({pending:[],waiting:state.waiting,matched:state.matched,webhookUrl:'https://example.test/webhook',lastReceivedAt:null}),state.delayMs);
      }
      let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
        const body=JSON.parse(raw);state.actions.push(body.action);
        if(body.action==='wait')state.waiting=true;
        if(body.action==='cancel-wait')state.waiting=false;
        if(body.action==='ack-matched'&&state.matched&&state.matched.meetingId===body.meetingId)state.matched=null;
        json({acked:true,waiting:state.waiting});
      });return;
    }
    if(pathname==='/api/license-status')return json({status:'active',plan:'pro'});
    if(pathname.startsWith('/api/'))return json({},404);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json({},404);
    res.setHeader('content-type',file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  let browser;
  async function openTab(key,context=browser){
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.evaluateOnNewDocument(k=>{
      localStorage.setItem('kidbuster_access_key',k);
      // Deterministic tab visibility and a hand-cranked 15-second tick.
      window.__hidden=false;
      Object.defineProperty(Document.prototype,'hidden',{configurable:true,get(){return window.__hidden;}});
      Object.defineProperty(Document.prototype,'visibilityState',{configurable:true,get(){return window.__hidden?'hidden':'visible';}});
      const original=setInterval;window.setInterval=(fn,ms,...args)=>ms===15000?(window.testKrispTick=fn,424242):original(fn,ms,...args);
      window.setTab=hidden=>{window.__hidden=hidden;document.dispatchEvent(new Event('visibilitychange'));};
    },key);
    await page.setViewport({width:1440,height:1000});
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof window.testKrispTick==='function'&&!document.getElementById('krispPendingBtn').hidden);
    await page.waitForNetworkIdle({idleTime:150});
    return {page,errors};
  }
  const ticks=async(page,n)=>{for(let i=0;i<n;i++)await page.evaluate(()=>window.testKrispTick());};
  const gets=key=>state.gets[key]||0;
  try{
    const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    browser=await require('puppeteer').launch({headless:true,executablePath,args:['--no-sandbox']});
    const A='synthetic-adaptive-a';
    const {page,errors}=await openTab(A);

    // Idle (not armed): transcripts can only reach Pending -> every 4th tick.
    let before=gets(A);await ticks(page,3);
    assert.equal(gets(A)-before,0,'not armed: the first three 15-second ticks make no request');
    await ticks(page,1);
    assert.equal(gets(A)-before,1,'not armed: one request per minute');

    // Armed: every tick, so automatic delivery keeps its 15-second cadence.
    await page.evaluate(()=>document.getElementById('krispWaitBtn').click());
    await page.waitForNetworkIdle({idleTime:150});
    assert.ok(state.actions.includes('wait'),'arming reaches the server');
    before=gets(A);await ticks(page,4);
    assert.equal(gets(A)-before,4,'armed: one request per 15-second tick');

    // Hidden tab: no requests at all.
    await page.evaluate(()=>window.setTab(true));
    before=gets(A);await ticks(page,40);
    assert.equal(gets(A)-before,0,'hidden tab: ten minutes of ticks make no request');

    // A transcript delivered by webhook while hidden is applied on return.
    state.matched={meetingId:'hidden-arrival',transcript:'Synthetic transcript delivered while hidden',title:'Fictional lesson',receivedAt:new Date().toISOString()};
    await page.evaluate(()=>window.setTab(false));
    await page.waitForFunction(()=>document.getElementById('krispNotes').value.includes('delivered while hidden'),{timeout:5000});
    assert.equal(gets(A)-before,1,'returning to the tab refreshes immediately, without waiting for a tick');
    await page.waitForFunction(()=>true);await page.waitForNetworkIdle({idleTime:150});
    assert.ok(state.actions.includes('ack-matched'),'the transcript applied on return is acknowledged');
    assert.equal(state.matched,null);

    // Outage: one failure retries on the next tick, then 30 s, 60 s, 120 s.
    state.error=true;before=gets(A);
    const outagePattern=[];
    for(let i=0;i<20;i++){const g=gets(A);await ticks(page,1);outagePattern.push(gets(A)-g);}
    assert.deepEqual(outagePattern,[1,1,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0],'exponential backoff: 15 s, 15 s, 30 s, 60 s, 120 s');
    assert.ok(await page.$eval('#krispInboxStatus',e=>e.textContent.includes('Could not refresh')),'outage is still reported to the teacher');
    state.error=false;
    let recovered=0;for(let i=0;i<8&&!recovered;i++){const g=gets(A);await ticks(page,1);recovered=gets(A)-g;}
    assert.equal(recovered,1,'backoff is capped at 120 s, so recovery is noticed');
    before=gets(A);await ticks(page,2);
    assert.equal(gets(A)-before,2,'after one success the normal armed cadence resumes');

    // Single flight: a slow response is never overlapped by the next tick.
    state.delayMs=600;before=gets(A);
    await page.evaluate(()=>{window.testKrispTick();window.testKrispTick();return window.testKrispTick();});
    state.delayMs=0;
    assert.equal(gets(A)-before,1,'overlapping ticks share one in-flight request');

    // Duplicate tabs: a background copy of Classbuster costs nothing. A separate
    // context gives it its own key, so requests are attributable per tab.
    const B='synthetic-adaptive-b';
    const second=await openTab(B,await browser.createBrowserContext());
    await second.page.evaluate(()=>document.getElementById('krispWaitBtn').click());
    await second.page.waitForNetworkIdle({idleTime:150});
    await second.page.evaluate(()=>window.setTab(true));
    const beforeA=gets(A),beforeB=gets(B);
    await ticks(page,4);await ticks(second.page,4);
    assert.equal(gets(A)-beforeA,4,'the visible tab keeps polling');
    assert.equal(gets(B)-beforeB,0,'the hidden duplicate tab does not poll');

    assert.deepEqual(errors,[]);assert.deepEqual(second.errors,[]);
    console.log('PASS Krisp adaptive polling: idle cadence, hidden tabs, return delivery, backoff, single flight, duplicate tabs');
    return 0;
  }finally{if(browser)await browser.close();server.close();}
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0),e=>{console.error(e);process.exit(1);});
