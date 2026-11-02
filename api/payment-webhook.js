// V2 signed payment webhooks: bounded input and serialized account lifecycle.
// A Redis SET NX EX lock prevents concurrent deliveries rewriting one account.
// Failed deliveries are NEVER marked handled; provider should retry HTTP 5xx.
import crypto from 'node:crypto';
import { getActiveProvider } from './_lib/providers/index.js';
import {
  applySubscriptionEvent, resolveSubscriptionLicenseKey
} from './_lib/subscription-lifecycle.js';
import {
  hasProcessedWebhook, markWebhookProcessed, isFounderLicenseKey
} from './_lib/licensing.js';
import { acquirePaymentLock, releasePaymentLock } from './_lib/kv-client.js';
import { recordEvent } from './_lib/event-log.js';
import { alertOwner } from './_lib/owner-alerts.js';
import { keyFingerprint, maskEmail } from './_lib/identity-continuity.js';

export const config = { api: { bodyParser: false } };
export const MAX_WEBHOOK_BYTES = 256 * 1024;
const PAYMENT_LOCK_TTL_SECONDS = 120;

function readRawBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    let total=0,finished=false;
    req.on('data',chunk=>{
      if(finished)return;
      total+=chunk.length;
      if(total>MAX_WEBHOOK_BYTES){
        finished=true;
        const err=new Error('Webhook request is too large');
        err.statusCode=413;
        reject(err);
      }else chunks.push(chunk);
    });
    req.on('end',()=>{
      if(!finished){finished=true;resolve(Buffer.concat(chunks,total));}
    });
    req.on('error',err=>{
      if(!finished){finished=true;reject(err);}
    });
    req.on('aborted',()=>{
      if(!finished){finished=true;reject(new Error('Webhook request interrupted'));}
    });
  });
}

async function refuseOwnerTarget(res,event,bodyHash){
  await recordEvent('payment_ignored',{event:String(event.type),reason:'owner_account'});
  await alertOwner({type:'payment_ignored',
    title:'A signed payment event targeted the owner account and was refused',
    details:['Event: '+String(event.type)],dedupeKey:'payignored:owner:'+bodyHash});
  return res.status(200).json({received:true,ignored:true});
}

