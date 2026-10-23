'use strict';
// Contract (owner decision 2026-10-23): a finished Scout lesson is imported
// automatically into EMPTY notes and the teacher is notified. If the notes or
// report already have content nothing is overwritten: the lesson waits in a
// separate Scout section of Pending transcripts with a visible notice and is
// imported manually. Krisp stays separate; no report is ever generated.
const fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {createChecker}=require('./helpers/assert.cjs');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'), OWNER='pending-scout-synthetic-master';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-scout-pending-inbox.cjs ===');
  const vars=['KIDBUSTER_TEST_KV','OWNER_LICENSE_KEYS','RADAR_VAN_ENABLED','RADAR_VAN_OWNER_SHA256'];
  const old=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
  process.env.KIDBUSTER_TEST_KV='1';
  process.env.OWNER_LICENSE_KEYS=OWNER;
  process.env.RADAR_VAN_ENABLED='true';
  process.env.RADAR_VAN_OWNER_SHA256=crypto.createHash('sha256').update(OWNER).digest('hex');
  let server,browser;
  try{
    const kv=await import('../api/_lib/kv-client.js');kv.__resetForTests();
    const rv=await import('../api/_lib/radar-van.js');
    const feedback=(await import('../api/feedback.js')).default;
    const invoke=async(method,body,headers={},query={radar:'session'})=>{
      const res={code:200,headers:{},status(n){this.code=n;return this;},json(v){this.body=v;return this;},setHeader(k,v){this.headers[k.toLowerCase()]=v;}};
      await feedback({method,body,headers,query,url:'/api/feedback',socket:{remoteAddress:'127.0.0.1'}},res);
      return res;
    };
    const keyHeaders={'x-app-key':OWNER};
    const connected=await invoke('POST',{action:'connect',automatic:true},{...keyHeaders,'content-type':'application/json'});
    const token=connected.body?.token;
    check('master can connect for delivery',connected.code===200&&/^rv1_/.test(token||''));
    const payload=n=>({version:1,lessonId:id(n),title:'Scout lesson '+n,startedAt:'2026-10-23T08:00:00Z',durationSeconds:1200,transcript:'[00:00] TEACHER: Scout '+n+'\n[00:02] STUDENT: Pending'});
    const ingest=n=>rv.ingestRadarLesson(OWNER,rv.parseLesson(payload(n)).lesson,rv.hashRadarToken(token));
    const first=await ingest(1);
    check('server stores completed lesson',first.matched===true);
    const a=await invoke('GET',null,keyHeaders);
    check('Scout has a separate pending projection',a.body?.inboxPending?.length===1);
    check('pending projection does not return full transcript',a.body.inboxPending.every(item=>!Object.prototype.hasOwnProperty.call(item,'transcript')));
    const accountDenied=await invoke('GET',null,{'x-app-key':'synthetic-pro-key'});
    check('paid non-owner cannot see Scout pending records',accountDenied.code===403);

    let hits={generate:0,krisp:0};
    server=http.createServer(async(req,res)=>{
      const url=new URL(req.url,'http://localhost');
      const json=(v,c)=>{res.writeHead(c||200,{'content-type':'application/json'});res.end(JSON.stringify(v));};
      if(url.pathname==='/api/krisp-session'){hits.krisp++;return json({error:'not entitled'},403);}
      if(url.pathname==='/api/license-status')return json({plan:'pro',status:'active',founder:true});
      if(url.pathname==='/api/generate'){hits.generate++;return json({},401);}
      if(url.pathname==='/api/radar-van-session'){
        let body='';for await(const chunk of req)body+=chunk;
        const r=await invoke(req.method,body?JSON.parse(body):undefined,req.headers);
        return json(r.body,r.code);
      }
      if(url.pathname.startsWith('/api/'))return json({},404);
      const file=path.join(ROOT,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,''));
      if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('');}
      res.writeHead(200,{'content-type':file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
      fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const puppeteer=require('puppeteer');
    const exe=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    browser=await puppeteer.launch({headless:true,...(exe?{executablePath:exe}:{}),args:['--no-sandbox']});
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.evaluateOnNewDocument(key=>{localStorage.setItem('kidbuster_access_key',key);},OWNER);
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.waitForFunction(()=>!document.getElementById('radarVanSection').hidden,{timeout:12000});
    // 1) Empty workspace: automatic import with a notification.
    await page.waitForFunction(()=>document.getElementById('krispNotes').value.includes('Scout 1'),{timeout:12000});
    check('empty notes: finished Scout lesson is imported automatically',await page.$eval('#krispNotes',e=>e.value.includes('[00:00] TEACHER: Scout 1')));
    check('teacher is notified of the automatic import',await page.$eval('#scoutNotesStatus',e=>!e.hidden&&/added to your lesson notes/i.test(e.textContent)));
    await page.waitForFunction(()=>document.getElementById('radarVanPendingPopoverCount').textContent==='0',{timeout:12000});
    check('automatic import is acknowledged on the server',(await invoke('GET',null,keyHeaders)).body.waitingCount===0);
    check('automatic import never generates a report',hits.generate===0);

    // 2) Occupied workspace: Pending transcripts fallback, nothing overwritten.
    const second=await ingest(2);
    check('second lesson stored independently',second.matched===true);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(()=>document.getElementById('radarVanPendingPopoverCount').textContent==='1',{timeout:12000});
    check('occupied notes are not overwritten',await page.$eval('#krispNotes',e=>e.value.includes('Scout 1')&&!e.value.includes('Scout 2')));
    check('visible notice says the lesson waits in Pending transcripts',await page.$eval('#scoutNotesStatus',e=>!e.hidden&&/Pending transcripts/.test(e.textContent)&&/not changed/.test(e.textContent)));
    check('occupied workspace never leases the full transcript',(await invoke('GET',null,keyHeaders)).body.matched===null);
    check('Scout pending appears even when Krisp is not entitled',await page.$eval('#krispPendingBtn',e=>!e.hidden));
    check('Krisp group hidden for nonentitled owner',await page.$eval('#krispPendingGroup',e=>e.hidden));
    check('Scout group visible for the authorized owner',await page.$eval('#radarVanPendingGroup',e=>!e.hidden));
    check('Scout section has its own count',await page.$eval('#radarVanPendingPopoverCount',e=>e.textContent==='1'));
    check('combined pending button shows Scout count',await page.$eval('#krispInboxBadge',e=>e.textContent==='1'));
    check('no report generated',hits.generate===0);
    await page.click('#krispPendingBtn');
    check('Scout cards are inside Pending transcripts',await page.$eval('#krispInboxPanel',e=>e.matches(':popover-open')&&e.querySelectorAll('#radarVanPendingPopoverList li').length===1));
    const look=await page.$eval('#krispInboxPanel',el=>{
      const st=getComputedStyle(el),card=el.querySelector('.radar-van-item');
      const cs=getComputedStyle(card),claim=getComputedStyle(card.querySelector('.radar-van-claim'));
      return {radius:parseInt(st.borderTopLeftRadius,10),
        bg:st.backgroundImage,cardRadius:parseInt(cs.borderTopLeftRadius,10),
        claimBg:claim.backgroundImage, scoutVisible:!el.querySelector('#radarVanPendingGroup').hidden};
    });
    check('premium inbox uses rich dark gradient and rounded surfaces',
      look.radius>=20 && look.cardRadius>=15 && look.bg.includes('gradient') && look.claimBg.includes('gradient'));
    check('premium styling preserves independent Scout section',look.scoutVisible);
    await page.click('#radarVanPendingPopoverList .radar-van-more');
    check('premium more-options menu opens',await page.$eval('#radarVanPendingPopoverList .radar-van-item-menu',el=>!el.hidden));
    await page.click('#radarVanPendingPopoverList .radar-van-item-menu button:first-child');
    check('preview excerpt expands without importing',await page.$eval('#radarVanPendingPopoverList .radar-van-expanded-preview',el=>!el.hidden && el.textContent.includes('Scout 2')));
    check('preview does not claim the lesson',(await invoke('GET',null,keyHeaders)).body.inboxPending.length===1);
    await page.setViewport({width:375,height:780});
    await page.evaluate(()=>{document.getElementById('krispInboxPanel').scrollTop=0;});
    const bounds=await page.$eval('#krispInboxPanel',el=>{
      const b=el.getBoundingClientRect();
      return {left:b.left,right:b.right,width:innerWidth};
    });
    check('premium inbox stays within narrow mobile viewport',
      bounds.left>=-1 && bounds.right<=bounds.width+1);
    await page.setViewport({width:1100,height:820});
    await page.click('#radarVanPendingPopoverList .radar-van-claim');
    check('Claim refuses overwrite of occupied notes',await page.$eval('#krispNotes',e=>e.value.includes('Scout 1')&&!e.value.includes('Scout 2')));
    check('failed Claim never ACKs second lesson',(await invoke('GET',null,keyHeaders)).body.waitingCount===1);

    // 3) Manual review and import from Pending transcripts.
    await page.evaluate(()=>{document.getElementById('krispNotes').value='';});
    await page.click('#radarVanPendingPopoverList .radar-van-claim');
    await page.waitForFunction(()=>document.getElementById('krispNotes').value.includes('Scout 2'),{timeout:12000});
    check('Claim imports the pending lesson once notes are empty',await page.$eval('#krispNotes',e=>e.value.split('TEACHER: Scout 2').length===2&&!e.value.includes('Scout 1')));
    await page.waitForFunction(()=>document.getElementById('radarVanPendingPopoverCount').textContent==='0',{timeout:12000});
    check('ACK happens only after a successful import',(await invoke('GET',null,keyHeaders)).body.waitingCount===0);
    check('a retried upload of the same lesson is deduplicated',(await ingest(2)).duplicate===true);
    await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
    await new Promise(r=>setTimeout(r,1500));
    check('deduplicated lesson is not inserted again',await page.$eval('#krispNotes',e=>e.value.split('TEACHER: Scout 2').length===2));
    check('Krisp remains separate and unchanged',hits.generate===0);
    check('third lesson stored',(await ingest(3)).matched===true);
    const leasedRead=await invoke('GET',null,{...keyHeaders,'x-radar-lease':'1'});
    check('a lesson leased to an importing tab is not also listed as pending',leasedRead.body.matched?.lessonId===id(3)&&leasedRead.body.inboxPending.length===0&&(await invoke('GET',null,keyHeaders)).body.inboxPending.length===0);
    await page.evaluate(()=>{localStorage.removeItem('kidbuster_access_key');document.dispatchEvent(new CustomEvent('kidbuster:access-key-saved'));});
    await page.waitForFunction(()=>document.getElementById('radarVanPendingGroup').hidden,{timeout:12000});
    check('sign-out conceals Scout pending',await page.$eval('#radarVanPendingGroup',e=>e.hidden));
    check('sign-out hides pending button without Krisp entitlement',await page.$eval('#krispPendingBtn',e=>e.hidden));
    check('no uncaught browser errors',errors.length===0);
  }catch(e){console.error('scout pending test:',e.stack||e);check('Scout pending scenario completed',false);}
  finally{
    if(browser)await browser.close().catch(()=>{});
    if(server)await new Promise(r=>server.close(r));
    for(const k of vars){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
  }
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
