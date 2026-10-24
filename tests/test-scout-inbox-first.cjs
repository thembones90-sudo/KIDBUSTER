'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async()=>{
 const owner='synthetic-inbox-first-owner';
 const vars=['KIDBUSTER_TEST_KV','OWNER_LICENSE_KEYS','RADAR_VAN_ENABLED','RADAR_VAN_OWNER_SHA256'];
 const old=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{KIDBUSTER_TEST_KV:'1',OWNER_LICENSE_KEYS:owner,RADAR_VAN_ENABLED:'true',RADAR_VAN_OWNER_SHA256:crypto.createHash('sha256').update(owner).digest('hex')});
 try{
  const kv=await import('../api/_lib/kv-client.js');kv.__resetForTests();
  const rv=await import('../api/_lib/radar-van.js');
  const handler=(await import('../api/_lib/radar-van-ingest-handler.js')).default;
  const token=await rv.issueRadarToken(owner,{automatic:true}),hash=rv.hashRadarToken(token);
  const lesson=n=>({version:1,lessonId:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),title:'Synthetic lesson '+n,startedAt:'2026-10-24T07:00:00Z',durationSeconds:900,transcript:'[00:00] TEACHER: Synthetic preserved lesson '+n+'\n[00:02] STUDENT: Hello'});
  const ingest=async(n,restore=false,bearer=token)=>{
   const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
   await handler({method:'POST',query:{radar:'ingest'},headers:{authorization:'Bearer '+bearer,'content-type':'application/json',...(restore?{'x-scout-restore':'1'}:{})},body:lesson(n),socket:{remoteAddress:'127.0.0.1'}},res);
   return res;
  };
  for(const n of [1,2]){
   assert.equal((await ingest(n)).code,201);
   const leased=await rv.readRadarSession(owner,{lease:true});
   assert.equal(leased.matched.lessonId,lesson(n).lessonId);
   await rv.radarInboxAction(owner,'ack-matched','rv:'+lesson(n).lessonId);
  }
  assert.equal((await ingest(1)).body.duplicate,true,'ordinary retry must not resurrect an ACKed lesson');
  assert.equal((await ingest(99,true)).code,409,'restore cannot invent previously unseen lessons');
  assert.equal((await ingest(1,true,'rv1_'+'x'.repeat(43))).code,401,'restore requires current authenticated owner-device credential');
  for(const n of [1,2])assert.equal((await ingest(n,true)).code,201);
  let view=await rv.readRadarSession(owner,{lease:true});
  assert.equal(view.inboxOnly,true);assert.equal(view.matched,null,'even older empty-note tabs cannot auto-lease inbox-first lessons');
  assert.equal(view.inboxPending.length,2);
  assert.ok(view.inboxPending.every(x=>x.restored===true));
  assert.equal((await ingest(1,true)).body.duplicate,true,'repeated explicit recovery does not duplicate a queued record');
  await rv.radarInboxAction(owner,'ack-matched','rv:'+lesson(1).lessonId);
  assert.equal((await rv.readRadarSession(owner,{lease:true})).inboxPending.length,2,'stale browser ACK cannot consume an unclaimed restored record');
  const future=await ingest(3);assert.equal(future.code,201);assert.equal(future.body.matched,false,'future lessons go straight to the Scout pending inbox');
  const claimed=await rv.radarInboxAction(owner,'claim','rv:'+lesson(1).lessonId);
  assert.equal(claimed.claimed.transcript,lesson(1).transcript,'explicit import returns the full unchanged transcript');
  await rv.radarInboxAction(owner,'ack-matched','rv:'+lesson(1).lessonId);
  assert.equal((await rv.readRadarSession(owner,{lease:true})).inboxPending.length,2);
  const paired='rv1_'+'p'.repeat(43);
  await rv.bindRadarTokenHash(owner,rv.hashRadarToken(paired));
  assert.equal((await rv.readRadarSettings(owner)).inboxOnly,true,'new desktop pairings use explicit inbox import');
  // Real browser and route handlers: empty notes must stay empty until Claim.
  const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
  const root=path.resolve(__dirname,'..');
  const session=(await import('../api/_lib/radar-van-session-handler.js')).default;
  const server=http.createServer(async(req,res)=>{
   const url=new URL(req.url,'http://localhost');
   const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
   if(url.pathname==='/api/license-status')return json({plan:'pro',status:'active',founder:true});
   if(url.pathname==='/api/radar-van-session'){
    let body='';for await(const part of req)body+=part;
    const out={code:200,setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
    await session({method:req.method,headers:req.headers,body:body?JSON.parse(body):undefined},out);
    return json(out.body,out.code);
   }
   if(url.pathname.startsWith('/api/'))return json({},403);
   const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json({},404);
   res.setHeader('content-type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');
   fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
   browser=await require('puppeteer').launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
   const page=await browser.newPage();
   await page.evaluateOnNewDocument(key=>localStorage.setItem('kidbuster_access_key',key),owner);
   await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
   await page.waitForFunction(()=>document.querySelector('#radarVanPendingPopoverCount').textContent==='2');
   assert.equal(await page.$eval('#krispNotes',e=>e.value),'','empty notes do not silently consume pending Scout lessons');
   await page.click('#krispPendingBtn');
   await page.waitForSelector('#radarVanPendingPopoverList .radar-van-claim',{visible:true});
   assert.match(await page.$eval('#radarVanImportPolicy',e=>e.textContent),/nothing is imported/i);
   await page.click('#radarVanPendingPopoverList .radar-van-claim');
   await page.waitForFunction(()=>document.querySelector('#krispNotes').value.includes('Synthetic preserved lesson'));
   await page.waitForFunction(()=>document.querySelector('#radarVanPendingPopoverCount').textContent==='1');
   assert.equal((await rv.readRadarSession(owner)).inboxPending.length,1,'only explicit successful import is acknowledged');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
  console.log('PASS Scout webhook recovery preserves IDs, deduplication and explicit pending-inbox import across old/new browser clients');return 0;
 }finally{for(const k of vars){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
