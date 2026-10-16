// Kidbuster secure backend proxy.
//
// This is the ONLY place the real Anthropic API key ever exists. It lives
// in a Vercel environment variable, never in git, never in the browser.
// The frontend sends structured lesson facts and selections. The backend
// constructs the trusted protocol prompt, attaches the real API key, calls
// Anthropic, and relays the result. Browser callers cannot replace system
// instructions or smuggle a different protocol prompt through this route.
//
// Prompt caching: every protocol's buildXSystemPrompt() (see KidbusterCore
// in index.html) assembles its prompt as
//   <large, static protocol text> + '\n\n────────────────────────────────────────\n\n' + <small, per-request runtime params>
// — the same divider MA/Sugarcoat/OF's own internal sections already use,
// so it can appear multiple times; the LAST occurrence is always the one
// separating the static bulk from the small per-generation tail (rating-
// specific tone, length-tier target, etc). Splitting on that lets the
// large, genuinely-repeated part (thousands of words, identical across
// every generation for the same teacher+protocol) be marked cacheable,
// while the small part that actually changes every request stays outside
// the cache. Blitz doesn't use this divider (its variation — which of 10
// writing models got picked — is threaded through the middle of its text,
// not appended as a tail), so for Blitz the whole prompt is cached as one
// block instead — still a real win whenever the same teacher gets the
// same model again from the shuffle bag.
const SYSTEM_PROMPT_DIVIDER = '\n\n────────────────────────────────────────\n\n';

function buildCacheableSystemBlocks(systemPrompt) {
  const splitIdx = systemPrompt.lastIndexOf(SYSTEM_PROMPT_DIVIDER);
  if (splitIdx === -1) {
    // No divider found (e.g. Blitz) — cache the whole thing as one block.
    return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }
  const staticPart = systemPrompt.slice(0, splitIdx);
  const dynamicTail = systemPrompt.slice(splitIdx); // includes the divider itself
  return [
    { type: 'text', text: staticPart, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicTail }
  ];
}

import crypto from 'node:crypto';
import { reserveGeneration, releaseGeneration, commitGeneration } from './_lib/license-service.js';
import { ALWAYS_FREE_PROTOCOLS, TRIAL_GENERATIONS_PER_PROTOCOL } from './_lib/licensing.js';
import { buildServerGeneration, evaluateGeneratedOutput, buildRepairMessage } from './_lib/server-generation.js';
import {beginGenerationRequest,completeGenerationRequest,releaseGenerationRequest} from './_lib/kv-client.js';

const PROVIDER_URL='https://api.anthropic.com/v1/messages';
// Report model (owner decision 2026-10-16, after the three-model benchmark):
// Claude Haiku 5.5 at effort 'high'. Haiku thinks before writing and the
// thinking counts toward max_tokens, so it needs 8000 (at 3000 it was cut off
// 3/7 times). ANTHROPIC_MODEL=claude-sonnet-4-6 is the rollback: it restores
// the previous request exactly (3000 tokens, no output_config).
const MODEL_REQUESTS={
  'claude-haiku-5-5':{max_tokens:8000,output_config:{effort:'high'}},
  'claude-sonnet-4-6':{max_tokens:3000}
};
const DEFAULT_PROVIDER_MODEL='claude-haiku-5-5';
function providerModel(){
  const configured=String(process.env.ANTHROPIC_MODEL||'').trim();
  return Object.hasOwn(MODEL_REQUESTS,configured)?configured:DEFAULT_PROVIDER_MODEL;
}
function providerRequest(){
  const model=providerModel();
  return {model,...MODEL_REQUESTS[model]};
}
// vercel.json caps this function at 60 s. ALL provider work for one report —
// the generation and at most one compliance repair — shares one deadline that
// ends before that cap, so quota/request cleanup always gets to run.
const DEFAULT_PROVIDER_TIMEOUT_MS=50000;
const DEFAULT_GENERATION_BUDGET_MS=55000;
const DEFAULT_MIN_REPAIR_WINDOW_MS=12000;
function boundedEnvMs(name,fallback,min,max){
  const configured=Number.parseInt(process.env[name]||'',10);
  return Number.isInteger(configured)&&configured>=min&&configured<=max?configured:fallback;
}
function providerTimeoutMs(){return boundedEnvMs('ANTHROPIC_TIMEOUT_MS',DEFAULT_PROVIDER_TIMEOUT_MS,10,DEFAULT_GENERATION_BUDGET_MS);}
function generationBudgetMs(){return boundedEnvMs('GENERATION_BUDGET_MS',DEFAULT_GENERATION_BUDGET_MS,20,DEFAULT_GENERATION_BUDGET_MS);}
function minRepairWindowMs(){return boundedEnvMs('GENERATION_REPAIR_MIN_MS',DEFAULT_MIN_REPAIR_WINDOW_MS,10,30000);}

