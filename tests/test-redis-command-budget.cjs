'use strict';
// P0 2026-10-29: idle Krisp inbox polls exhausted the Upstash command quota.
// Counts every KV command the real handlers issue, and proves the cheap idle
// path never weakens leasing, acknowledgement, isolation or retention.
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-redis-command-budget.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const session=(await import('../api/krisp-session.js')).default;
  const webhook=(await import('../api/krisp-webhook.js')).default;
  const {kv,__resetForTests,__simulateOutage}=await import('../api/_lib/kv-client.js');
  const COUNTED=['get','set','del','getdel','mget','incr','expire','scan'];
  const original={};let log=[];
  for(const name of COUNTED){original[name]=kv[name];kv[name]=function(...args){log.push(name);return original[name].apply(this,args);};}
  const measure=async work=>{log=[];const result=await work();return {result,commands:log.length,names:[...log]};};
  const originalNow=Date.now;let now=originalNow();
  function out(){let statusCode=200,jsonBody=null;const res={status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};return {res,get:()=>({statusCode,jsonBody})};}
  async function poll(key,query={}){const o=out();await session({method:'GET',query,headers:{'x-app-key':key,host:'t.example'}},o.res);return o.get();}
  async function post(key,body){const o=out();await session({method:'POST',headers:{'x-app-key':key,host:'t.example'},body},o.res);return o.get();}
  async function deliver(token,id){
    const o=out();
    await webhook({method:'POST',query:{token},body:{id:'event-'+id,data:{meeting:{id:'meeting-'+id,title:'Student '+id+' lesson',start_date:new Date(now).toISOString()},raw_content:'Lesson transcript '+id}}},o.res);
    return o.get();
  }
  async function proKey(email){
    const key=await svc.getOrCreateFreeLicense(email);
    await svc.activateOrRenewPro({licenseKey:key,paymentCustomerId:'c_'+email,paymentSubscriptionId:'s_'+email});
    return key;
  }
  const tokenOf=async key=>new URL((await poll(key)).jsonBody.webhookUrl).searchParams.get('token');
  try{
    Date.now=()=>now;
    __resetForTests();
    const a=await proKey('budget-a@example.com'),b=await proKey('budget-b@example.com');
    const tokenA=await tokenOf(a),tokenB=await tokenOf(b);

    console.log('\n1) idle polling');
    const idle=await measure(()=>poll(a));
    check('an idle inbox poll costs exactly one Redis command (was 10, hotfix 9)',idle.commands===1&&idle.names[0]==='mget');
    check('idle poll response shape is unchanged',idle.result.statusCode===200&&idle.result.jsonBody.matched===null&&
      idle.result.jsonBody.pendingCount===0&&idle.result.jsonBody.waiting===false&&idle.result.jsonBody.webhookLinkRepaired===false&&
      new URL(idle.result.jsonBody.webhookUrl).searchParams.get('token')===tokenA&&idle.result.jsonBody.retentionDays>0);
    let day=0;for(let i=0;i<20;i++)day+=(await measure(()=>poll(a))).commands;
    check('twenty idle polls never write and cost twenty commands',day===20);
    const armed=await post(a,{action:'wait'});
    const armedIdle=await measure(()=>poll(a));
    check('armed but empty inbox is still one command',armed.statusCode===200&&armedIdle.commands===1&&armedIdle.result.jsonBody.waiting===true);

    console.log('\n2) webhook delivery during polling, acknowledgement, retries');
    check('armed delivery is matched',(await deliver(tokenA,'one')).jsonBody.matched===true);
    const [tab1,tab2]=await Promise.all([poll(a),poll(a)]);
    const offered=[tab1,tab2].filter(r=>r.jsonBody&&r.jsonBody.matched).length;
    const busy=[tab1,tab2].filter(r=>r.statusCode===503).length;
    check('two tabs polling together: exactly one receives the transcript',offered===1&&offered+busy<=2);
    const leasedPoll=await poll(a);
    check('inside the lease window no duplicate is handed out',leasedPoll.statusCode===200&&leasedPoll.jsonBody.matched===null);
    now+=46*1000;
    const redelivered=await poll(a);
    check('a lost response is redelivered once the lease lapses',redelivered.jsonBody.matched?.meetingId==='meeting-one'&&
      redelivered.jsonBody.matched.transcript==='Lesson transcript one');
    check('acknowledgement removes it',(await post(a,{action:'ack-matched',meetingId:'meeting-one'})).jsonBody.acked===true);
    const afterAck=await measure(()=>poll(a));
    check('after acknowledgement polling returns to one command',afterAck.commands===1&&afterAck.result.jsonBody.matched===null);

    console.log('\n3) pending inbox (disarmed delivery) and delayed transcripts');
    await post(a,{action:'cancel-wait'});
    check('disarmed delivery goes to Pending',(await deliver(tokenA,'two')).jsonBody.matched===false);
    now+=2*3600*1000; // a transcript that arrives while the teacher is away
    const withPending=await measure(()=>poll(a));
    check('pending transcripts are listed without the lock (index MGET + body MGET)',withPending.commands===2&&
      withPending.result.jsonBody.pendingCount===1&&withPending.result.jsonBody.pending[0].meetingId==='meeting-two'&&
      withPending.result.jsonBody.pending[0].transcript==='Lesson transcript two');
    const claim=await post(a,{action:'claim',meetingId:'meeting-two'});
    check('pending transcript can still be claimed',claim.statusCode===200&&claim.jsonBody.claimed.transcript==='Lesson transcript two');

    console.log('\n4) multi-user isolation');
    await post(b,{action:'wait'});
    await deliver(tokenB,'b-only');
    const aView=await measure(()=>poll(a));
    check('teacher A never sees teacher B\'s transcript and stays on the cheap path',aView.commands===1&&aView.result.jsonBody.matched===null&&aView.result.jsonBody.pendingCount===0);
    const bView=await poll(b);
    check('teacher B receives their own transcript',bView.jsonBody.matched?.meetingId==='meeting-b-only');
    const sim=[];for(let i=0;i<10;i++)sim.push(await proKey('budget-sim-'+i+'@example.com'));
    for(const k of sim)await poll(k); // first poll creates the token mapping
    const ten=await measure(()=>Promise.all(sim.map(k=>poll(k))));
    check('ten simultaneous idle teachers cost ten commands per poll round',ten.commands===10&&ten.result.every(r=>r.statusCode===200));

    console.log('\n5) queue expiration');
    const c=await proKey('budget-expiry@example.com');const tokenC=await tokenOf(c);
    await post(c,{action:'wait'});await deliver(tokenC,'expires');
    now+=13*3600*1000; // past the 12-hour new-transcript window, never acknowledged
    const expiredPoll=await poll(c);
    check('an expired matched transcript is never delivered',expiredPoll.statusCode===200&&expiredPoll.jsonBody.matched===null);
    const cleaned=await measure(()=>poll(c));
    check('the locked path pruned it, so the next poll is one command again',cleaned.commands===1);

    console.log('\n6) legacy single-slot record is still migrated');
    await kv.set('krisp:data:'+a+':matched',{meetingId:'legacy-1',transcript:'Legacy transcript',receivedAt:new Date(now).toISOString()});
    const legacy=await poll(a);
    check('legacy matched record is delivered through the locked path',legacy.jsonBody.matched?.meetingId==='legacy-1');
    check('legacy slot was consumed',(await kv.get('krisp:data:'+a+':matched'))===null);
    await post(a,{action:'ack-matched',meetingId:'legacy-1'});

    console.log('\n7) entitlement and connection verification are unchanged');
    const free=await svc.getOrCreateFreeLicense('budget-free@example.com');
    const denied=await measure(()=>poll(free));
    check('a Free account is refused after one command',denied.result.statusCode===403&&denied.commands===1);
    check('a missing key is refused',(await poll(undefined)).statusCode===403);
    await kv.set('krisp:token:'+tokenA,null); // reverse mapping lost (migration)
    const verify=await poll(a,{verify:'1'});
    check('verify=1 still repairs a broken webhook link',verify.statusCode===200&&verify.jsonBody.webhookLinkRepaired===true);
    const repairedToken=new URL(verify.jsonBody.webhookUrl).searchParams.get('token');
    check('the idle path then reports the repaired link',new URL((await poll(a)).jsonBody.webhookUrl).searchParams.get('token')===repairedToken);

    console.log('\n8) Redis outage and recovery');
    await post(a,{action:'wait'});await deliver(repairedToken,'outage');
    __simulateOutage(true);
    let failedClosed=false;
    try{const r=await poll(a);failedClosed=r.statusCode>=500;}catch(_err){failedClosed=true;}
    check('during an outage the poll fails instead of reporting an empty inbox',failedClosed);
    __simulateOutage(false);
    const recovered=await poll(a);
    check('after recovery the transcript queued before the outage is delivered',recovered.jsonBody.matched?.meetingId==='meeting-outage');
    await post(a,{action:'ack-matched',meetingId:'meeting-outage'});

    console.log('\n9) projected daily budget (theoretical, from measured per-poll cost)');
    const perPoll=(await measure(()=>poll(a))).commands;
    check('one teacher, 8 h visible and armed at 15 s: <= 1,920 commands/day (was 57,600)',perPoll*8*240<=1920);
  }finally{
    Date.now=originalNow;__simulateOutage(false);
    for(const name of COUNTED)kv[name]=original[name];
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
