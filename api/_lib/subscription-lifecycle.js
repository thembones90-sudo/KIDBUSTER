// V2-only payment lifecycle state machine.
// A signed provider event can change access only for the matching subscription.
// Cancellation retains paid Pro through ends_at; expiry revokes Pro immediately.
// Date ordering prevents delayed provider notifications from rewriting newer state.
import {
  getLicense, getLicenseKeyByPaymentCustomerId, getLicenseKeyByEmail,
  saveLicense, saveEmailIndex, savePaymentCustomerIndex, normalizeEmail,
  clearManualClaim
} from './licensing.js';
import { notifyAccessEvent } from './access-notifications.js';

function dateMs(value){
  if(typeof value !== 'string' || !value.trim()) return null;
  const milliseconds=Date.parse(value);
  return Number.isFinite(milliseconds)?milliseconds:null;
}
function isoDate(value){
  const ms=dateMs(value);
  return ms===null?null:new Date(ms).toISOString();
}
function ignore(reason){return {applied:false,reason};}

// Resolve account identity before taking its processing lock. Both events
// with and without checkout custom_data then serialize on the same key.
export async function resolveSubscriptionLicenseKey(event){
  const email=event.email?normalizeEmail(event.email):null;
  const key=event.licenseKey ||
    (event.paymentCustomerId?await getLicenseKeyByPaymentCustomerId(event.paymentCustomerId):null) ||
    (email?await getLicenseKeyByEmail(email):null);
  if(!key || !await getLicense(key)){
    // A refund on an unrelated order does not belong to any subscription
    // in this application. Acknowledge it without creating a customer.
    if(event.type==='order_refunded')return null;
    throw new Error('Payment webhook does not identify an existing license');
  }
  return key;
}

