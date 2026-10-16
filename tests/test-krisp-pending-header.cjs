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
    assert.equal(await page.$$eval('#krispPendingBtn .krisp-envelope-icon rect',els=>els.length),1,'pending shortcut uses a rounded envelope icon');
    const pill=await page.$eval('#krispIntegrationBtn',e=>{const s=getComputedStyle(e);return {radius:parseFloat(s.borderTopLeftRadius),height:e.getBoundingClientRect().height};});
    assert.ok(pill.radius>=pill.height/2,'Krisp integration has a fully rounded pill silhouette');
    assert.equal(await page.$eval('#krispInboxBadge',e=>e.textContent),'2');
    const pulse=await page.$eval('#krispPendingBtn',e=>{const s=getComputedStyle(e);return {name:s.animationName,count:s.animationIterationCount,duration:s.animationDuration};});
    assert.deepEqual(pulse,{name:'krispInboxBreathing',count:'infinite',duration:'3.6s'},'pending transcripts continuously glow until cleared');
    const frames=await page.$eval('#krispPendingBtn',e=>{
      const a=e.getAnimations().find(a=>a.animationName==='krispInboxBreathing');
      a.currentTime=0;const low=getComputedStyle(e).boxShadow;
      a.currentTime=1800;const high=getComputedStyle(e).boxShadow;
      a.currentTime=9000;return {low,high,later:getComputedStyle(e).boxShadow,running:a.playState};
    });
    assert.notEqual(frames.low,frames.high,'actual rendered glow changes between low and high frames');
    assert.equal(frames.high,frames.later,'glow still reaches its peak after more than two cycles');
    assert.equal(frames.running,'running');
    assert.match(frames.high,/224, 190, 126/,'pending halo is champagne gold, not protocol green');
    assert.equal(await page.$eval('#krispInboxBadge',e=>getComputedStyle(e).color),'rgb(40, 33, 22)','gold badge has dark readable numbers');
    if(process.env.V2_PENDING_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_PENDING_SCREENSHOTS,'pending-gold-active.png')});
    const interpolation=await page.$eval('#krispPendingBtn',e=>{
      const a=e.getAnimations().find(a=>a.animationName==='krispInboxBreathing');
      const at=t=>{a.currentTime=t;return getComputedStyle(e).boxShadow;};
      return {start:at(0),quarter:at(900),middle:at(1800),end:at(3600)};
    });
    assert.notEqual(interpolation.quarter,interpolation.start,'pulse interpolates rather than snapping');
    assert.notEqual(interpolation.quarter,interpolation.middle,'pulse has a genuine intermediate frame');
    assert.equal(interpolation.start,interpolation.end,'pulse loops without a discontinuity');
    await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationIterationCount),'infinite','polling preserves continuous glow');
    await page.evaluate(()=>document.dispatchEvent(new Event('kidbuster:workspace-reset')));
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationName),'krispInboxBreathing','workspace reset preserves glow while transcripts remain');
    state.pending[1]=item('arrival');await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationName),'krispInboxBreathing');
    assert.ok(await page.evaluate(()=>document.getElementById('krispIntegrationBtn').getBoundingClientRect().right<=document.getElementById('krispPendingBtn').getBoundingClientRect().left));
    await page.click('#krispPendingBtn');
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationName),'krispInboxBreathing','opening inbox does not stop animation while items remain');
    assert.equal(await page.$eval('#krispInboxPanel',e=>e.matches(':popover-open')),true);
    assert.equal(await page.$$eval('#krispInboxPanel .krisp-pending-card',els=>els.length),2);
    assert.equal(await page.$eval('#krispIntegrationPanel',e=>e.matches(':popover-open')),false);
    assert.deepEqual(state.actions,[],'opening inbox is read-only');
    state.pending[1]=item('arrival-open');await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationName),'krispInboxBreathing');
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
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationName),'none','empty inbox stops animation');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    state.pending=[item('three')];await page.evaluate(()=>window.testKrispPoll());
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).animationName),'none');
    assert.notEqual(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).boxShadow),'none','reduced motion keeps a steady glow');
    const classicColor=await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).getPropertyValue('--toxin-rgb'));
    const goldShadow=await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).boxShadow);
    await page.evaluate(()=>document.querySelector('#protocolSelect input[value="PREPLY"]').click());
    assert.notEqual(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).getPropertyValue('--toxin-rgb')),classicColor,'protocol theme still changes normally');
    assert.equal(await page.$eval('#krispPendingBtn',e=>getComputedStyle(e).boxShadow),goldShadow,'pending notification stays gold across protocol themes');
    assert.equal(await page.$eval('#krispInboxBadge',e=>e.textContent),'1');
    assert.equal(await page.$eval('#krispPendingBtn',e=>e.dataset.hasPending),'true');
    await page.click('#krispInboxPanel .krisp-pending-card button:last-child');
    await page.waitForFunction(()=>document.getElementById('krispInboxBadge').textContent==='0',{timeout:8000});
    assert.ok(state.actions.includes('dismiss'));assert.equal(state.waiting,true);
    for(const width of [1440,1024,768,390,320]){
      await page.setViewport({width,height:1000});
      await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
      const heights=await page.$$eval('.header-actions>button.account-btn',els=>els.filter(e=>!e.hidden).map(e=>e.getBoundingClientRect().height));
      assert.ok(Math.max(...heights)-Math.min(...heights)<1,'all header pills share a height at '+width);
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
    console.log('PASS continuous pending glow with visibly different rendered frames beyond two cycles, zero-count stop, reduced motion, themed colour, inbox workflow and persistent ARM');
    return 0;
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
