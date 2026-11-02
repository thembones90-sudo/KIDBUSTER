'use strict';
// Payment ACCEPTANCE policy (2026-11-02): a valid Lemon Squeezy signature is
// necessary but not sufficient. Test-mode events must never grant production
// Pro, staging must accept only test-mode events, another store's events and
// NEW subscriptions to a non-Pro product must not grant Pro, and the owner key
// can never become a subscription. Refused events are acknowledged (200, no
// retry storm), change nothing, and are audited for the owner.
const crypto=require('node:crypto');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-payment-acceptance-policy.cjs ===');
 const ENV=['KIDBUSTER_TEST_KV','LEMONSQUEEZY_WEBHOOK_SECRET','PAYMENT_PROVIDER','GOOGLE_SHEET_WEBHOOK_URL',
   'LEMONSQUEEZY_MODE','LEMONSQUEEZY_STORE_ID','LEMONSQUEEZY_PRO_VARIANT_ID','LEMONSQUEEZY_ALLOWED_VARIANT_IDS',
   'OWNER_LICENSE_KEYS','FOUNDER_LICENSE_KEYS','OWNER_ALERT_EMAIL'];
 const originalEnv=Object.fromEntries(ENV.map(k=>[k,process.env[k]]));
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.LEMONSQUEEZY_WEBHOOK_SECRET='synthetic-acceptance-policy-secret';
 process.env.PAYMENT_PROVIDER='lemonsqueezy';
 process.env.LEMONSQUEEZY_STORE_ID='429633';
 process.env.LEMONSQUEEZY_PRO_VARIANT_ID='777001';
 for(const k of ['GOOGLE_SHEET_WEBHOOK_URL','LEMONSQUEEZY_MODE','LEMONSQUEEZY_ALLOWED_VARIANT_IDS',
   'FOUNDER_LICENSE_KEYS','OWNER_ALERT_EMAIL'])delete process.env[k];
 const OWNER_KEY='kb_live_synthetic_owner_policy_key';
 process.env.OWNER_LICENSE_KEYS=OWNER_KEY;

 const store=await import('../api/_lib/kv-client.js');
 const lic=await import('../api/_lib/licensing.js');
 const svc=await import('../api/_lib/license-service.js');
 const events=await import('../api/_lib/event-log.js');
 const ls=await import('../api/_lib/providers/lemonsqueezy.js');
 const webhook=(await import('../api/payment-webhook.js')).default;
 const baseTime=Date.now();
 const ts=n=>new Date(baseTime+n*60000).toISOString();
 let seq=0;
 // Matches the documented real shape: meta.test_mode plus store/variant ids.
 const subscription=(key,{event='subscription_created',when=ts(-5),testMode=false,storeId=429633,
   variantId=777001,subId='sub-policy-'+(++seq),status='active',email='policy@example.test',
   customerId='cust-'+subId}={})=>({
   meta:{event_name:event,test_mode:testMode,custom_data:key?{license_key:key}:{}},
   data:{type:'subscriptions',id:subId,attributes:{store_id:storeId,customer_id:customerId,
     order_id:9000+seq,product_id:5551,variant_id:variantId,user_email:email,status,test_mode:testMode,
     created_at:when,updated_at:when,ends_at:null}}
 });
 async function send(data,{signature,raw}={}){
   raw=raw||Buffer.from(JSON.stringify(data));
   const sig=signature!==undefined?signature:
     crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest('hex');
   const req={method:'POST',headers:sig===null?{}:{'x-signature':sig},
     on(name,cb){if(name==='data')cb(raw);if(name==='end')cb();return this}};
   const res={status(code){this.code=code;return this},json(body){this.body=body;return this},setHeader(){}};
   await webhook(req,res);
   return {code:res.code,body:res.body||{}};
 }
 const ignoredEvents=async()=> (await events.readEvents({type:'payment_ignored',days:1,limit:100}));
 try{
   store.__resetForTests();

   console.log('\n1) Live mode (the default) refuses Lemon Squeezy test-mode purchases');
   {
     const key=await svc.getOrCreateFreeLicense('policy@example.test');
     const r=await send(subscription(key,{testMode:true}));
     const after=await lic.getLicense(key);
     check('signed test-mode subscription_created is acknowledged 200 (no retry storm)',
       r.code===200 && r.body.ignored===true);
     check('test-mode purchase does NOT grant production Pro or attach a subscription',
       after.plan==='free' && !after.paymentSubscriptionId);
     const logged=(await ignoredEvents()).find(e=>e.reason==='test_mode_event_in_live');
     check('refusal is recorded in the owner event log with its reason',!!logged);
     const flaggedOnlyInAttributes=subscription(key);flaggedOnlyInAttributes.data.attributes.test_mode=true;
     await send(flaggedOnlyInAttributes);
     check('test_mode flagged only on the object attributes is refused too',
       (await lic.getLicense(key)).plan==='free');
     const live=await send(subscription(key,{testMode:false}));
     check('the same purchase in live mode for the Pro variant grants Pro',
       live.code===200 && !live.body.ignored && (await lic.getLicense(key)).plan==='pro');
   }

   console.log('\n2) An explicit LEMONSQUEEZY_MODE=test (isolated staging) accepts ONLY test-mode events');
   {
     store.__resetForTests();
     process.env.LEMONSQUEEZY_MODE='test';
     const key=await svc.getOrCreateFreeLicense('policy@example.test');
     const liveOnStaging=await send(subscription(key,{testMode:false}));
     check('a live-mode event reaching staging is refused and changes nothing',
       liveOnStaging.code===200 && liveOnStaging.body.ignored===true && (await lic.getLicense(key)).plan==='free');
     const unflagged=subscription(key);delete unflagged.meta.test_mode;delete unflagged.data.attributes.test_mode;
     await send(unflagged);
     check('staging requires the explicit test_mode flag (absence is not test mode)',
       (await lic.getLicense(key)).plan==='free');
     const testOnStaging=await send(subscription(key,{testMode:true}));
     check('a test-mode purchase is accepted on staging',
       testOnStaging.code===200 && !testOnStaging.body.ignored && (await lic.getLicense(key)).plan==='pro');
     process.env.LEMONSQUEEZY_MODE='sandbox';
     const invalid=await send(subscription(key,{testMode:true,subId:'sub-invalid-mode'}));
     check('an unrecognised LEMONSQUEEZY_MODE fails closed (refused, never guessed)',
       invalid.code===400 && (await lic.getLicense(key)).paymentSubscriptionId!=='sub-invalid-mode');
     process.env.LEMONSQUEEZY_MODE=' LIVE ';
     check('mode values are trimmed and case-insensitive',ls.configuredWebhookMode()==='live');
     delete process.env.LEMONSQUEEZY_MODE;
   }

   console.log('\n3) Store and product gates');
   {
     store.__resetForTests();
     const key=await svc.getOrCreateFreeLicense('policy@example.test');
     const missingStorePayload=subscription(key); delete missingStorePayload.data.attributes.store_id;
     const missingStore=await send(missingStorePayload);
     check('a signed NEW subscription missing store_id is acknowledged and rejected',
       missingStore.code===200 && missingStore.body.ignored===true && (await lic.getLicense(key)).plan==='free');
     check('missing store_id is audited with reason missing_store',
       (await ignoredEvents()).some(e=>e.reason==='missing_store'));
     const missingVariantPayload=subscription(key); delete missingVariantPayload.data.attributes.variant_id;
     const missingVariant=await send(missingVariantPayload);
     check('a signed NEW subscription missing variant_id is acknowledged and rejected',
       missingVariant.code===200 && missingVariant.body.ignored===true && (await lic.getLicense(key)).plan==='free');
     check('missing variant_id is audited with reason missing_variant',
       (await ignoredEvents()).some(e=>e.reason==='missing_variant'));
     const foreignStore=await send(subscription(key,{storeId:111}));
     check('a subscription from another store is refused and does not grant Pro',
       foreignStore.code===200 && foreignStore.body.ignored===true && (await lic.getLicense(key)).plan==='free');
     const foreignVariant=await send(subscription(key,{variantId:888002}));
     check('a NEW subscription to a non-Pro variant does not grant Pro',
       foreignVariant.code===200 && foreignVariant.body.ignored===true && (await lic.getLicense(key)).plan==='free');
     check('foreign variant refusal is audited with reason foreign_variant',
       (await ignoredEvents()).some(e=>e.reason==='foreign_variant'));
     process.env.LEMONSQUEEZY_ALLOWED_VARIANT_IDS=' 888002 , 888003 ';
     const legacy=await send(subscription(key,{variantId:888003,subId:'sub-legacy'}));
     check('an explicitly retained legacy variant (LEMONSQUEEZY_ALLOWED_VARIANT_IDS) grants Pro',
       legacy.code===200 && (await lic.getLicense(key)).plan==='pro');
     delete process.env.LEMONSQUEEZY_ALLOWED_VARIANT_IDS;
     // The legacy variant is no longer allowed for NEW purchases, but its own
     // cancellation must still apply: ignoring it would leave permanent Pro.
     const cancel=subscription(key,{event:'subscription_cancelled',variantId:888003,subId:'sub-legacy',
       status:'cancelled',when:ts(-1)});
     cancel.data.attributes.ends_at=ts(60*24);
     const cancelled=await send(cancel);
     check('state events for an existing subscription are not variant-gated (cancellation applies)',
       cancelled.code===200 && !cancelled.body.ignored &&
       (await lic.getLicense(key)).subscriptionStatus==='cancelled');
     const invoice={meta:{event_name:'subscription_payment_success',test_mode:false,custom_data:{license_key:key}},
       data:{type:'subscription-invoices',id:'inv-foreign',attributes:{store_id:111,subscription_id:'sub-legacy',
         customer_id:'cust-x',status:'paid',created_at:ts(0),updated_at:ts(0)}}};
     const foreignInvoice=await send(invoice);
     check('an invoice from another store is refused too',
       foreignInvoice.code===200 && foreignInvoice.body.ignored===true &&
       (await lic.getLicense(key)).subscriptionLastInvoiceId!=='inv-foreign');
     process.env.LEMONSQUEEZY_PRO_VARIANT_ID='';
     check('with no Pro variant configured, a real (variant-bearing) creation is refused',
       ls.acceptancePolicyRejection({mode:'live',testMode:false,storeId:'429633',variantId:'777001',type:'payment_succeeded'})
         ==='variant_policy_unconfigured');
     process.env.LEMONSQUEEZY_PRO_VARIANT_ID='777001';
   }

   console.log('\n4) The owner key can never become a provider-managed subscription');
   {
     store.__resetForTests();
     const r=await send(subscription(OWNER_KEY));
     check('a signed creation carrying the owner key is acknowledged and refused',
       r.code===200 && r.body.ignored===true);
     check('the owner key gains no subscription record from custom data',
       !(await lic.getLicense(OWNER_KEY)));
     // Without custom data, a customer index resolving to the owner key is
     // caught after resolution too.
     await lic.saveLicense(OWNER_KEY,{plan:'pro',status:'active',email:'owner-policy@example.test'});
     await lic.savePaymentCustomerIndex('cust-owner-policy',OWNER_KEY);
     const indexed=await send(subscription(null,{customerId:'cust-owner-policy',email:'owner-policy@example.test'}));
     const ownerRecord=await lic.getLicense(OWNER_KEY);
     check('a customer index pointing at the owner key is refused and changes nothing',
       indexed.code===200 && indexed.body.ignored===true &&
       !ownerRecord.paymentSubscriptionId && ownerRecord.source!=='subscription');
     check('owner-target refusals are audited',
       (await ignoredEvents()).filter(e=>e.reason==='owner_account').length>=2);
   }

   console.log('\n5) Signature header hardening');
   {
     store.__resetForTests();
     const key=await svc.getOrCreateFreeLicense('policy@example.test');
     const data=subscription(key);
     const raw=Buffer.from(JSON.stringify(data));
     const good=crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest('hex');
     check('a duplicated (array) signature header is refused',
       (await send(data,{raw,signature:[good,good]})).code===400);
     check('a non-hex / wrong-length signature is refused',
       (await send(data,{raw,signature:'zz'+good.slice(2)})).code===400 &&
       (await send(data,{raw,signature:good+'00'})).code===400);
     check('nothing was granted by any refused signature',(await lic.getLicense(key)).plan==='free');
     const upper=await send(data,{raw,signature:good.toUpperCase()});
     check('an upper-case hex digest of the correct HMAC is still accepted',
       upper.code===200 && (await lic.getLicense(key)).plan==='pro');
   }
 }finally{
   for(const [name,value] of Object.entries(originalEnv)){
     if(value===undefined)delete process.env[name]; else process.env[name]=value;
   }
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>{console.log(n?n+' CHECK(S) FAILED':'ALL CHECKS PASSED');process.exit(n?1:0)}).catch(e=>{console.error(e);process.exit(1)});