export async function applySubscriptionEvent(event){
  const {type,paymentSubscriptionId,paymentCustomerId,licenseKey,email}=event;
  const INVOICE_EVENTS=['subscription_renewed','subscription_payment_failed',
    'subscription_payment_recovered','subscription_payment_refunded'];
  if(!['payment_succeeded','subscription_cancelled','subscription_expired',
    'subscription_resumed','subscription_paused','subscription_unpaused',
    'subscription_past_due','subscription_unpaid','subscription_on_trial',
    'order_refunded',...INVOICE_EVENTS].includes(type)) return ignore('unhandled_event');

  const eventAt=isoDate(event.eventAt);
  if(!eventAt) throw new Error('Payment event missing valid provider timestamp');
  // A refund on an ORDER is not a subscription-state transition.
  // Only flag for review when its original order ID and customer ID both
  // match the customer's CURRENT known subscription. Partial refunds are
  // common: neither kind of refund is sufficient to revoke paid access.
  if(type==='order_refunded'){
    if(!event.orderId || !paymentCustomerId) return ignore('unlinked_order_refund');
    const key=await resolveSubscriptionLicenseKey(event);
    const stored=await getLicense(key);
    if(!stored || stored.source!=='subscription' ||
        String(stored.subscriptionOrderId||'')!==String(event.orderId) ||
        String(stored.paymentCustomerId||'')!==String(paymentCustomerId)){
      return ignore('unrelated_order_refund');
    }
    const oldReviewAt=dateMs(stored.subscriptionRefundReview?.eventAt);
    if(oldReviewAt!==null && dateMs(eventAt)<=oldReviewAt)return ignore('older_refund_notice');
    const review={
      kind:'order_refund', eventAt,orderId:String(event.orderId),
      invoiceId:null,refundAmount:event.refundAmount,
      total:event.invoiceTotal,fullyRefunded:event.fullyRefunded===true
    };
    await saveLicense(key,{...stored,subscriptionRefundReview:review});
    return {applied:true,reason:'refund_requires_review',licenseKey:key};
  }

  if(!paymentSubscriptionId || !String(paymentSubscriptionId).trim()){
    throw new Error('Payment event missing subscription identity');
  }
  if(type==='subscription_cancelled' && !isoDate(event.endsAt)){
    // A cancel lacking ends_at cannot safely calculate paid-through access.
    // Ask the provider to retry rather than granting infinite Pro.
    throw new Error('Cancellation missing valid ends_at');
  }

  // Identifiers originate only from a validly signed webhook. Do not create
  // new bearer keys from a webhook that cannot be matched to a real account.
  const normalizedEmail=email?normalizeEmail(email):null;
  const resolvedKey=licenseKey ||
    (paymentCustomerId?await getLicenseKeyByPaymentCustomerId(paymentCustomerId):null) ||
    (normalizedEmail?await getLicenseKeyByEmail(normalizedEmail):null);
  if(!resolvedKey) throw new Error('Paid webhook cannot be linked to an existing account');
  const current=await getLicense(resolvedKey);
  if(!current) throw new Error('Paid webhook targets an unknown license');

  const newSubscriptionId=String(paymentSubscriptionId).trim();
  const oldSubscriptionId=current.paymentSubscriptionId?String(current.paymentSubscriptionId):null;
  const sameSubscription=oldSubscriptionId===newSubscriptionId;
  if(sameSubscription && current.paymentCustomerId && paymentCustomerId &&
      String(current.paymentCustomerId)!==String(paymentCustomerId)){
    throw new Error('Signed event customer ID conflicts with existing subscription ownership');
  }
  const lastStateAt=dateMs(current.subscriptionEventAt);
  const incomingAt=dateMs(eventAt);

  // Old subscription cancellation/expiry/invoice/resume must never affect
  // a newly purchased subscription. Only NEW creation events can switch ids.
  if(!sameSubscription && type!=='payment_succeeded'){
    return ignore('unmatched_subscription');
  }
  if(oldSubscriptionId && !sameSubscription && lastStateAt!==null && incomingAt<=lastStateAt){
    return ignore('older_new_subscription');
  }

  // Subscription state and invoice events are separate time streams:
  // a late invoice must not override a newer provider state snapshot.
  const isStateEvent=!INVOICE_EVENTS.includes(type);
  if(sameSubscription && isStateEvent && lastStateAt!==null){
    if(incomingAt<lastStateAt) return ignore('stale_state');
    if(incomingAt===lastStateAt){
      const rank={on_trial:1,active:1,paused:2,past_due:3,unpaid:4,cancelled:5,expired:6};
      const desired=type==='subscription_expired'?'expired':
        type==='subscription_cancelled'?'cancelled':
        type==='subscription_paused'?'paused':
        type==='subscription_past_due'?'past_due':
        type==='subscription_unpaid'?'unpaid':
        type==='subscription_on_trial'?'on_trial':'active';
      const currentRank=rank[current.subscriptionStatus]||0;
      if((rank[desired]||0)<=currentRank) return ignore('duplicate_or_lower_priority_state');
    }
  }

  // A refund is an audit/review signal, even if the subscription is now
  // expired. It never changes entitlement, subscription status, or
  // invoice renewal ordering.
  if(type==='subscription_payment_refunded'){
    if(!sameSubscription)return ignore('prior_subscription_refund');
    if(!event.invoiceId)return ignore('missing_refund_invoice_identity');
    if(current.status!=='active')return ignore('account_not_active');
    const oldReviewAt=dateMs(current.subscriptionRefundReview?.eventAt);
    if(oldReviewAt!==null && incomingAt<=oldReviewAt)return ignore('older_refund_notice');
    await saveLicense(resolvedKey,{
      ...current,
      subscriptionRefundReview:{
        kind:'subscription_invoice_refund',eventAt,
        invoiceId:String(event.invoiceId),orderId:null,
        refundAmount:event.refundAmount,total:event.invoiceTotal,
        fullyRefunded:event.fullyRefunded===true
      }
    });
    return {applied:true,reason:'refund_requires_review',licenseKey:resolvedKey};
  }

  if(sameSubscription && current.subscriptionStatus==='expired' &&
      type!=='subscription_expired'){
    // Expired subscription cannot resume. A new checkout gets a new id.
    return ignore('already_expired_subscription');
  }
  if(INVOICE_EVENTS.includes(type) && sameSubscription){
    if(current.subscriptionStatus==='cancelled'){
      return ignore('invoice_after_cancel');
    }
    const lastInvoiceAt=dateMs(current.subscriptionInvoiceAt);
    if(lastInvoiceAt!==null && incomingAt<=lastInvoiceAt)return ignore('old_invoice');
    if(current.status!=='active')return ignore('account_not_active');
    // Failed payments do not revoke Pro during provider retry/dunning.
    // Recoveries and successful renewals clear the billing warning, but
    // state snapshots remain authoritative for past_due/paused status.
    const failed=type==='subscription_payment_failed';
    await saveLicense(resolvedKey,{
      ...current,
      subscriptionInvoiceAt:eventAt,
      subscriptionLastInvoiceId:event.invoiceId||current.subscriptionLastInvoiceId||null,
      subscriptionBillingStatus:failed?'payment_failed':'paid',
      subscriptionBillingStatusAt:eventAt
    });
    return {applied:true,reason:null,licenseKey:resolvedKey};
  }

  if(type==='subscription_cancelled' && !sameSubscription)
    return ignore('noncurrent_cancellation');
  if(type==='subscription_expired' && !sameSubscription)
    return ignore('noncurrent_expiry');
  if(type==='subscription_resumed' && !sameSubscription)
    return ignore('noncurrent_resumption');
  if(type==='subscription_unpaused' && !sameSubscription)
    return ignore('noncurrent_unpause');
  if(type==='subscription_paused' && !sameSubscription)
    return ignore('noncurrent_pause');

  // The state machine never revives a deliberately disabled/revoked user.
  if(current.status !== 'active')return ignore('account_not_active');

  const state=type==='subscription_expired'?'expired':
    type==='subscription_cancelled'?'cancelled':
    type==='subscription_paused'?'paused':
    type==='subscription_past_due'?'past_due':
    type==='subscription_unpaid'?'unpaid':
    type==='subscription_on_trial'?'on_trial':'active';
  const endsAt=state==='cancelled' || state==='expired'
    ? (isoDate(event.endsAt)||current.subscriptionEndsAt||eventAt) : null;
  const previousStillBilling=type==='payment_succeeded' && !sameSubscription && !!oldSubscriptionId &&
    ['active','on_trial','past_due','unpaid','paused'].includes(current.subscriptionStatus);
  // Lemon Squeezy explicitly retains access in every status except
  // expired, including paused and unpaid. Refunds require manual review.
  const pro=state!=='expired';
  const oldInvoiceAt=dateMs(current.subscriptionInvoiceAt);
  const billingStatus=state==='past_due'||state==='unpaid'?'payment_failed':
    state==='paused'?'paused':
    state==='expired'?'ended':
    state==='active'||state==='on_trial'
      ? (oldInvoiceAt!==null && incomingAt<oldInvoiceAt
          ? current.subscriptionBillingStatus||'paid' : 'paid')
      : current.subscriptionBillingStatus||'paid';

  const updated={
    ...current,
    email:normalizedEmail||current.email,
    plan:pro?'pro':'free',
    status:current.status,
    source:'subscription',
    manual:false,
    activationPending:false,
    expiresAt:null,
    claimedInstallationId:null,
    claimedAt:null,
    paymentCustomerId:paymentCustomerId||current.paymentCustomerId,
    paymentSubscriptionId:newSubscriptionId,
    subscriptionStatus:state,
    subscriptionEndsAt:endsAt,
    subscriptionEventAt:isStateEvent?eventAt:(sameSubscription?current.subscriptionEventAt||null:null),
    subscriptionInvoiceAt:type==='subscription_renewed'?eventAt:
      (sameSubscription?current.subscriptionInvoiceAt||null:null),
    subscriptionStartedAt:sameSubscription?(current.subscriptionStartedAt||eventAt):eventAt,
    subscriptionOrderId:sameSubscription
      ? (current.subscriptionOrderId||event.orderId||null)
      : (event.orderId||null),
    subscriptionBillingStatus:billingStatus,
    subscriptionBillingStatusAt:isStateEvent?eventAt:(current.subscriptionBillingStatusAt||null),
    subscriptionLastInvoiceId:sameSubscription?(current.subscriptionLastInvoiceId||null):null,
    subscriptionRefundReview:sameSubscription?(current.subscriptionRefundReview||null):null,
    // Two completed checkouts (two tabs, a retry) would leave the older
    // subscription still billing while the account follows the newer one.
    // Access is unchanged; the owner gets a review flag to refund/cancel.
    duplicateSubscriptionReview:previousStillBilling
      ? {previousSubscriptionId:oldSubscriptionId,previousStatus:current.subscriptionStatus,
        newSubscriptionId,detectedAt:eventAt}
      : (sameSubscription?(current.duplicateSubscriptionReview||null):null)
  };

  // To minimize missing downstream webhook lookups, write customer/email
  // indexes before the authoritative license record. A retry can repair
  // a partial write without changing subscription identity.
  if(paymentCustomerId)await savePaymentCustomerIndex(paymentCustomerId,resolvedKey);
  if(normalizedEmail)await saveEmailIndex(normalizedEmail,resolvedKey);
  await saveLicense(resolvedKey,updated);
  await clearManualClaim(resolvedKey);
  if(previousStillBilling){
    console.warn('subscription-lifecycle: second active subscription on one account; previous may still bill');
    await notifyAccessEvent({
      type:'duplicate_subscription',
      title:'Review: a second subscription started while an earlier one was still active. Refund or cancel the older one.',
      email:updated.email,licenseKey:resolvedKey,
      details:['Previous subscription: '+oldSubscriptionId+' ('+current.subscriptionStatus+')','New subscription: '+newSubscriptionId]
    }).catch(()=>{});
  }
  return {applied:true,reason:previousStillBilling?'duplicate_subscription_review':null,licenseKey:resolvedKey,state};
}