// Token usage of the generation plus its repair, so the browser cost tracker
// prices every call. Only numeric top-level counters are summed.
function addUsage(a,b){
  if(!b)return a||null;
  if(!a)return {...b};
  const sum={...a};
  for(const [k,v] of Object.entries(b)){
    if(typeof v==='number')sum[k]=(typeof sum[k]==='number'?sum[k]:0)+v;
  }
  return sum;
}
function providerText(data){
  if(!Array.isArray(data?.content))return null;
  return data.content.map(b=>b?.text||'').join('').trim()||null;
}
function wasTruncated(data){
  return data?.stop_reason==='max_tokens'||data?.stop_reason==='model_context_window_exceeded';
}
function wordCount(text){return String(text||'').trim().split(/\s+/).filter(Boolean).length;}
class ProviderTimeoutError extends Error{
  constructor(){super('Anthropic request timed out');this.name='ProviderTimeoutError';}
}
async function fetchProviderJsonWithTimeout(url,options,timeoutMs){
  const controller=new AbortController();
  let timer,timedOut=false;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      timedOut=true;
      controller.abort();
      reject(new ProviderTimeoutError());
    },timeoutMs);
  });
  try{
    const request=(async()=>{
      const response=await fetch(url,{...options,signal:controller.signal});
      let data=null,parseError=null;
      try{data=await response.json();}catch(err){parseError=err;}
      return {response,data,parseError};
    })();
    return await Promise.race([request,timeout]);
  }catch(err){
    if(timedOut)throw new ProviderTimeoutError();
    throw err;
  }finally{clearTimeout(timer);}
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let systemPrompt,userMessage,protocol,form;
  try{
    ({systemPrompt,userMessage,protocol,form}=buildServerGeneration((req.body||{}).generation));
  }catch(err){
    return res.status(400).json({error:'Invalid generation request: '+err.message});
  }

  // --- per-license entitlement gate ---
  // This route never talks to Vercel KV or any payment provider directly
  // — it only ever calls license-service.js (see api/_lib/license-service.js),
  // the middle layer between any payment provider and this app:
  //
  //   Payment Provider  →  License Service  →  Kidbuster
  //
  // Every teacher now has their own personal license key (Free or Pro),
  // issued via api/license-signup.js or upgraded to Pro via a payment
  // provider's checkout — sent in the same x-app-key header the old
  // single shared-team password used to occupy, so this is a swap of
  // what that header MEANS, not a new mechanism.
  const licenseKey = req.headers['x-app-key'];
  if (!licenseKey) {
    return res.status(401).json({ error: 'A license key is required.', reason: 'missing_key' });
  }
  const installationId = req.headers['x-installation-id'] || '';
  const requestId=String(req.headers['x-generation-id']||'').trim();
  if(requestId&&!/^[A-Za-z0-9_-]{16,128}$/.test(requestId))return res.status(400).json({error:'Invalid generation request identifier.'});
  let requestKey=null,requestToken=null,requestHeld=false;
  if(requestId){
    requestKey='generationRequest:'+crypto.createHash('sha256').update(licenseKey+'\n'+requestId).digest('hex');
    requestToken=crypto.randomBytes(24).toString('hex');
    try{
      const begun=await beginGenerationRequest(requestKey,requestToken);
      if(!begun.acquired){
        if(typeof res.setHeader==='function')res.setHeader('Retry-After',begun.state==='running'?'2':'86400');
        return res.status(409).json({error:begun.state==='completed'?'This generation request was already completed.':'This generation request is already in progress.',reason:begun.state==='completed'?'duplicate_completed':'duplicate_in_progress'});
      }
      requestHeld=true;
    }catch(err){
      console.error('generate.js: request identity unavailable:',err);
      return res.status(503).json({error:'Could not start this report safely. Please try again shortly.',reason:'request_identity_unavailable'});
    }
  }
  const releaseRequest=async()=>{
    if(!requestHeld)return;
    try{await releaseGenerationRequest(requestKey,requestToken);}catch(err){console.error('generate.js: request marker release failed:',err);}
    requestHeld=false;
  };

  let entitlement;
  try {
    entitlement = await reserveGeneration(licenseKey, protocol, installationId);
  } catch (err) {
    await releaseRequest();
    console.error('generate.js: error checking entitlement:', err);
    return res.status(500).json({ error: 'Could not verify your license right now. Please try again shortly.' });
  }
  if (!entitlement.allowed) {
    await releaseRequest();
    const status = entitlement.reason === 'invalid_key' ? 401 : 402;
    return res.status(status).json({ error: entitlement.message, reason: entitlement.reason });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await releaseGeneration(entitlement.reservation).catch(()=>{});
    await releaseRequest();
    console.error('ANTHROPIC_API_KEY is not set in the environment');
    return res.status(500).json({ error: 'Server is not configured correctly (missing API key)' });
  }

  const deadline=Date.now()+generationBudgetMs();
  let providerResult;
  try {
    providerResult = await fetchProviderJsonWithTimeout(PROVIDER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        ...providerRequest(),
        // max_tokens comes from MODEL_REQUESTS: Beida's two fields alone can
        // reach ~1500 report tokens, and Haiku's thinking is billed against
        // the same ceiling. A higher ceiling costs nothing by itself
        // (Anthropic bills tokens actually generated).
        system: buildCacheableSystemBlocks(systemPrompt),
        messages: [{ role: 'user', content: userMessage }]
      })
    },Math.max(1,Math.min(providerTimeoutMs(),deadline-Date.now())));
  } catch (networkErr) {
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: reservation release failed:',err));
    await releaseRequest();
    if(networkErr?.name==='ProviderTimeoutError'){
      if(typeof res.setHeader==='function')res.setHeader('Retry-After','2');
      return res.status(504).json({error:'Report generation timed out. Your lesson notes are safe; please try again.',reason:'generation_timeout'});
    }
    return res.status(502).json({ error: 'Network error contacting Anthropic' });
  }

  const {response:anthropicResponse,data,parseError}=providerResult;
  if (!anthropicResponse.ok) {
    const detail = (data && data.error && data.error.message) || '';
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: reservation release failed:',err));
    await releaseRequest();
    return res.status(anthropicResponse.status).json({
      error: detail || ('Anthropic API request failed with status ' + anthropicResponse.status),
      reason:'provider_unavailable'
    });
  }

  let text;
  try {
    if(parseError)throw parseError;
    if(!Array.isArray(data?.content)) throw new Error('Provider response content is not an array');
    text = data.content.map(b => b?.text || '').join('').trim();
  } catch (parseErr) {
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: reservation release failed:',err));
    await releaseRequest();
    console.error('generate.js: malformed Anthropic response:',parseErr);
    return res.status(502).json({ error: 'Anthropic returned a malformed response' });
  }

  if (!text) {
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: reservation release failed:',err));
    await releaseRequest();
    return res.status(502).json({ error: 'Anthropic returned an empty response' });
  }

  // A successful HTTP response can still contain an incomplete report.
  // Never deliver or charge quota for a provider response cut off by output limits.
  if (data?.stop_reason === 'max_tokens' || data?.stop_reason === 'model_context_window_exceeded') {
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: truncated response reservation release failed:',err));
    await releaseRequest();
    return res.status(502).json({
      error: 'The report was cut off before completion. Your lesson notes are safe; please try again.',
      reason: 'generation_truncated'
    });
  }

  // Final-output contract. A report is only delivered once the same trusted
  // validators the browser uses find no blocking structural problem (hard
  // length/field limits, required sections, delimiters, sign-off/identity,
  // placeholders). One bounded repair is allowed, inside the same deadline,
  // reservation and request marker; it never touches quota on its own.
  let usage=data.usage||null;
  let contract;
  try{contract=evaluateGeneratedOutput(protocol,text,form);}
  catch(contractErr){
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: reservation release failed:',err));
    await releaseRequest();
    console.error('generate.js: output contract unavailable:',contractErr);
    return res.status(500).json({error:'Report checks are temporarily unavailable. Nothing was charged and your lesson notes are safe; please try again shortly.',reason:'generation_unavailable'});
  }
  const repair={attempted:false,outcome:'not_needed'};
  if(!contract.compliant||contract.softRepair){
    const repairable=contract.blocking.every(f=>f.repairable);
    const remaining=deadline-Date.now();
    if(!repairable){
      repair.outcome='not_repairable';
    }else if(remaining<minRepairWindowMs()){
      repair.outcome='no_time';
    }else{
      repair.attempted=true;
      let repaired=null;
      try{
        const result=await fetchProviderJsonWithTimeout(PROVIDER_URL,{
          method:'POST',
          headers:{'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
          body:JSON.stringify({
            ...providerRequest(),
            // Same cacheable protocol text as the first call (normally a cache
            // read). The repair sees only the draft, never the transcript, so
            // it can shorten or restructure but has no new facts to add.
            system:buildCacheableSystemBlocks(systemPrompt),
            messages:[{role:'user',content:buildRepairMessage(protocol,text,contract,form)}]
          })
        },remaining);
        if(!result.response.ok||result.parseError){
          repair.outcome='provider_error';
        }else{
          usage=addUsage(usage,result.data?.usage);
          const candidate=providerText(result.data);
          if(!candidate)repair.outcome='provider_error';
          else if(wasTruncated(result.data))repair.outcome='truncated';
          else repaired=candidate;
        }
      }catch(repairErr){
        repair.outcome=repairErr?.name==='ProviderTimeoutError'?'timeout':'provider_error';
      }
      if(repaired!==null){
        let repairedContract=null;
        try{repairedContract=evaluateGeneratedOutput(protocol,repaired,form);}catch(err){console.error('generate.js: output contract failed on repair:',err);}
        if(!repairedContract||!repairedContract.compliant){
          repair.outcome='still_noncompliant';
        }else if(!contract.compliant||wordCount(repaired)<wordCount(text)){
          text=repaired;contract=repairedContract;repair.outcome='repaired';
        }else{
          repair.outcome='not_improved';
        }
      }
    }
  }
  if(!contract.compliant){
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: reservation release failed:',err));
    await releaseRequest();
    if(typeof res.setHeader==='function')res.setHeader('Retry-After','2');
    return res.status(422).json({
      error:'This report did not pass Pathfinder\'s format checks'+(repair.attempted?', even after one automatic correction':'')+'. Nothing was charged and your lesson notes are safe — please generate again.',
      reason:'output_noncompliant',
      checks:contract.blocking.map(f=>f.message),
      repair
    });
  }

  // Commit the durable hold before returning report text. If the datastore
  // cannot confirm the commit, do not deliver the report; the abandoned hold
  // will be refunded after its lease expires on a later reservation attempt.
  try {
    const committed=await commitGeneration(entitlement.reservation);
    if(!committed)throw new Error('Generation reservation no longer exists');
  } catch (commitErr) {
    console.error('generate.js: reservation commit failed:',commitErr);
    return res.status(503).json({ error: 'Could not finalize this report safely. Please try again shortly.',reason:'finalization_uncertain' });
  }
  if(requestHeld){
    try{
      if(await completeGenerationRequest(requestKey,requestToken))requestHeld=false;
      else console.error('generate.js: request marker ownership changed before completion');
    }catch(err){console.error('generate.js: request completion marker failed:',err);}
  }

  // Only count a generation against the license's monthly usage once
  // Anthropic has actually returned real content — a failed or empty
  // response was never a delivered report and shouldn't cost the teacher
  // part of their Free allowance.
  let trialStatus = null;
  try {
    const newCount = entitlement.reservation?.count ?? null;
    // newCount is null for founder/owner keys (nothing was ever
    // incremented) and for Pro users there's no meaningful "remaining"
    // concept either — trialStatus only makes sense for a real,
    // trial-based generation that was actually just counted.
    if(newCount !== null && !ALWAYS_FREE_PROTOCOLS.includes(protocol) && entitlement.license && entitlement.license.plan !== 'pro'){
      trialStatus = {
        protocol,
        used: newCount,
        limit: TRIAL_GENERATIONS_PER_PROTOCOL,
        remaining: Math.max(0, TRIAL_GENERATIONS_PER_PROTOCOL - newCount)
      };
    }
  } catch (err) {
    console.error('generate.js: error formatting usage status:', err);
  }

  // data.usage now includes cache_creation_input_tokens / cache_read_input_tokens
  // whenever caching was actually used — forwarded through as-is so the
  // frontend's cost tracker (see kidbusterStats() in index.html) can price
  // each token type correctly instead of treating everything as a normal
  // input token.
  return res.status(200).json({
    text, usage, trialStatus,
    // Structure passed the protocol contract. Educational accuracy is NOT
    // verified by software: contentReviewed stays false until a teacher reviews.
    outputContract:{compliant:true,contentReviewed:false,advisory:contract.advisory,repair}
  });
}
