'use strict';
// Two completed checkouts for one account (two tabs, a retry after a slow
// redirect) would leave the older subscription billing while the account
// follows the newer one. Access must not change, but the owner must get a
// review flag so the older subscription can be cancelled or refunded.
const crypto=require('node:crypto');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-duplicate-subscription.cjs ===');
 const saved={secret:process.env.LEMONSQUEEZY_WEBHOOK_SECRET,provider:process.env.PAYMENT_PROVIDER};
 process.env.KIDBUSTER_TEST_KV='1';
 delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
 process.env.LEMONSQUEEZY_WEBHOOK_SECRET='duplicate-subscription-test-secret';
 process.env.PAYMENT_PROVIDER='lemonsqueezy';
 const {__resetForTests}=await import('../api/_lib/kv-client.js');
 const license=await import('../api/_lib/licensing.js');
 const service=await import('../api/_lib/license-service.js');
 const webhook=(await import('../api/payment-webhook.js')).default;
 const date=d=>new Date(Date.now()+d*86400000).toISOString();
 async function send(eventName,key,subscriptionId,when,status='active',endsAt=null){
  const payload={meta:{event_name:eventName,custom_data:{license_key:key}},
   data:{type:'subscriptions',id:subscriptionId,attributes:{customer_id:'cust-1',user_email:'twice@example.test',
    updated_at:when,created_at:when,ends_at:endsAt,status}}};
  const bytes=Buffer.from(JSON.stringify(payload));
  const sig=crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(bytes).digest('hex');
  const req={method:'POST',headers:{'x-signature':sig},on(n,cb){if(n==='data')cb(bytes);if(n==='end')cb();return this}};
  const res={status(c){this.code=c;return this},json(v){this.body=v;return this}};
  await webhook(req,res);return res.code;
 }
 try{
  console.log('\n1) a second checkout while the first subscription is active');
  __resetForTests();
  const key=await service.getOrCreateFreeLicense('twice@example.test');
  await send('subscription_created',key,'sub-one',date(-2));
  check('first purchase activates Pro without a review flag',(await license.getLicense(key)).duplicateSubscriptionReview==null);
  await send('subscription_created',key,'sub-two',date(-1));
  let l=await license.getLicense(key);
  check('the account follows the newest subscription and stays Pro',l.plan==='pro'&&l.paymentSubscriptionId==='sub-two');
  check('the older, still-billing subscription is flagged for owner review',
   l.duplicateSubscriptionReview?.previousSubscriptionId==='sub-one'&&l.duplicateSubscriptionReview?.newSubscriptionId==='sub-two');
  await send('subscription_payment_success',key,'sub-two',date(0));
  check('later events for the same subscription keep the flag',(await license.getLicense(key)).duplicateSubscriptionReview?.previousSubscriptionId==='sub-one');

  console.log('\n2) re-subscribing after the old one ended is not a duplicate');
  __resetForTests();
  const key2=await service.getOrCreateFreeLicense('twice@example.test');
  await send('subscription_created',key2,'sub-old',date(-40));
  await send('subscription_expired',key2,'sub-old',date(-5),'expired',date(-5));
  await send('subscription_created',key2,'sub-new',date(-1));
  l=await license.getLicense(key2);
  check('a fresh subscription after expiry activates Pro',l.plan==='pro'&&l.paymentSubscriptionId==='sub-new');
  check('no review flag when the previous subscription had ended',l.duplicateSubscriptionReview==null);
 }finally{
  if(saved.secret===undefined)delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;else process.env.LEMONSQUEEZY_WEBHOOK_SECRET=saved.secret;
  if(saved.provider===undefined)delete process.env.PAYMENT_PROVIDER;else process.env.PAYMENT_PROVIDER=saved.provider;
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