// Refunds never change access automatically (partial and goodwill refunds
// are normal), so the owner decides. Sent only after the event is committed;
// replays are already stopped by the processed-webhook marker above.
const money=value=>Number.isFinite(value)?(value/100).toFixed(2):'unknown';
async function alertRefund(event,licenseKey){
  await alertOwner({type:'refund',
    title:(event.fullyRefunded===true?'Full':'Partial')+' refund received — Pro access unchanged, your decision',
    details:['Customer: '+(event.email?maskEmail(event.email):'(no email on event)'),
      'Key ref: '+keyFingerprint(licenseKey),
      'Refunded: '+money(event.refundAmount)+' of '+money(event.invoiceTotal)+' (store currency)',
      'Review it in Account → Owner tools (license lookup).'],
    dedupeKey:'refund:'+keyFingerprint(licenseKey)+':'+String(event.invoiceId||event.orderId||'')+':'+String(event.eventAt||'')});
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  let rawBody;
  try{rawBody=await readRawBody(req);}
  catch(err){
    return res.status(err.statusCode===413?413:400).json({
      error:err.statusCode===413?'Webhook request too large':'Invalid webhook request'
    });
  }

  let event;
  try{
    event=await getActiveProvider().verifyAndNormalizeWebhook({
      rawBody,headers:req.headers
    });
  }catch(err){
    console.error('payment-webhook: verification failed:',err.message);
    return res.status(400).json({error:'Invalid webhook request'});
  }

  if(!event.type) return res.status(200).json({received:true,ignored:true});

  const bodyHash=crypto.createHash('sha256').update(rawBody).digest('hex');

  // Signed, but not a purchase of this product in this environment (see the
  // acceptance policy in the provider adapter). Acknowledge with 200 so it is
  // not retried, change NOTHING, and tell the owner: a real buyer may have
  // paid for something that cannot grant Pro, or a webhook is misconfigured.
  if(event.policyRejection){
    const reason=String(event.policyRejection);
    console.warn('payment-webhook: signed event refused by acceptance policy:',reason);
    await recordEvent('payment_ignored',{event:String(event.type),reason});
    await alertOwner({type:'payment_ignored',
      title:'A signed payment event was refused and did not change any account',
      details:['Event: '+String(event.type),'Reason: '+reason,
        'Store: '+String(event.storeId||'unknown'),'Variant: '+String(event.variantId||'n/a'),
        'Test mode: '+(event.testMode?'yes':'no')],
      // A misrouted test/live webhook can be noisy: one alert per reason per
      // day. A refused store/product purchase may be a real buyer's money:
      // alert once per distinct event.
      dedupeKey:'payignored:'+reason+(/_in_(live|test)$/.test(reason)?'':':'+bodyHash)});
    return res.status(200).json({received:true,ignored:true});
  }
  let lockKey=null,lockToken=null,held=false;
  try{
    // Lock the ACCOUNT, not just the raw event hash, because distinct
    // cancellation/resume/renewal events must also have a serial order.
    // Events with a customer index but no custom key resolve identically.
    // The owner key administers the service and must never become a
    // provider-managed subscription (checkout already refuses it). Checked
    // BEFORE resolution (shareable-link custom data naming the owner key,
    // which may have no stored record and would otherwise retry as a 500)
    // and AFTER it (an email/customer index pointing at the owner key).
    if(isFounderLicenseKey(event.licenseKey))return await refuseOwnerTarget(res,event,bodyHash);
    const licenseKey=await resolveSubscriptionLicenseKey(event);
    if(!licenseKey)return res.status(200).json({received:true,ignored:true});
    if(isFounderLicenseKey(licenseKey))return await refuseOwnerTarget(res,event,bodyHash);
    lockKey='paymentLock:'+crypto.createHash('sha256').update(licenseKey).digest('hex');
    lockToken=crypto.randomBytes(24).toString('hex');
    held=await acquirePaymentLock(lockKey,lockToken,PAYMENT_LOCK_TTL_SECONDS);
    if(!held){
      if(typeof res.setHeader==='function')res.setHeader('Retry-After','2');
      return res.status(503).json({
        error:'Payment event for this account is already being processed. Retry.'
      });
    }

    // The duplicate lookup is INSIDE the atomic account lock, never
    // before it. Errors fail closed rather than skipping deduplication.
    if(await hasProcessedWebhook(bodyHash)){
      return res.status(200).json({received:true,duplicate:true});
    }

    // A newer state or another subscription may render the signed event
    // stale; still record it as handled so retries won't repeat work.
    const outcome=await applySubscriptionEvent({...event,licenseKey});
    await markWebhookProcessed(bodyHash);
    await recordEvent('payment',{event:String(event.type)});
    if(outcome?.reason==='refund_requires_review')await alertRefund(event,outcome.licenseKey||licenseKey);
    return res.status(200).json({received:true});
  }catch(err){
    console.error('payment-webhook: event could not be committed:',err.message);
    // A correctly SIGNED payment event failed: the provider retries, but the
    // owner must know (a paying customer may be waiting for Pro).
    await recordEvent('payment_failed',{event:String(event.type)});
    await alertOwner({type:'payment_failed',title:'A payment event could not be processed (provider will retry)',
      details:['Event: '+String(event.type),'Error: '+String(err&&err.message||'unknown').slice(0,200)],dedupeKey:'payfail:'+bodyHash});
    return res.status(500).json({error:'Webhook not committed; retry delivery'});
  }finally{
    if(held){
      try{
        const released=await releasePaymentLock(lockKey,lockToken);
        if(!released)console.error('payment-webhook: lock ownership changed; token-safe release skipped');
      }catch(err){
        // The lock's TTL is the crash/release-failure recovery mechanism.
        console.error('payment-webhook: lock release failed; TTL will recover:',err.message);
      }
    }
  }
}
