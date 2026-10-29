'use strict';
// Krisp transcripts must not be retained forever, and accounts that are no
// longer entitled must not keep accumulating them.
const {createChecker}=require('./helpers/assert.cjs');
const DAY=24*60*60*1000;

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-krisp-retention.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const licensing=await import('../api/_lib/licensing.js');
  const session=(await import('../api/krisp-session.js')).default;
  const webhook=(await import('../api/krisp-webhook.js')).default;
  const retention=await import('../api/_lib/krisp-retention.js');
  const {kv,__resetForTests}=await import('../api/_lib/kv-client.js');
  const originalNow=Date.now;
  const priorDays=process.env.KRISP_RETENTION_DAYS;
  let now=originalNow();

  function out(){let statusCode=200,jsonBody=null;const res={status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};return {res,get:()=>({statusCode,jsonBody})};}
  async function callSession(key,method='GET',body={}){const o=out();await session({method,headers:{'x-app-key':key,host:'t.example'},body},o.res);return o.get();}
  async function deliver(token,id,minutesFromNow=0){
    const o=out();
    await webhook({method:'POST',query:{token},body:{id:'event-'+id,data:{meeting:{id:'meeting-'+id,title:'Student '+id+' lesson',start_date:new Date(now+minutesFromNow*60000).toISOString()},raw_content:'Lesson transcript '+id}}},o.res);
    return o.get();
  }
  const pendingKeyFor=key=>'krisp:data:'+key+':pending';

  try{
    Date.now=()=>now;
    delete process.env.KRISP_RETENTION_DAYS;
    check('default retention is 14 days',retention.krispRetentionDays()===14);
    process.env.KRISP_RETENTION_DAYS='0';check('out-of-range retention falls back to the default',retention.krispRetentionDays()===14);
    process.env.KRISP_RETENTION_DAYS='500';check('over-maximum retention falls back to the default',retention.krispRetentionDays()===14);
    process.env.KRISP_RETENTION_DAYS='7';check('a valid configured retention is honoured',retention.krispRetentionDays()===7);
    delete process.env.KRISP_RETENTION_DAYS;

    console.log('\n1) pure pruning rules');
    const live={receivedAt:new Date(now-1*DAY).toISOString()};
    const old={receivedAt:new Date(now-15*DAY).toISOString()};
    const unknownAge={meetingId:'legacy'};
    const pruned=retention.pruneExpiredImports([live,old,unknownAge],now);
    check('records older than retention are dropped',pruned.length===1&&pruned[0]===live);
    check('a record with unreadable age is dropped (unknown age never means keep forever)',!pruned.includes(unknownAge));
    check('non-array input yields an empty queue',retention.pruneExpiredImports(null,now).length===0);
    check('queue storage expiry follows the NEWEST record so no live record is cut short',
      retention.queueTtlSeconds([{receivedAt:new Date(now-10*DAY).toISOString()},{receivedAt:new Date(now).toISOString()}],now)===14*86400);

    console.log('\n2) stored inbox expires, per record and at storage level');
    __resetForTests();
    const key=await svc.getOrCreateFreeLicense('krisp-retention@example.com');
    await svc.activateOrRenewPro({licenseKey:key,paymentCustomerId:'ret_customer',paymentSubscriptionId:'ret_subscription'});
    const first=await callSession(key);
    const token=new URL(first.jsonBody.webhookUrl).searchParams.get('token');
    check('GET reports the retention period',first.jsonBody.retentionDays===14);
    await retention.writeImportQueue(pendingKeyFor(key),[{meetingId:'meeting-a',transcript:'Existing legacy A',receivedAt:new Date(now).toISOString()}]);
    check('existing legacy delivery stays inline',(await kv.get(pendingKeyFor(key)))[0].retentionVersion===undefined);
    now+=10*DAY;
    const previous=await retention.readImportQueue(pendingKeyFor(key));
    await retention.writeImportQueue(pendingKeyFor(key),[...previous,{meetingId:'meeting-b',transcript:'Existing legacy B',receivedAt:new Date(now).toISOString()}]);
    check('legacy reader preserves both historical arrivals',(await kv.get(pendingKeyFor(key))).length===2);
    let listed=await callSession(key);
    check('both records are visible inside the retention window',listed.jsonBody.pendingCount===2);
    now+=5*DAY; // first record is now 15 days old, second 5 days old
    listed=await callSession(key);
    check('the expired record disappears on read while the live record stays',
      listed.jsonBody.pendingCount===1&&listed.jsonBody.pending[0].meetingId==='meeting-b');
    check('a live record is not cut short by the storage-level expiry',Array.isArray(await kv.get(pendingKeyFor(key))));
    now+=10*DAY; // second record is now 15 days old
    check('with no reads or writes the datastore itself deletes the idle inbox',(await kv.get(pendingKeyFor(key)))===null);
    listed=await callSession(key);
    check('an emptied inbox reads as empty',listed.jsonBody.pendingCount===0&&listed.jsonBody.pending.length===0);

    console.log('\n3) matched (armed) transcripts expire too');
    __resetForTests();
    const key2=await svc.getOrCreateFreeLicense('krisp-retention-matched@example.com');
    await svc.activateOrRenewPro({licenseKey:key2,paymentCustomerId:'ret2_customer',paymentSubscriptionId:'ret2_subscription'});
    const t2=new URL((await callSession(key2)).jsonBody.webhookUrl).searchParams.get('token');
    await callSession(key2,'POST',{action:'wait'});
    const matchedDelivery=await deliver(t2,'m');
    check('armed delivery is matched',matchedDelivery.jsonBody.matched===true);
    now+=15*DAY;
    const afterExpiry=await callSession(key2);
    check('an uncollected matched transcript is not delivered after retention',afterExpiry.jsonBody.matched===null);

    console.log('\n4) lapsed accounts do not accumulate transcripts');
    __resetForTests();now=originalNow();
    const key3=await svc.getOrCreateFreeLicense('krisp-lapsed@example.com');
    await svc.activateOrRenewPro({licenseKey:key3,paymentCustomerId:'lapse_customer',paymentSubscriptionId:'lapse_subscription'});
    const t3=new URL((await callSession(key3)).jsonBody.webhookUrl).searchParams.get('token');
    check('an entitled account stores deliveries',(await deliver(t3,'x')).jsonBody.stored===true);
    await svc.downgradeToFree({licenseKey:key3});
    const lapsed=await deliver(t3,'y');
    check('after downgrade the delivery is acknowledged but discarded',lapsed.statusCode===200&&lapsed.jsonBody.stored===false);
    const raw=await kv.get(pendingKeyFor(key3));
    check('the discarded delivery was never written',Array.isArray(raw)&&raw.length===1&&raw[0].meetingId==='meeting-x');
    const manual=await svc.createManualProLicense({email:'',days:30});
    const manualEntitled=await retention.isEntitledToKrisp(manual.licenseKey);
    check('an unactivated stock key is not entitled to Krisp',manualEntitled===false);
    check('an unknown key is not entitled',(await retention.isEntitledToKrisp('kb_live_unknown'))===false);
  }finally{
    Date.now=originalNow;
    if(priorDays===undefined)delete process.env.KRISP_RETENTION_DAYS;else process.env.KRISP_RETENTION_DAYS=priorDays;
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
