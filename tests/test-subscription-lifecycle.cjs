'use strict';
const crypto=require('node:crypto');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-subscription-lifecycle.cjs ===');
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.LEMONSQUEEZY_WEBHOOK_SECRET='fake-secret-subscription-lifecycle';
 process.env.PAYMENT_PROVIDER='lemonsqueezy';
 delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
 const {__resetForTests}=await import('../api/_lib/kv-client.js');
 const license=await import('../api/_lib/licensing.js');
 const service=await import('../api/_lib/license-service.js');
 const webhook=(await import('../api/payment-webhook.js')).default;
 const ls=await import('../api/_lib/providers/lemonsqueezy.js');
 const status=(await import('../api/license-status.js')).default;
 const krisp=(await import('../api/krisp-session.js')).default;

 const date=(delta)=>new Date(Date.now()+delta*86400000).toISOString();
 async function send(eventName,key,subscriptionId,when,{endsAt=null,invoice=false,statusValue=null,
    customerId='customer-main',email='paying@example.test',dropSub=false}={}){
   const attributes={
     customer_id:customerId,user_email:email,
     updated_at:when,created_at:when,ends_at:endsAt,
     status:statusValue || (eventName==='subscription_cancelled'?'cancelled':
       eventName==='subscription_expired'?'expired':'active'),
     ...(invoice?{subscription_id:dropSub?null:subscriptionId}:{})
   };
   const payload={
     meta:{event_name:eventName,custom_data:{license_key:key}},
     data:{type:invoice?'subscription-invoices':'subscriptions',
       id:invoice?'inv-'+subscriptionId+'-'+when:subscriptionId,attributes}
   };
   const bytes=Buffer.from(JSON.stringify(payload));
   const sig=crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(bytes).digest('hex');
   const req={method:'POST',headers:{'x-signature':sig},
      on(name,cb){if(name==='data')cb(bytes);if(name==='end')cb();return this}};
   const res={status(code){this.code=code;return this},json(value){this.body=value;return this}};
   await webhook(req,res);
   return {code:res.code,body:res.body,payload};
 }
 async function getStatus(key){
   const req={method:'GET',headers:{'x-app-key':key}};
   const res={status(code){this.code=code;return this},json(data){this.data=data;return this}};
   await status(req,res);
   return {code:res.code,data:res.data};
 }
 async function getKrispCode(key){
   const req={method:'GET',headers:{'x-app-key':key}};
   const res={status(code){this.code=code;return this},json(data){this.body=data;return this}};
   await krisp(req,res);
   return res.code;
 }
 try{
  __resetForTests();
  const key=await service.getOrCreateFreeLicense('paying@example.test');
  const initial=await send('subscription_created',key,'sub-first',date(-8));
  check('initial payment activates Pro',initial.code===200 && (await license.getLicense(key)).plan==='pro');
  const inv=await send('subscription_payment_success',key,'sub-first',date(-7),{invoice:true});
  check('invoice renewal maps data.attributes.subscription_id, not invoice data.id',
    inv.code===200 && (await license.getLicense(key)).paymentSubscriptionId==='sub-first');
  const graceEnd=date(20);
  const cancel=await send('subscription_cancelled',key,'sub-first',date(-6),{endsAt:graceEnd});
  const cancelled=await license.getLicense(key);
  check('cancellation records paid-through date without removing Pro',
    cancel.code===200 && cancelled.plan==='pro' &&
    cancelled.subscriptionStatus==='cancelled' &&
    cancelled.subscriptionEndsAt===graceEnd);
  check('current customer retains Pro and Krisp before paid-through deadline',
    (await service.checkEntitlement(key,'OF')).allowed===true &&
    (await getKrispCode(key))===200);
  check('paid-through expiry projects Free without requiring an expiry webhook',
    license.effectiveSubscriptionLicense(cancelled,new Date(Date.parse(graceEnd)+10)).plan==='free');
  const oldInvoice=await send('subscription_payment_success',key,'sub-first',date(-7),{invoice:true});
  const staleUpdated=await send('subscription_updated',key,'sub-first',date(-7),{statusValue:'active'});
  check('late old invoice cannot revive a cancelled subscription',
    oldInvoice.code===200 && (await license.getLicense(key)).subscriptionStatus==='cancelled');
  check('late active subscription snapshot cannot undo newer cancellation',
    staleUpdated.code===200 && (await license.getLicense(key)).subscriptionStatus==='cancelled');
  const resumed=await send('subscription_resumed',key,'sub-first',date(-5));
  check('genuine newer resume restores active renewal status',
    resumed.code===200 &&
    (await license.getLicense(key)).subscriptionStatus==='active' &&
    (await license.getLicense(key)).subscriptionEndsAt===null);
  const staleExpiry=await send('subscription_expired',key,'sub-first',date(-6),{endsAt:graceEnd});
  check('older expiry arriving after resumption is ignored',
    staleExpiry.code===200 && (await license.getLicense(key)).plan==='pro');
  const finalExpiry=await send('subscription_expired',key,'sub-first',date(-4),{endsAt:date(-4)});
  check('current expiry downgrades to Free but retains subscription identity',
    finalExpiry.code===200 && (await license.getLicense(key)).plan==='free' &&
    (await license.getLicense(key)).paymentSubscriptionId==='sub-first' &&
    (await license.getLicense(key)).subscriptionStatus==='expired');
  check('expired subscription cannot call Krisp and has Free entitlement',
    (await getKrispCode(key))===403 &&
    (await getStatus(key)).data.plan==='free');

  const sameSubRevival=await send('subscription_resumed',key,'sub-first',date(-3));
  check('expired old subscription cannot be revived by a late resume',
    sameSubRevival.code===200 && (await license.getLicense(key)).plan==='free');
  const newSubscription=await send('subscription_created',key,'sub-second',date(-2));
  check('genuinely new subscription restores Pro, on SAME license identity',
    newSubscription.code===200 &&
    (await license.getLicense(key)).paymentSubscriptionId==='sub-second' &&
    (await license.getLicense(key)).plan==='pro');
  const lateOldCancel=await send('subscription_cancelled',key,'sub-first',date(1),{endsAt:date(5)});
  const lateOldExpiry=await send('subscription_expired',key,'sub-first',date(2),{endsAt:date(2)});
  check('late prior-subscription cancellation cannot downgrade new subscription',
    lateOldCancel.code===200 && (await license.getLicense(key)).plan==='pro');
  check('late prior-subscription expiry cannot downgrade new subscription',
    lateOldExpiry.code===200 && (await license.getLicense(key)).paymentSubscriptionId==='sub-second');
  const lateOldRenewal=await send('subscription_payment_success',key,'sub-first',date(3),{invoice:true});
  check('late invoice for prior subscription never changes the current subscriber ID',
    lateOldRenewal.code===200 && (await license.getLicense(key)).paymentSubscriptionId==='sub-second');

  const forgedAssociation=await send('subscription_updated',key,'sub-second',date(5),
    {statusValue:'active',customerId:'different-customer'});
  check('wrong customer ID cannot replace ownership of an existing subscription',
    forgedAssociation.code===500 &&
    (await license.getLicense(key)).paymentCustomerId==='customer-main');

  const unknownCancel=await send('subscription_cancelled',key,'sub-second',date(4),{endsAt:null});
  check('cancellation without ends_at returns retryable failure instead of unlimited Pro',
    unknownCancel.code===500 && (await license.getLicense(key)).subscriptionStatus==='active');
  const goodCancel=await send('subscription_cancelled',key,'sub-second',date(4),{endsAt:date(-1)});
  check('cancellation whose paid-through deadline passed shows Free immediately',
    goodCancel.code===200 && (await getStatus(key)).data.plan==='free' &&
    (await service.checkEntitlement(key,'OF')).license.plan==='free' &&
    (await getKrispCode(key))===403);
  check('past-deadline cancellation still retains stored subscription for ordering',
    (await license.getLicense(key)).paymentSubscriptionId==='sub-second');
  const oldCreation=await send('subscription_created',key,'sub-second',date(-2));
  check('late initial creation cannot restart cancelled same subscription',
    oldCreation.code===200 && (await getStatus(key)).data.plan==='free');

  // A plain subscription_updated snapshot is enough to reflect cancellation,
  // as provider emits it alongside subscription_cancelled.
  __resetForTests();
  const second=await service.getOrCreateFreeLicense('snapshot@example.test');
  await send('subscription_created',second,'sub-updated',date(-3),{email:'snapshot@example.test'});
  const snapshot=await send('subscription_updated',second,'sub-updated',date(-2),
    {statusValue:'cancelled',endsAt:date(8),email:'snapshot@example.test'});
  check('signed updated=cancelled snapshot preserves paid Pro grace',
    snapshot.code===200 && (await license.getLicense(second)).subscriptionStatus==='cancelled');
  const snapshotExpiry=await send('subscription_updated',second,'sub-updated',date(-1),
    {statusValue:'expired',endsAt:date(-1),email:'snapshot@example.test'});
  check('signed updated=expired snapshot downgrades after billing ends',
    snapshotExpiry.code===200 && (await license.getLicense(second)).plan==='free');

  const missingInvoice=await send('subscription_payment_success',second,'sub-updated',date(1),
    {invoice:true,dropSub:true,email:'snapshot@example.test'});
  check('invoice without subscription_id is rejected, not treated as a new subscription',
    missingInvoice.code===500 && (await license.getLicense(second)).paymentSubscriptionId==='sub-updated');
 }finally{
  // All tests operate on in-memory KV; no production account is involved.
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1)});
