'use strict';
// A matched (armed) Krisp transcript must survive a lost HTTP response:
// reading leases it, only an explicit acknowledgement removes it.
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-krisp-matched-delivery.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const session=(await import('../api/krisp-session.js')).default;
  const webhook=(await import('../api/krisp-webhook.js')).default;
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const originalNow=Date.now;let now=originalNow();
  function out(){let statusCode=200,jsonBody=null;const res={status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};return {res,get:()=>({statusCode,jsonBody})};}
  async function callSession(key,method='GET',body={}){const o=out();await session({method,headers:{'x-app-key':key,host:'t.example'},body},o.res);return o.get();}
  async function deliver(token,id){
    const o=out();
    await webhook({method:'POST',query:{token},body:{id:'event-'+id,data:{meeting:{id:'meeting-'+id,title:'Student '+id+' lesson',start_date:new Date(now).toISOString()},raw_content:'Lesson transcript '+id}}},o.res);
    return o.get();
  }
  try{
    Date.now=()=>now;
    __resetForTests();
    const key=await svc.getOrCreateFreeLicense('krisp-matched@example.com');
    await svc.activateOrRenewPro({licenseKey:key,paymentCustomerId:'mt_customer',paymentSubscriptionId:'mt_subscription'});
    const token=new URL((await callSession(key)).jsonBody.webhookUrl).searchParams.get('token');
    await callSession(key,'POST',{action:'wait'});
    check('armed delivery is matched',(await deliver(token,'one')).jsonBody.matched===true);

    console.log('\n1) a lost response does not lose the transcript');
    const lostResponse=await callSession(key);                 // browser never receives this
    check('first read offers the transcript',lostResponse.jsonBody.matched?.meetingId==='meeting-one');
    check('internal lease fields are not exposed to the browser',
      lostResponse.jsonBody.matched.leasedUntil===undefined&&lostResponse.jsonBody.matched.deliveryCount===undefined);
    const tooSoon=await callSession(key);
    check('a second tab polling inside the lease window is not handed a duplicate',tooSoon.jsonBody.matched===null);
    now+=46*1000;
    const retry=await callSession(key);
    check('after the lease lapses the same transcript is offered again',retry.jsonBody.matched?.meetingId==='meeting-one');
    check('the redelivered transcript is intact',retry.jsonBody.matched.transcript==='Lesson transcript one');

    console.log('\n2) only an acknowledgement removes it');
    const ack=await callSession(key,'POST',{action:'ack-matched',meetingId:'meeting-one'});
    check('acknowledgement succeeds',ack.statusCode===200&&ack.jsonBody.acked===true);
    now+=46*1000;
    check('an acknowledged transcript is never offered again',(await callSession(key)).jsonBody.matched===null);
    const again=await callSession(key,'POST',{action:'ack-matched',meetingId:'meeting-one'});
    check('repeating an acknowledgement is harmless',again.statusCode===200&&again.jsonBody.acked===false);
    const noId=await callSession(key,'POST',{action:'ack-matched'});
    check('an acknowledgement without an id is rejected',noId.statusCode===400);

    console.log('\n3) acknowledging one item leaves the others queued');
    await deliver(token,'two');await deliver(token,'three');
    const second=await callSession(key);
    check('oldest queued transcript is offered first',second.jsonBody.matched?.meetingId==='meeting-two');
    await callSession(key,'POST',{action:'ack-matched',meetingId:'meeting-two'});
    const third=await callSession(key);
    check('the next transcript is still waiting after the first was acknowledged',third.jsonBody.matched?.meetingId==='meeting-three');
    check('acknowledging an unrelated id does not remove an offered transcript',
      (await callSession(key,'POST',{action:'ack-matched',meetingId:'meeting-unrelated'})).jsonBody.acked===false);

    console.log('\n4) a client that never acknowledges stops being offered the item');
    let offers=0;
    for(let i=0;i<25;i++){
      now+=46*1000;
      const r=await callSession(key);
      if(r.jsonBody.matched?.meetingId==='meeting-three')offers++;
    }
    check('an unacknowledged transcript is offered a bounded number of times',offers>=1&&offers<=19);
    now+=46*1000;
    check('and then no longer offered',(await callSession(key)).jsonBody.matched===null);
  }finally{Date.now=originalNow;}
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
