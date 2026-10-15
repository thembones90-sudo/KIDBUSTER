'use strict';
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-krisp-queue-reliability.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const session=(await import('../api/krisp-session.js')).default;
  const webhook=(await import('../api/krisp-webhook.js')).default;
  const {kv,__resetForTests}=await import('../api/_lib/kv-client.js');

  function response(){
    let statusCode=200,jsonBody=null;
    const res={status(code){statusCode=code;return res;},json(body){jsonBody=body;return res;}};
    return {res,result:()=>({statusCode,jsonBody})};
  }
  async function callSession(key,method='GET',body={}){
    const out=response();
    await session({method,headers:{'x-app-key':key},body},out.res);
    return out.result();
  }
  async function callWebhook(token,id){
    const out=response();
    await webhook({method:'POST',query:{token},body:{
      id:'event-'+id,data:{meeting:{id:'meeting-'+id,title:'Student '+id+' lesson',start_date:new Date(Date.now()+id*1000).toISOString()},raw_content:'Transcript content '+id}
    }},out.res);
    return out.result();
  }
  async function deliverWithRetry(token,id){
    for(let attempt=0;attempt<10;attempt++){
      const result=await callWebhook(token,id);
      if(result.statusCode!==503)return result;
      await new Promise(resolve=>setTimeout(resolve,1));
    }
    throw new Error('Krisp webhook stayed busy');
  }

  __resetForTests();
  const key=await svc.getOrCreateFreeLicense('krisp-queue@example.com');
  await svc.activateOrRenewPro({licenseKey:key,paymentCustomerId:'krisp_customer',paymentSubscriptionId:'krisp_subscription'});
  const initial=await callSession(key);
  const token=new URL(initial.jsonBody.webhookUrl).searchParams.get('token');
  await callSession(key,'POST',{action:'wait'});

  console.log('\n1) concurrent deliveries are serialized and retryable without loss');
  const firstWave=await Promise.all(Array.from({length:10},(_,index)=>callWebhook(token,index+1)));
  const acceptedIds=[];
  firstWave.forEach((result,index)=>{if(result.statusCode===200)acceptedIds.push(index+1);});
  const busyIds=[];
  firstWave.forEach((result,index)=>{if(result.statusCode===503)busyIds.push(index+1);});
  check('contention is explicitly retryable, never falsely acknowledged',firstWave.every(result=>result.statusCode===200||result.statusCode===503));
  await Promise.all(busyIds.map(id=>deliverWithRetry(token,id)));
  const received=[];
  for(let i=0;i<10;i++){
    const polled=await callSession(key);
    if(polled.jsonBody.matched)received.push(polled.jsonBody.matched.meetingId);
  }
  check('all ten transcripts survive arrivals before browser polling',new Set(received).size===10);
  check('each queued transcript is consumed exactly once',received.length===10);
  const afterDrain=await callSession(key);
  check('queue is empty after ten atomic consumes',afterDrain.jsonBody.matched===null);
  check('ARM remains active after every queued transcript',afterDrain.jsonBody.waiting===true);

  console.log('\n2) duplicate retries cannot create a second queue item');
  const duplicate=await deliverWithRetry(token,1);
  check('provider retry receives an idempotent success',duplicate.statusCode===200&&duplicate.jsonBody.stored===false);
  const afterDuplicate=await callSession(key);
  check('duplicate retry does not recreate a consumed transcript',afterDuplicate.jsonBody.matched===null);

  console.log('\n3) only explicit disarm changes persistent ARM state');
  await callSession(key,'POST',{action:'cancel-wait'});
  const disarmed=await callSession(key);
  check('explicit DISARM clears waiting state',disarmed.jsonBody.waiting===false);
  const pendingDelivery=await deliverWithRetry(token,99);
  check('disarmed delivery is safely stored as pending',pendingDelivery.statusCode===200&&pendingDelivery.jsonBody.matched===false);
  const pending=await callSession(key);
  check('pending inbox exposes the disarmed transcript',pending.jsonBody.pending.some(item=>item.meetingId==='meeting-99'));

  console.log('\n4) retry after a partial pending write repairs without duplicating');
  const originalSet=kv.set;
  let failTimestampOnce=true;
  kv.set=async function(keyName,value,options){
    if(failTimestampOnce&&String(keyName).endsWith('lastReceivedAt')){
      failTimestampOnce=false;
      throw new Error('Synthetic timestamp write failure');
    }
    return originalSet.call(this,keyName,value,options);
  };
  let interrupted;
  try{
    interrupted=await callWebhook(token,100);
  }finally{
    kv.set=originalSet;
  }
  check('partial pending commit returns retryable server failure',interrupted.statusCode===500);
  const repaired=await deliverWithRetry(token,100);
  check('provider retry repairs the interrupted commit',repaired.statusCode===200&&repaired.jsonBody.stored===true);
  const afterRepair=await callSession(key);
  check('repaired pending inbox contains exactly one copy',afterRepair.jsonBody.pending.filter(item=>item.meetingId==='meeting-100').length===1);

  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
