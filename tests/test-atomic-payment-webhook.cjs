'use strict';
const crypto=require('node:crypto');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-atomic-payment-webhook.cjs ===');
 const originalEnv=Object.fromEntries(['KIDBUSTER_TEST_KV','LEMONSQUEEZY_WEBHOOK_SECRET','PAYMENT_PROVIDER',
   'GOOGLE_SHEET_WEBHOOK_URL'].map(k=>[k,process.env[k]]));
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.LEMONSQUEEZY_WEBHOOK_SECRET='synthetic-atomic-webhook-secret';
 process.env.PAYMENT_PROVIDER='lemonsqueezy';
 delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
 const store=await import('../api/_lib/kv-client.js');
 const lic=await import('../api/_lib/licensing.js');
 const svc=await import('../api/_lib/license-service.js');
 const webhook=(await import('../api/payment-webhook.js')).default;
 const kv=store.kv;
 const baseTime=Date.now();
 const ts=n=>new Date(baseTime+n*60000).toISOString();
 const payload=(key,kind,when,endsAt=null)=>({
   meta:{event_name:kind,custom_data:{license_key:key}},
   data:{type:'subscriptions',id:'subscription-atomic-test',
     attributes:{customer_id:'cust-atomic',user_email:'atomic@example.test',
       created_at:when,updated_at:when,status:kind==='subscription_cancelled'?'cancelled':'active',
       ends_at:endsAt}}
 });
 function signedBytes(data){
   const raw=Buffer.from(JSON.stringify(data));
   const signature=crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest('hex');
   return {raw,signature};
 }
 async function send(data){
   const {raw,signature}=signedBytes(data);
   return await sendRaw(raw,signature);
 }
 async function sendRaw(raw,signature){
   const req={method:'POST',headers:signature?{'x-signature':signature}:{},
     on(name,cb){if(name==='data')cb(raw);if(name==='end')cb();return this}};
   const res={status(code){this.code=code;return this},json(body){this.body=body;return this},
     setHeader(k,v){this.headers??={};this.headers[k]=v;}};
   await webhook(req,res);
   return {code:res.code,body:res.body,headers:res.headers||{}};
 }
 let originalSet=kv.set;
 let actualNow=Date.now;
 try{
   store.__resetForTests();
   const key=await svc.getOrCreateFreeLicense('atomic@example.test');
   const creation=payload(key,'subscription_created',ts(-5));
   const cancellation=payload(key,'subscription_cancelled',ts(-4),ts(600));

   // Freeze the first writer AFTER lock acquisition, just before the
   // authoritative license record write. Competing requests MUST NOT apply.
   let entered;
   const enteredPromise=new Promise(resolve=>entered=resolve);
   let resume;
   const resumePromise=new Promise(resolve=>resume=resolve);
   let hold=true;
   kv.set=async (keyName,...args)=>{
     if(keyName==='license:'+key && hold){
       hold=false;entered();
       await resumePromise;
     }
     return originalSet.call(kv,keyName,...args);
   };
   const firstPromise=send(creation);
   await enteredPromise;
   const duplicate=await send(creation);
   const competing=await send(cancellation);
   check('concurrent identical webhook returns retryable 503 while first is active',
     duplicate.code===503 && duplicate.headers['Retry-After']==='2');
   check('distinct same-account cancellation is serialized behind in-flight creation',
     competing.code===503);
   check('competing event cannot mutate Pro before first event commits',
     (await lic.getLicense(key)).plan==='free');
   resume();
   const first=await firstPromise;
   kv.set=originalSet;
   check('winner applies initial payment exactly once',first.code===200 &&
     (await lic.getLicense(key)).plan==='pro');
   const replay=await send(creation);
   check('identical event after winner commits returns 200 duplicate',
     replay.code===200 && replay.body.duplicate===true);
   const afterCancel=await send(cancellation);
   check('previously blocked different event succeeds on retry and honors grace',
     afterCancel.code===200 && (await lic.getLicense(key)).subscriptionStatus==='cancelled');
   const duplicateCancel=await send(cancellation);
   check('cancel replay uses same durable duplicate marker',
     duplicateCancel.code===200 && duplicateCancel.body.duplicate===true);

   // Providers sometimes omit checkout custom_data in later webhooks.
   // Customer-index fallback must serialize onto the SAME account lock.
   const noCustomResume=payload(key,'subscription_resumed',ts(-2));
   delete noCustomResume.meta.custom_data.license_key;
   let resumedWrite;
   const resumeEntered=new Promise(resolve=>resumedWrite=resolve);
   let finishResume;
   const resumeBlock=new Promise(resolve=>finishResume=resolve);
   let stallNext=true;
   kv.set=async(name,...args)=>{
     if(name==='license:'+key && stallNext){
       stallNext=false;resumedWrite();await resumeBlock;
     }
     return originalSet.call(kv,name,...args);
   };
   const fallbackInFlight=send(noCustomResume);
   await resumeEntered;
   const customResumption=payload(key,'subscription_resumed',ts(-1));
   const blockedWithKey=await send(customResumption);
   check('customer-index fallback and explicit-key webhook contend on same atomic lock',
     blockedWithKey.code===503);
   finishResume();
   const fallbackResult=await fallbackInFlight;
   kv.set=originalSet;
   check('event without custom license key resumes only the indexed customer',
     fallbackResult.code===200 && (await lic.getLicense(key)).subscriptionStatus==='active');
   const laterResumption=await send(customResumption);
   check('blocked newer resumption is processed successfully on provider retry',
     laterResumption.code===200);

   // Crash-like failure AFTER state write, BEFORE dedup marker creation.
   store.__resetForTests();
   const key2=await svc.getOrCreateFreeLicense('atomic@example.test');
   const crashEvent=payload(key2,'subscription_created',ts(-3));
   const bodyHash=crypto.createHash('sha256').update(signedBytes(crashEvent).raw).digest('hex');
   let failMarker=true;
   kv.set=async(name,...args)=>{
     if(name==='webhookSeen:'+bodyHash && failMarker){
       failMarker=false;
       throw new Error('Synthetic marker-write failure after license update');
     }
     return originalSet.call(kv,name,...args);
   };
   const failed=await send(crashEvent);
   kv.set=originalSet;
   check('marker failure responds 500 and leaves retry possible',
     failed.code===500 && (await lic.getLicense(key2)).plan==='pro' &&
     !(await lic.hasProcessedWebhook(bodyHash)));
   const retried=await send(crashEvent);
   check('retry after interrupted marker write succeeds without state corruption',
     retried.code===200 && (await lic.hasProcessedWebhook(bodyHash)===true) &&
     (await lic.getLicense(key2)).paymentSubscriptionId==='subscription-atomic-test');
   const replays=await Promise.all(Array.from({length:32},()=>send(crashEvent)));
   check('32 concurrent retries are all duplicate or safely retryable',
     replays.every(x=>x.code===200||x.code===503));
   check('concurrent retries never corrupt the subscriber plan',
     (await lic.getLicense(key2)).plan==='pro');

   // Lock release must be token-safe; stale worker cannot delete a later lock.
   const lock='paymentLock:synthetic-unit';
   check('SET NX EX grants only the first holder',
     await store.acquirePaymentLock(lock,'holder-one',1)===true &&
     await store.acquirePaymentLock(lock,'holder-two',1)===false);
   check('incorrect owner token cannot release another worker lock',
     await store.releasePaymentLock(lock,'wrong-token')===false &&
     await kv.get(lock)==='holder-one');
   Date.now=()=>actualNow()+2000;
   check('a crashed lock expires and a new worker can recover',
     await store.acquirePaymentLock(lock,'holder-two',2)===true);
   check('expired holder cannot release newly acquired lock',
     await store.releasePaymentLock(lock,'holder-one')===false &&
     await kv.get(lock)==='holder-two');
   check('rightful owner can release own lock',
     await store.releasePaymentLock(lock,'holder-two')===true &&
     await kv.get(lock)===null);
   Date.now=actualNow;

   // Reject excess bytes before verification and without loading buffer
   // chunks indefinitely (the test sends a single oversized chunk).
   const oversized=await sendRaw(Buffer.alloc(256*1024+1,'x'),'fake');
   check('oversized signed webhook is rejected with HTTP 413',
     oversized.code===413 && !oversized.body.received);

   // A real KV outage must not skip dedup and accidentally acknowledge 200.
   store.__resetForTests();
   const key3=await svc.getOrCreateFreeLicense('atomic@example.test');
   const event3=payload(key3,'subscription_created',ts(0));
   store.__simulateOutage(true);
   const failedOutage=await send(event3);
   store.__simulateOutage(false);
   const recovered=await send(event3);
   check('KV outage fails closed with 500, provider retry succeeds after recovery',
     failedOutage.code===500 && recovered.code===200 &&
     (await lic.getLicense(key3)).plan==='pro');
 }finally{
   kv.set=originalSet;
   Date.now=actualNow;
   store.__simulateOutage(false);
   for(const [name,value] of Object.entries(originalEnv)){
     if(value===undefined)delete process.env[name]; else process.env[name]=value;
   }
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1)});
