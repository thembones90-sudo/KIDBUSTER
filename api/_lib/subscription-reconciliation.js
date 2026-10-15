// Pathfinder V2 provider reconciliation. Preview is always read-only;
// application accepts only a newer, identity-matched provider snapshot and
// feeds it through the same subscription state machine as signed webhooks.
import crypto from 'node:crypto';
import {getLicense,effectiveSubscriptionLicense} from './licensing.js';
import {applySubscriptionEvent} from './subscription-lifecycle.js';
import {acquirePaymentLock,releasePaymentLock} from './kv-client.js';

const EXPECTED_STATUSES=new Set([
  'active','on_trial','paused','past_due','unpaid','cancelled','expired'
]);
function parsed(value){
  if(typeof value!=='string')return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?ms:null;
}
function empty(reason,extra={}){
  return {safeToApply:false,action:'manual_review',reason,...extra};
}
export function compareSubscriptionSnapshot(stored,snapshot,now=new Date()){
  if(!stored || stored.source!=='subscription'||!stored.paymentSubscriptionId){
    return empty('not_a_subscription');
  }
  if(!snapshot || String(snapshot.subscriptionId||'')!==String(stored.paymentSubscriptionId)){
    return empty('subscription_identity_mismatch');
  }
  if(!snapshot.customerId || !stored.paymentCustomerId ||
      String(snapshot.customerId)!==String(stored.paymentCustomerId)){
    return empty('customer_identity_mismatch');
  }
  if(!EXPECTED_STATUSES.has(snapshot.status)){
    return empty('unknown_provider_status');
  }
  const providerStamp=parsed(snapshot.updatedAt);
  if(providerStamp===null)return empty('missing_provider_updated_at');
  const localStamp=parsed(stored.subscriptionEventAt);
  if(localStamp!==null && providerStamp<localStamp){
    return {safeToApply:false,action:'no_change',reason:'stale_provider_snapshot'};
  }
  const providerEndsAt=parsed(snapshot.endsAt);
  if(snapshot.status==='cancelled' && providerEndsAt===null){
    return empty('cancelled_missing_ends_at');
  }

  const providerPlan=snapshot.status==='expired' ||
    (snapshot.status==='cancelled' && providerEndsAt<=now.getTime())
      ? 'free':'pro';
  const effectiveLocal=effectiveSubscriptionLicense(stored,now);
  const sameStatus=stored.subscriptionStatus===snapshot.status;
  const expectedEndsAt=['cancelled','expired'].includes(snapshot.status)
    ? snapshot.endsAt:null;
  const sameEndsAt=(stored.subscriptionEndsAt||null)===(expectedEndsAt||null);
  const samePlan=effectiveLocal.plan===providerPlan;
  const discrepancy=!sameStatus||!sameEndsAt||!samePlan;
  if(!discrepancy){
    return {safeToApply:false,action:'no_change',reason:'matches_provider'};
  }
  return {
    safeToApply:true,
    action:'apply_provider_state',
    reason:'provider_state_differs',
    subscriptionId:String(stored.paymentSubscriptionId),
    localStatus:stored.subscriptionStatus||null,
    providerStatus:snapshot.status,
    localPlan:effectiveLocal.plan,
    providerExpectedPlan:providerPlan,
    providerUpdatedAt:snapshot.updatedAt,
    providerEndsAt:expectedEndsAt
  };
}

// Injected fetchSnapshot allows testing without network. The future owner
// reconciliation worker can call fetchSubscriptionSnapshot from the provider
// and present this decision. No automatic mutations are performed here.
export async function previewSubscriptionReconciliation(licenseKey,{fetchSnapshot,now}={}){
  if(typeof fetchSnapshot!=='function')throw new Error('Explicit provider snapshot fetcher is required');
  const stored=await getLicense(licenseKey);
  if(!stored?.paymentSubscriptionId)return empty('not_a_subscription');
  const snapshot=await fetchSnapshot(String(stored.paymentSubscriptionId));
  return compareSubscriptionSnapshot(stored,snapshot,now||new Date());
}

const EVENT_FOR_STATUS={
  active:'subscription_resumed',
  on_trial:'subscription_on_trial',
  paused:'subscription_paused',
  past_due:'subscription_past_due',
  unpaid:'subscription_unpaid',
  cancelled:'subscription_cancelled',
  expired:'subscription_expired'
};

export async function applySubscriptionReconciliation(licenseKey,{fetchSnapshot,now}={}){
  if(typeof fetchSnapshot!=='function')throw new Error('Explicit provider snapshot fetcher is required');
  const before=await getLicense(licenseKey);
  if(!before?.paymentSubscriptionId)return empty('not_a_subscription');
  const snapshot=await fetchSnapshot(String(before.paymentSubscriptionId));
  const preview=compareSubscriptionSnapshot(before,snapshot,now||new Date());
  if(!preview.safeToApply)return preview;

  const lockKey='paymentLock:'+crypto.createHash('sha256').update(licenseKey).digest('hex');
  const lockToken=crypto.randomBytes(24).toString('hex');
  if(!await acquirePaymentLock(lockKey,lockToken,120)){
    return {safeToApply:false,action:'retry',reason:'account_busy'};
  }
  try{
    const current=await getLicense(licenseKey);
    const rechecked=compareSubscriptionSnapshot(current,snapshot,now||new Date());
    if(!rechecked.safeToApply)return rechecked;
    const result=await applySubscriptionEvent({
      type:EVENT_FOR_STATUS[snapshot.status],
      eventAt:snapshot.updatedAt,
      endsAt:snapshot.endsAt,
      licenseKey,
      email:current.email,
      paymentCustomerId:snapshot.customerId,
      paymentSubscriptionId:snapshot.subscriptionId,
      orderId:snapshot.orderId||current.subscriptionOrderId||null
    });
    return {...rechecked,action:'applied_provider_state',applied:result.applied===true,result};
  }finally{
    await releasePaymentLock(lockKey,lockToken).catch(()=>{});
  }
}
