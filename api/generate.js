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
import { HAIKU_MODEL, HAIKU_MAX_TOKENS, estimateHaikuCost } from './_lib/haiku-provider.js';
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
import { buildServerGeneration, GenerationRequestError } from './_lib/server-generation.js';
import {beginGenerationRequest,completeGenerationRequest,releaseGenerationRequest} from './_lib/kv-client.js';
import {acquireGenerateThrottle} from './_lib/generate-throttle.js';

// vercel.json gives this function a 60s platform limit (maxDuration). The
// provider deadline MUST fire earlier, otherwise the platform kills the worker
// before the graceful 504 and the quota/request-marker cleanup can run.
// tests/test-quota-hold-boundary.cjs keeps both numbers consistent.
const DEFAULT_PROVIDER_TIMEOUT_MS=50000;
const MAX_PROVIDER_TIMEOUT_MS=55000;
function providerTimeoutMs(){
  const configured=Number.parseInt(process.env.ANTHROPIC_TIMEOUT_MS||'',10);
  return Number.isInteger(configured)&&configured>=10&&configured<=MAX_PROVIDER_TIMEOUT_MS
    ? configured : DEFAULT_PROVIDER_TIMEOUT_MS;
}
// The protocol quality certification was run against this model. ANTHROPIC_MODEL
// lets you move to a newer one without a code change/redeploy of this file, but
// a malformed value falls back to the certified model instead of failing every
// request. Re-run the 21-case human review after changing it.
const DEFAULT_MODEL='claude-sonnet-4-6';
function providerModel(){
  const configured=String(process.env.ANTHROPIC_MODEL||'').trim();
  return /^claude-[a-z0-9][a-z0-9.-]{2,60}$/.test(configured)?configured:DEFAULT_MODEL;
}
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

// Abuse guard in front of the whole pipeline: per-key rate + concurrency caps.
// Requests without a key or with the wrong method fall straight through to the
// normal 405/401 handling; the guard never changes those responses.
export default async function handler(req, res) {
  const licenseKey = req.method === 'POST' ? req.headers['x-app-key'] : '';
  if (!licenseKey) return runGeneration(req, res);

  let throttle;
  try {
    throttle = await acquireGenerateThrottle(licenseKey);
  } catch (err) {
    // The guard is protection, not entitlement: if its counters are briefly
    // unavailable, entitlement below still decides who may generate.
    console.error('generate.js: throttle unavailable, continuing without it:', err);
    throttle = { allowed: true, release: async () => {} };
  }
  if (!throttle.allowed) {
    if (typeof res.setHeader === 'function') res.setHeader('Retry-After', String(throttle.retryAfterSeconds));
    return res.status(429).json({ error: throttle.message, reason: throttle.reason });
  }
  try {
    return await runGeneration(req, res);
  } finally {
    await throttle.release().catch(err => console.error('generate.js: throttle release failed:', err));
  }
}

async function runGeneration(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let systemPrompt,userMessage,protocol;
  try{
    ({systemPrompt,userMessage,protocol}=buildServerGeneration((req.body||{}).generation));
  }catch(err){
    if(err instanceof GenerationRequestError){
      return res.status(400).json({error:'Invalid generation request: '+err.message});
    }
    // Not the teacher's fault (e.g. the trusted protocol core could not be
    // loaded). No quota is reserved and the provider is never called.
    console.error('generate.js: could not build trusted generation:',err);
    return res.status(500).json({error:'Report generation is temporarily unavailable. Your lesson notes are safe; please try again shortly.',reason:'generation_unavailable'});
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

  let providerResult;
  try {
    providerResult = await fetchProviderJsonWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        // Beida's combined dual-field output (Learning Content up to 2000
        // chars + General/Detailed Performance up to 4000 chars, plus
        // header markers) can reach ~1500 tokens at the platform's own
        // stated maximums — right at the edge of truncation with no
        // margin. Every other protocol's realistic maximum sits well
        // under this; raised here for all of them uniformly since a
        // higher ceiling costs nothing extra (Anthropic bills actual
        // output tokens generated, not the max allowed) and there's no
        // reason to run any protocol this close to a cutoff.
        max_tokens: HAIKU_MAX_TOKENS,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: buildCacheableSystemBlocks(systemPrompt),
        messages: [{ role: 'user', content: userMessage }]
      })
    },providerTimeoutMs());
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
    text = data.content.filter(b => !b?.type || b.type === 'text').map(b => b?.text || '').join('').trim();
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
  if (data?.stop_reason === 'refusal') {
    await releaseGeneration(entitlement.reservation).catch(()=>{});
    await releaseRequest();
    return res.status(502).json({ error: 'The AI provider could not produce this report. Your lesson notes are safe.', reason: 'provider_refusal' });
  }
  if (data?.stop_reason === 'max_tokens' || data?.stop_reason === 'model_context_window_exceeded') {
    await releaseGeneration(entitlement.reservation).catch(err=>console.error('generate.js: truncated response reservation release failed:',err));
    await releaseRequest();
    return res.status(502).json({
      error: 'The report was cut off before completion. Your lesson notes are safe; please try again.',
      reason: 'generation_truncated'
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
  const model = data.model || HAIKU_MODEL;
  return res.status(200).json({ text, usage: data.usage || null, trialStatus, model,
    estimatedCostUsd: estimateHaikuCost(data.usage,model) });
}
