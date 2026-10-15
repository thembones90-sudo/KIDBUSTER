'use strict';
const crypto=require('node:crypto');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-reconciliation-preview.cjs ===');
 const old=process.env.KIDBUSTER_TEST_KV;
 process.env.KIDBUSTER_TEST_KV='1';
 const store=await import('../api/_lib/kv-client.js');
 const svc=await import('../api/_lib/license-service.js');
 const licensing=await import('../api/_lib/licensing.js');
 const ls=await import('../api/_lib/providers/lemonsqueezy.js');
 const reconciliation=await import('../api/_lib/subscription-reconciliation.js');
 const adminLookup=(await import('../api/admin-license-lookup.js')).default;
 try{
  store.__resetForTests();
  const key=await svc.getOrCreateFreeLicense('reconcile@example.test');
  await svc.activateOrRenewPro({licenseKey:key,email:'reconcile@example.test',
    paymentCustomerId:'17',paymentSubscriptionId:'1234'});
  const now=new Date();
  const date=n=>new Date(now.getTime()+n*86400000).toISOString();
  const local={...(await licensing.getLicense(key)),subscriptionStatus:'active',
    subscriptionEventAt:date(-4),subscriptionEndsAt:null};
  await licensing.saveLicense(key,local);

  const good={subscriptionId:'1234',customerId:'17',status:'active',
    updatedAt:date(-2),endsAt:null};
  const same=reconciliation.compareSubscriptionSnapshot(await licensing.getLicense(key),good,now);
  check('matching provider state returns no_change',
    same.action==='no_change' && same.safeToApply===false);
  const expired={...good,status:'expired',updatedAt:date(-1),endsAt:date(-1)};
  const diff=reconciliation.compareSubscriptionSnapshot(await licensing.getLicense(key),expired,now);
  check('missed expiry event detected without automatic mutation',
    diff.action==='apply_provider_state' && diff.safeToApply===true && diff.reason==='provider_state_differs' &&
    diff.providerExpectedPlan==='free' && diff.localPlan==='pro');
  check('reconciliation preview leaves customer Pro until explicitly reviewed',
    (await licensing.getLicense(key)).plan==='pro');

  const mismatchId=reconciliation.compareSubscriptionSnapshot(local,{...expired,subscriptionId:'9999'},now);
  check('snapshot from another subscription is quarantined',
    mismatchId.reason==='subscription_identity_mismatch');
  const mismatchCustomer=reconciliation.compareSubscriptionSnapshot(local,{...expired,customerId:'18'},now);
  check('snapshot from another customer is quarantined',
    mismatchCustomer.reason==='customer_identity_mismatch');
  check('unknown statuses require manual review, cannot trigger automatic Pro changes',
    reconciliation.compareSubscriptionSnapshot(local,{...expired,status:'dangerous_unknown'},now).reason==='unknown_provider_status');
  check('missing timestamp is not treated as authoritative',
    reconciliation.compareSubscriptionSnapshot(local,{...expired,updatedAt:null},now).reason==='missing_provider_updated_at');
  check('older provider snapshot cannot override newer local state',
    reconciliation.compareSubscriptionSnapshot(local,{...expired,updatedAt:date(-6)},now).reason==='stale_provider_snapshot');
  check('cancelled snapshot requires a reliable paid-through date',
    reconciliation.compareSubscriptionSnapshot(local,{...expired,status:'cancelled',endsAt:null},now).reason==='cancelled_missing_ends_at');
  const cancelled={...good,status:'cancelled',updatedAt:date(-1),endsAt:date(5)};
  check('paid-through cancellation preview expects Pro before deadline',
    reconciliation.compareSubscriptionSnapshot(local,cancelled,now).providerExpectedPlan==='pro');
  const pastCancel={...cancelled,endsAt:date(-1)};
  check('past paid-through cancellation preview expects Free',
    reconciliation.compareSubscriptionSnapshot(local,pastCancel,now).providerExpectedPlan==='free');

  let requestedId;
  const preview=await reconciliation.previewSubscriptionReconciliation(key,{
    fetchSnapshot:async id=>{requestedId=id;return expired;},now
  });
  check('read-only reconciliation obtains EXACT stored subscription ID through injected fetcher',
    requestedId==='1234'&&preview.reason==='provider_state_differs');
  check('no stored license mutation after preview',
    (await licensing.getLicense(key)).subscriptionStatus==='active');

  const applied=await reconciliation.applySubscriptionReconciliation(key,{
    fetchSnapshot:async id=>({...expired,subscriptionId:id}),now
  });
  const afterApply=await licensing.getLicense(key);
  check('identity-matched newer provider snapshot repairs a missed expiry',
    applied.action==='applied_provider_state'&&applied.applied===true&&
    afterApply.subscriptionStatus==='expired'&&afterApply.plan==='free');

  await licensing.saveLicense(key,local);
  const rejected=await reconciliation.applySubscriptionReconciliation(key,{
    fetchSnapshot:async()=>({...expired,customerId:'attacker-customer'}),now
  });
  check('automatic reconciliation refuses a customer identity mismatch',
    rejected.safeToApply===false&&rejected.reason==='customer_identity_mismatch'&&
    (await licensing.getLicense(key)).subscriptionStatus==='active');

  const lockKey='paymentLock:'+crypto.createHash('sha256').update(key).digest('hex');
  await store.acquirePaymentLock(lockKey,'competing-webhook',120);
  const busy=await reconciliation.applySubscriptionReconciliation(key,{
    fetchSnapshot:async()=>expired,now
  });
  check('reconciliation never races an in-flight webhook for the same account',
    busy.action==='retry'&&busy.reason==='account_busy'&&
    (await licensing.getLicense(key)).subscriptionStatus==='active');
  await store.releasePaymentLock(lockKey,'competing-webhook');

  // Fetch adapter is a strict provider-domain GET; never a customer URL.
  let attemptedUrl,attemptedHeaders;
  const response=await ls.fetchSubscriptionSnapshot('1234',{
    apiKey:'STAGING-SYNTHETIC-ONLY',
    fetcher:async(url,options)=>{
      attemptedUrl=url;attemptedHeaders=options.headers;
      return {ok:true,json:async()=>({data:{type:'subscriptions',id:'1234',
        attributes:{customer_id:17,order_id:33,status:'past_due',
          updated_at:date(-1),ends_at:null,renews_at:date(2)}}})};
    }
  });
  check('provider lookup only targets official fixed HTTPS subscription endpoint',
    attemptedUrl==='https://api.lemonsqueezy.com/v1/subscriptions/1234' &&
    attemptedHeaders.Authorization==='Bearer STAGING-SYNTHETIC-ONLY');
  check('snapshot adapter strips unrelated provider customer details',
    response.subscriptionId==='1234'&&response.customerId==='17'&&
    response.status==='past_due'&&!('user_email' in response));
  let blockedId=false;
  try{await ls.fetchSubscriptionSnapshot('../orders/1',{apiKey:'STAGING-SYNTHETIC-ONLY',
    fetcher:()=>{throw new Error('Request should never execute')}});}catch{blockedId=true;}
  check('untrusted non-numeric subscription IDs cannot cause arbitrary provider requests',blockedId);
  let mismatch=false;
  try{await ls.fetchSubscriptionSnapshot('1234',{apiKey:'STAGING-SYNTHETIC-ONLY',
    fetcher:async()=>({ok:true,json:async()=>({data:{type:'subscriptions',id:'999',attributes:{}}})})});}
  catch{mismatch=true;}
  check('provider response with wrong subscription ID is rejected',mismatch);
  let noSecret=false;
  try{await ls.fetchSubscriptionSnapshot('1234',{apiKey:'',
    fetcher:()=>{throw new Error('No call expected')}});}catch{noSecret=true;}
  check('reconciliation refuses missing API credentials rather than fetching anonymously',noSecret);

  const freeKey=await svc.getOrCreateFreeLicense('reconcile-free@example.test');
  async function callAdmin(ownerKey){
    const req={method:'POST',headers:{'x-app-key':ownerKey},body:{
      action:'reconcile-subscription',licenseKey:freeKey
    }};
    const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await adminLookup(req,res);return res;
  }
  const oldOwners=process.env.OWNER_LICENSE_KEYS;
  process.env.OWNER_LICENSE_KEYS='reconciliation-owner-test';
  const forbidden=await callAdmin('not-the-owner');
  const ownerResult=await callAdmin('reconciliation-owner-test');
  check('subscription reconciliation action is owner-only',forbidden.code===403);
  check('owner action safely reports a non-subscription without provider access',
    ownerResult.code===200&&ownerResult.body.reconciled===false&&
    ownerResult.body.result.reason==='not_a_subscription'&&!('licenseKey' in ownerResult.body));
  if(oldOwners===undefined)delete process.env.OWNER_LICENSE_KEYS;else process.env.OWNER_LICENSE_KEYS=oldOwners;

 }finally{
  if(old===undefined)delete process.env.KIDBUSTER_TEST_KV;else process.env.KIDBUSTER_TEST_KV=old;
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1)});
