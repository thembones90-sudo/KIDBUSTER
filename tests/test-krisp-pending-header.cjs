'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
module.exports=async function(){
  const root=path.resolve(__dirname,'..');
  const item=id=>({meetingId:id,title:'Fictional lesson '+id,detectedStudentName:'Example',contentPreview:'Synthetic lesson notes',transcript:'Synthetic notes '+id,receivedAt:new Date().toISOString()});
  const state={pending:[item('one'),item('two')],waiting:true,error:false,entitled:true,actions:[]};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://local').pathname;
    const json=(data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    if(pathname==='/api/krisp-session'){
      if(!state.entitled)return json({error:'Not entitled'},403);
      if(state.error)return json({error:'Synthetic outage'},503);
      if(req.method==='GET')return json({pending:state.pending,waiting:state.waiting,webhookUrl:'https://example.test/webhook',lastReceivedAt:null});
      let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{
        const body=JSON.parse(raw);state.actions.push(body.action);
        if(body.action==='claim'){
          const claimed=state.pending.find(i=>i.meetingId===body.meetingId);state.pending=state.pending.filter(i=>i.meetingId!==body.meetingId);
          return json({claimed,pendingCount:state.pending.length});
        }
        if(body.action==='dismiss')state.pending=state.pending.filter(i=>i.meetingId!==body.meetingId);
        if(body.action==='wait')state.waiting=true;if(body.action==='cancel-wait')state.waiting=false;
        json({pendingCount:state.pending.length});
      });return;
    }
    if(pathname==='/api/license-status')return json({status:'active',plan:'pro'});
    if(pathname.startsWith('/api/'))return json({},404);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json({},404);
    res.setHeader('content-type',file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    browser=await require('puppeteer').launch({headless:true,executablePath,args:['--no-sandbox']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await page.evaluateOnNewDocument(()=>{
      localStorage.setItem('kidbuster_access_key','synthetic-pending-header');
      const original=setInterval;window.setInterval=(fn,ms,...args)=>ms===5000?(window.testKrispPoll=fn,987654):original(fn,ms,...args);
    });
    await page.setViewport({width:1440,height:1000});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.waitForFunction(()=>!document.getElementById('krispPendingBtn').hidden);
    assert.equal(await page.$eval('#krispInboxBadge',e=>e.textContent),'2');
    const pulse=await page.$eval('#krispPendingBtn',e=>{const s=getComputedStyle(e);return {name:s.animationName,count:s.animationIterationCount,duration:s.animationDuration};});
    assert.deepEqual(pulse,{name:'krispInboxArrival',count:'2',duration:'1s'},'new pending items trigger only two gentle pulses');
    await page.$eval('#krispPendingBtn',async e=>{await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})));});
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.classList.contains('krisp-inbox-arrival')),false);
    assert.notEqual(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).boxShadow),'none','steady glow remains after pulses');
    await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.classList.contains('krisp-inbox-arrival')),false,'unchanged polling must not restart animation');
    await page.evaluate(()=>document.dispatchEvent(new Event('kidbuster:workspace-reset')));
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.classList.contains('krisp-inbox-arrival')),false,'workspace reset must not reannounce existing inbox');
    state.pending[1]=item('arrival');await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.classList.contains('krisp-inbox-arrival')),true,'new identity pulses even with unchanged total count');
    assert.ok(await page.evaluate(()=>document.getElementById('krispIntegrationBtn').getBoundingClientRect().right<=document.getElementById('krispPendingBtn').getBoundingClientRect().left));
    await page.click('#krispPendingBtn');
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.classList.contains('krisp-inbox-arrival')),false,'opening inbox stops pulse');
    assert.equal(await page.$eval('#krispInboxPanel',e=>e.matches(':popover-open')),true);
    assert.equal(await page.$$eval('#krispInboxPanel .krisp-pending-card',els=>els.length),2);
    assert.equal(await page.$eval('#krispIntegrationPanel',e=>e.matches(':popover-open')),false);
    assert.deepEqual(state.actions,[],'opening inbox is read-only');
    state.pending[1]=item('arrival-open');await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.classList.contains('krisp-inbox-arrival')),false,'no pulse while inbox is open');
    await page.click('#krispInboxPanel .krisp-insert-btn');
    await page.waitForFunction(()=>document.getElementById('krispInboxBadge').textContent==='1');
    assert.ok(await page.$eval('#krispNotes',e=>e.value.includes('Synthetic notes')));
    assert.equal(state.waiting,true,'import does not disarm');
    state.error=true;await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispInboxBadge',e=>e.textContent),'1','outage preserves last known count');
    assert.ok(await page.$eval('#krispInboxStatus',e=>e.textContent.includes('Could not refresh')));
    state.error=false;state.pending=[];await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispInboxBadge',e=>e.textContent),'0');
    assert.equal(await page.$eval('#krispInboxEmpty',e=>e.hidden),false);
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.classList.contains('krisp-inbox-arrival')),false,'empty inbox removes arrival animation');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    state.pending=[item('three')];await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationName),'none');
    assert.notEqual(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).boxShadow),'none','reduced motion keeps a steady glow');
    const classicColor=await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).getPropertyValue('--toxin-rgb'));
    await page.evaluate(()=>document.querySelector('#protocolSelect input[value="PREPLY"]').click());
    assert.notEqual(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).getPropertyValue('--toxin-rgb')),classicColor,'glow uses active protocol colour');
    assert.equal(await page.$eval('#krispInboxBadge',e=>e.textContent),'1');
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.dataset.hasPending),'true');
    await page.click('#krispInboxPanel .krisp-pending-card button:last-child');
    await page.waitForFunction(()=>document.getElementById('krispInboxBadge').textContent==='0',{timeout:8000});
    assert.ok(state.actions.includes('dismiss'));assert.equal(state.waiting,true);
    for(const width of [1440,1024,768,390,320]){
      await page.setViewport({width,height:1000});
      await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
      const layout=await page.evaluate(()=>{const r=document.getElementById('krispInboxPanel').getBoundingClientRect();return {left:r.left,right:r.right,overflow:document.documentElement.scrollWidth-innerWidth};});
      assert.ok(layout.left>=0&&layout.right<=width,'inbox fits '+width);assert.ok(layout.overflow<=1,'header fits '+width);
      if(process.env.V2_PENDING_SCREENSHOTS&&[1440,390].includes(width))await page.screenshot({path:path.join(process.env.V2_PENDING_SCREENSHOTS,'pending-header-'+width+'.png')});
    }
    await page.click('#krispInboxClose');
    assert.equal(await page.$eval('#krispPendingBtn',e=>document.activeElement===e),true);
    await page.keyboard.press('Enter');await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#krispInboxPanel',e=>e.matches(':popover-open')),false);
    state.entitled=false;await page.evaluate(()=>{localStorage.setItem('kidbuster_access_key','synthetic-other-account');document.dispatchEvent(new Event('kidbuster:access-key-saved'));});
    await page.waitForFunction(()=>document.getElementById('krispPendingBtn').hidden);
    assert.equal(await page.$$eval('#krispPendingItems>*',els=>els.length),0,'account change clears old inbox');
    state.entitled=true;
    await page.evaluate(()=>{localStorage.setItem('kidbuster_access_key','synthetic-returning-account');document.dispatchEvent(new Event('kidbuster:access-key-saved'));});
    await page.waitForFunction(()=>!document.getElementById('krispPendingBtn').hidden);
    await page.evaluate(()=>document.getElementById('accountSignOutBtn').click());
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.hidden),true,'sign-out hides inbox entry');
    assert.equal(await page.$$eval('#krispPendingItems>*',els=>els.length),0,'sign-out clears old inbox');
    assert.deepEqual(errors,[]);
    console.log('PASS pending header, two finite arrival pulses, steady themed glow, reduced motion, no repeat-poll pulse, independent inbox, import/dismiss, account isolation and persistent ARM');
    return 0;
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
