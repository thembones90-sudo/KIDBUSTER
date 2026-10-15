// V2 signed payment webhooks: bounded input and serialized account lifecycle.
// A Redis SET NX EX lock prevents concurrent deliveries rewriting one account.
// Failed deliveries are NEVER marked handled; provider should retry HTTP 5xx.
import crypto from 'node:crypto';
import { getActiveProvider } from './_lib/providers/index.js';
import {
  applySubscriptionEvent, resolveSubscriptionLicenseKey
} from './_lib/subscription-lifecycle.js';
import { hasProcessedWebhook, markWebhookProcessed } from './_lib/licensing.js';
import { acquirePaymentLock, releasePaymentLock } from './_lib/kv-client.js';

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
  let lockKey=null,lockToken=null,held=false;
  try{
    // Lock the ACCOUNT, not just the raw event hash, because distinct
    // cancellation/resume/renewal events must also have a serial order.
    // Events with a customer index but no custom key resolve identically.
    const licenseKey=await resolveSubscriptionLicenseKey(event);
    if(!licenseKey)return res.status(200).json({received:true,ignored:true});
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
    await applySubscriptionEvent({...event,licenseKey});
    await markWebhookProcessed(bodyHash);
    return res.status(200).json({received:true});
  }catch(err){
    console.error('payment-webhook: event could not be committed:',err.message);
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
