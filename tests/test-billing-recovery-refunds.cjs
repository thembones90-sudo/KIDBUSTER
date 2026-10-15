'use strict';
const crypto=require('node:crypto');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-billing-recovery-refunds.cjs ===');
 const vars=['KIDBUSTER_TEST_KV','LEMONSQUEEZY_WEBHOOK_SECRET','PAYMENT_PROVIDER','GOOGLE_SHEET_WEBHOOK_URL','OWNER_LICENSE_KEYS'];
 const previous=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.LEMONSQUEEZY_WEBHOOK_SECRET='v2-billing-fixtures-only';
 process.env.PAYMENT_PROVIDER='lemonsqueezy';
 process.env.OWNER_LICENSE_KEYS='synthetic-owner-billing-only';
 delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
 const {__resetForTests}=await import('../api/_lib/kv-client.js');
 const svc=await import('../api/_lib/license-service.js');
 const licensing=await import('../api/_lib/licensing.js');
 const webhook=(await import('../api/payment-webhook.js')).default;
 const status=(await import('../api/license-status.js')).default;
 const krisp=(await import('../api/krisp-session.js')).default;
 const ownerLookup=(await import('../api/admin-license-lookup.js')).default;

 const base=Date.now();
 const time=minutes=>new Date(base+minutes*60000).toISOString();
 let seq=0;
 function fixture(key,eventName,minutes,options={}){
   const invoice=eventName.startsWith('subscription_payment_');
   const order=eventName==='order_refunded';
   const subscriptionId=options.subscriptionId||'sub-billing';
   const orderId=options.orderId||'order-billing';
   const { customerId='customer-billing',email='billing@example.test',
      subscriptionStatus,refunded=false,refundedAmount=null,total=1200,
      includeKey=true,invoiceId=null }=options;
   let statusValue=subscriptionStatus ||
     (eventName==='subscription_expired'?'expired':
      eventName==='subscription_cancelled'?'cancelled':
      eventName==='subscription_paused'?'paused':
      eventName==='subscription_payment_failed'?'past_due':
      eventName==='subscription_payment_refunded'?(refunded?'refunded':'paid'):'active');
   const attributes={
     customer_id:customerId,user_email:email,
     created_at:time(minutes),updated_at:time(minutes),
     status: statusValue,
     ...(invoice?{subscription_id:subscriptionId}:{order_id:orderId}),
     ...(invoice||order?{refunded,refunded_amount:refundedAmount,total}:{}),
     ...(eventName==='subscription_cancelled'?{ends_at:time(2000)}:{})
   };
   return {
     meta:{event_name:eventName,custom_data:includeKey?{license_key:key}:{}},
     data:{
       type:invoice?'subscription-invoices':order?'orders':'subscriptions',
       id:invoice?(invoiceId||'invoice-'+(++seq)):order?orderId:subscriptionId,
       attributes
     }
   };
 }
 async function send(payload){
   const bytes=Buffer.from(JSON.stringify(payload));
   const signature=crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET)
     .update(bytes).digest('hex');
   const req={method:'POST',headers:{'x-signature':signature},
     on(name,callback){if(name==='data')callback(bytes);if(name==='end')callback();return this;}};
   const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
   await webhook(req,res);
   return {code:res.code,body:res.body};
 }
 async function getStatus(key){
   const req={method:'GET',headers:{'x-app-key':key}};
   const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
   await status(req,res);
   return res.body;
 }
 async function krispStatus(key){
   const req={method:'GET',headers:{'x-app-key':key}};
   const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
   await krisp(req,res);
   return res.code;
 }
 try{
   __resetForTests();
   const key=await svc.getOrCreateFreeLicense('billing@example.test');
   const created=await send(fixture(key,'subscription_created',-30));
   check('signed initial purchase grants Pro and remembers original order',
     created.code===200 && (await licensing.getLicense(key)).plan==='pro' &&
     (await licensing.getLicense(key)).subscriptionOrderId==='order-billing');

   const failed=await send(fixture(key,'subscription_payment_failed',-29,
     {invoiceId:'invoice-failed-1'}));
   const afterFail=await licensing.getLicense(key);
   check('failed renewal sets billing warning without revoking Pro',
     failed.code===200 && afterFail.plan==='pro' &&
     afterFail.subscriptionBillingStatus==='payment_failed' &&
     afterFail.subscriptionLastInvoiceId==='invoice-failed-1');
   check('failed renewal keeps Pro-only entitlement and Krisp available',
     (await svc.checkEntitlement(key,'OF')).allowed===true &&
     (await krispStatus(key))===200);
   check('account status explicitly tells customer payment recovery is needed',
     (await getStatus(key)).subscriptionBillingStatus==='payment_failed');

   const pastDue=await send(fixture(key,'subscription_updated',-28,
     {subscriptionStatus:'past_due'}));
   check('past_due retains Pro and marks subscription retry state',
     pastDue.code===200 && (await licensing.getLicense(key)).subscriptionStatus==='past_due' &&
     (await licensing.getLicense(key)).plan==='pro');

   const unpaid=await send(fixture(key,'subscription_updated',-27,
     {subscriptionStatus:'unpaid'}));
   check('unpaid keeps Pro pending authoritative expired state',
     unpaid.code===200 && (await licensing.getLicense(key)).subscriptionStatus==='unpaid' &&
     (await licensing.getLicense(key)).plan==='pro');

   const oldPaid=await send(fixture(key,'subscription_payment_success',-30,
     {invoiceId:'invoice-stale'}));
   check('stale paid invoice cannot clear more recent failed payment warning',
     oldPaid.code===200 && (await licensing.getLicense(key)).subscriptionBillingStatus==='payment_failed');

   const recovered=await send(fixture(key,'subscription_payment_recovered',-25,
     {invoiceId:'invoice-recovery'}));
   check('payment recovery clears warning while retaining Pro',
     recovered.code===200 && (await licensing.getLicense(key)).subscriptionBillingStatus==='paid' &&
     (await licensing.getLicense(key)).plan==='pro');

   const active=await send(fixture(key,'subscription_updated',-24,
     {subscriptionStatus:'active'}));
   check('provider active snapshot restores healthy subscription state',
     active.code===200 && (await licensing.getLicense(key)).subscriptionStatus==='active');

   const paused=await send(fixture(key,'subscription_paused',-23,
     {subscriptionStatus:'paused'}));
   check('pausing collections does not revoke Pro',
     paused.code===200 && (await licensing.getLicense(key)).subscriptionStatus==='paused' &&
     (await licensing.getLicense(key)).plan==='pro');

   const unpaused=await send(fixture(key,'subscription_unpaused',-22,
     {subscriptionStatus:'active'}));
   check('unpause restores active billing state',
     unpaused.code===200 && (await licensing.getLicense(key)).subscriptionStatus==='active');

   const partial=await send(fixture(key,'subscription_payment_refunded',-21,
     {invoiceId:'invoice-partial',refunded:false,refundedAmount:200,total:1200}));
   let record=await licensing.getLicense(key);
   check('partial refund triggers review and never cancels subscription',
     partial.code===200 && record.plan==='pro' &&
     record.subscriptionRefundReview?.invoiceId==='invoice-partial' &&
     record.subscriptionRefundReview?.fullyRefunded===false);
   check('customer status signals refund review without exposing invoice ids',
     (await getStatus(key)).refundReviewPending===true &&
     !('subscriptionRefundReview' in await getStatus(key)));

   const full=await send(fixture(key,'subscription_payment_refunded',-20,
     {invoiceId:'invoice-full',refunded:true,refundedAmount:1200,total:1200}));
   record=await licensing.getLicense(key);
   check('full refund is flagged for review, not automatically downgraded',
     full.code===200 && record.plan==='pro' &&
     record.subscriptionRefundReview?.fullyRefunded===true &&
     record.subscriptionRefundReview?.invoiceId==='invoice-full');
   check('even after full refund notification Krisp remains governed by subscription state',
     (await krispStatus(key))===200);

   const unrelated=await send(fixture(key,'order_refunded',-19,
     {orderId:'other-order',refunded:true,refundedAmount:1200}));
   check('unrelated order refund does not affect this customer subscription',
     unrelated.code===200 &&
     (await licensing.getLicense(key)).subscriptionRefundReview?.invoiceId==='invoice-full');

   const initialOrderRefund=await send(fixture(key,'order_refunded',-18,
     {orderId:'order-billing',refunded:true,refundedAmount:1200,includeKey:false}));
   record=await licensing.getLicense(key);
   check('linked order refund records a review without revoking Pro',
     initialOrderRefund.code===200 && record.plan==='pro' &&
     record.subscriptionRefundReview?.kind==='order_refund');

   async function lookupOwner(headerKey){
     const req={method:'POST',headers:{'x-app-key':headerKey},
       body:{licenseKey:key,action:'lookup'}};
     const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
     await ownerLookup(req,res);
     return res;
   }
   const unauthorized=await lookupOwner('not-owner');
   const authorized=await lookupOwner('synthetic-owner-billing-only');
   check('refund details are inaccessible without owner authentication',
     unauthorized.code===403 && !unauthorized.body.license);
   check('owner lookup can see refund identity and billing state for investigation',
     authorized.code===200 &&
     authorized.body.license.refundReview?.kind==='order_refund' &&
     authorized.body.license.refundReview?.orderId==='order-billing' &&
     authorized.body.license.subscriptionStatus==='active');
   check('customer status endpoint never reveals refund invoice or order IDs',
     (await getStatus(key)).refundReviewPending===true &&
     (await getStatus(key)).refundReview===undefined);

   const unknownCustomerRefund=await send(fixture(key,'order_refunded',-17,{
     orderId:'unrelated-order',customerId:'someone-not-in-v2',email:'unknown@example.test',
     includeKey:false
   }));
   check('unrelated order refund acknowledged without creating customer or retry storm',
     unknownCustomerRefund.code===200 && unknownCustomerRefund.body.ignored===true);

   const newSub=await send(fixture(key,'subscription_created',-16,
     {subscriptionId:'sub-billing-two',orderId:'order-two'}));
   record=await licensing.getLicense(key);
   check('new subscription resets historical refund warning and retains stable key',
     newSub.code===200 && record.paymentSubscriptionId==='sub-billing-two' &&
     record.subscriptionRefundReview===null && record.plan==='pro');

   const priorRefund=await send(fixture(key,'subscription_payment_refunded',-15,
     {subscriptionId:'sub-billing',invoiceId:'old-invoice-refund',refunded:true}));
   check('late refund from previous subscription cannot flag current one',
     priorRefund.code===200 && (await licensing.getLicense(key)).subscriptionRefundReview===null);

   const priorFailure=await send(fixture(key,'subscription_payment_failed',-14,
     {subscriptionId:'sub-billing',invoiceId:'old-invoice-failure'}));
   check('failed old invoice cannot alter new subscription status',
     priorFailure.code===200 && (await licensing.getLicense(key)).subscriptionBillingStatus==='paid');

   const actualExpired=await send(fixture(key,'subscription_expired',-13,
     {subscriptionId:'sub-billing-two'}));
   check('actual provider expiry ends Pro and Krisp',
     actualExpired.code===200 && (await getStatus(key)).plan==='free' &&
     (await krispStatus(key))===403);

   const oldRecovery=await send(fixture(key,'subscription_payment_recovered',-12,
     {subscriptionId:'sub-billing-two',invoiceId:'late-recovered'}));
   check('late recovery cannot revive expired subscription',
     oldRecovery.code===200 && (await getStatus(key)).plan==='free');

   __resetForTests();
   const free=await svc.getOrCreateFreeLicense('fresh@example.test');
   const failedNoSub=await send(fixture(free,'subscription_payment_failed',-5,
     {email:'fresh@example.test',customerId:'fresh-customer'}));
   check('failed payment without an existing subscription cannot grant Pro',
     failedNoSub.code===200 && (await licensing.getLicense(free)).plan==='free');
 }finally{
   for(const [name,value] of Object.entries(previous)){
     if(value===undefined)delete process.env[name];
     else process.env[name]=value;
   }
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1)});
