'use strict';
// Slice 1 regression coverage (2026-10-15 independent review):
//  1) An abandoned hold that sits exactly AT the allowance must be reclaimed
//     once its lease expires, for both the monthly Free quota and a one-time
//     protocol trial. Previously the entitlement check rejected the request
//     (limit_reached / trial_exhausted) before the expired-hold sweep ran.
//  2) A live (unexpired) hold at the limit must still block.
//  3) The provider deadline must always fire before the platform kills the function.
//  4) Server-side failures building a request are 5xx, never a client 400.
//  5) The trusted protocol core file is bundled with the generate function.
const fs=require('fs');
const path=require('path');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-quota-hold-boundary.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const licensing=await import('../api/_lib/licensing.js');
  const generate=(await import('../api/generate.js')).default;
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const originalNow=Date.now;

  async function fillToLimit(key,protocol,limit){
    // limit-1 delivered reports, then one reservation whose worker "crashes".
    for(let i=0;i<limit-1;i++){
      const held=await svc.reserveGeneration(key,protocol,'boundary-browser');
      if(!held.allowed)throw new Error('setup reservation '+i+' unexpectedly refused');
      await svc.commitGeneration(held.reservation);
    }
    const abandoned=await svc.reserveGeneration(key,protocol,'boundary-browser');
    if(!abandoned.allowed)throw new Error('final setup reservation refused');
    return abandoned;
  }

  let now=originalNow();
  try{
    console.log('\n1) expired hold exactly at the monthly limit is reclaimed');
    __resetForTests();
    const monthlyKey=await svc.getOrCreateFreeLicense('boundary-monthly@example.com');
    Date.now=()=>now;
    await fillToLimit(monthlyKey,'MA',licensing.FREE_MONTHLY_LIMIT);
    check('setup leaves the counter exactly at the monthly limit',
      (await licensing.getUsageCount(monthlyKey))===licensing.FREE_MONTHLY_LIMIT);
    const stillHeld=await svc.reserveGeneration(monthlyKey,'MA','boundary-browser');
    check('a LIVE hold at the limit still blocks further generations',
      stillHeld.allowed===false&&stillHeld.reason==='limit_reached');
    now+=16*60*1000;
    const recovered=await svc.reserveGeneration(monthlyKey,'MA','boundary-browser');
    check('after the lease expires the abandoned report is refunded and a retry is allowed',
      recovered.allowed===true&&recovered.reservation?.count===licensing.FREE_MONTHLY_LIMIT);
    await svc.commitGeneration(recovered.reservation);
    const exhausted=await svc.reserveGeneration(monthlyKey,'MA','boundary-browser');
    check('refund never grants more than the configured allowance',
      exhausted.allowed===false&&exhausted.reason==='limit_reached'&&
      (await licensing.getUsageCount(monthlyKey))===licensing.FREE_MONTHLY_LIMIT);

    console.log('\n2) expired hold exactly at the one-time trial limit is reclaimed');
    __resetForTests();now=originalNow();Date.now=()=>now;
    const trialKey=await svc.getOrCreateFreeLicense('boundary-trial@example.com');
    await fillToLimit(trialKey,'BEIDA',licensing.TRIAL_GENERATIONS_PER_PROTOCOL);
    const trialBlocked=await svc.reserveGeneration(trialKey,'BEIDA','boundary-browser');
    check('a LIVE trial hold at the limit still blocks',
      trialBlocked.allowed===false&&trialBlocked.reason==='trial_exhausted');
    now+=16*60*1000;
    const trialRecovered=await svc.reserveGeneration(trialKey,'BEIDA','boundary-browser');
    check('expired trial hold is refunded so the last trial report is not permanently lost',
      trialRecovered.allowed===true);
    await svc.commitGeneration(trialRecovered.reservation);
    const trialExhausted=await svc.reserveGeneration(trialKey,'BEIDA','boundary-browser');
    check('committed trial reports still exhaust the allowance',
      trialExhausted.allowed===false&&trialExhausted.reason==='trial_exhausted');

    console.log('\n3) committed usage is never refunded by the sweep');
    __resetForTests();now=originalNow();Date.now=()=>now;
    const committedKey=await svc.getOrCreateFreeLicense('boundary-committed@example.com');
    for(let i=0;i<licensing.FREE_MONTHLY_LIMIT;i++){
      const held=await svc.reserveGeneration(committedKey,'MA','boundary-browser');
      await svc.commitGeneration(held.reservation);
    }
    now+=60*60*1000;
    const afterHour=await svc.reserveGeneration(committedKey,'MA','boundary-browser');
    check('fully committed allowance stays exhausted long after the lease window',
      afterHour.allowed===false&&afterHour.reason==='limit_reached'&&
      (await licensing.getUsageCount(committedKey))===licensing.FREE_MONTHLY_LIMIT);
  }finally{
    Date.now=originalNow;
  }

  console.log('\n4) provider deadline always fires before the platform limit');
  const vercel=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));
  const maxDurationMs=vercel.functions['api/generate.js'].maxDuration*1000;
  const priorTimeout=process.env.ANTHROPIC_TIMEOUT_MS;
  const generateSource=fs.readFileSync(path.join(__dirname,'..','api','generate.js'),'utf8');
  const defaultMatch=generateSource.match(/DEFAULT_PROVIDER_TIMEOUT_MS\s*=\s*(\d+)/);
  const maxMatch=generateSource.match(/MAX_PROVIDER_TIMEOUT_MS\s*=\s*(\d+)/);
  check('default provider deadline leaves at least 5s of platform margin',
    !!defaultMatch&&Number(defaultMatch[1])<=maxDurationMs-5000);
  check('configurable provider deadline is capped below the platform limit',
    !!maxMatch&&Number(maxMatch[1])<=maxDurationMs-5000);
  if(priorTimeout===undefined)delete process.env.ANTHROPIC_TIMEOUT_MS;else process.env.ANTHROPIC_TIMEOUT_MS=priorTimeout;

  console.log('\n5) server-side build failures are 5xx; teacher input errors stay 4xx');
  function invoke(key,generation){
    const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'boundary-browser'},body:{generation}};
    let statusCode=200,jsonBody=null;
    const res={headers:{},setHeader(n,v){this.headers[n]=v;},status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    return generate(req,res).then(()=>({statusCode,jsonBody}));
  }
  const goodForm={protocol:'MA',teacherName:'Layne',studentName:'Test Student',notes:'Practised reading.',rating:'4'};
  __resetForTests();
  const key=await svc.getOrCreateFreeLicense('boundary-errors@example.com');
  const bad=await invoke(key,{...goodForm,protocol:'EVIL'});
  check('unsupported protocol remains a 400 client error',bad.statusCode===400&&/Invalid generation request/.test(bad.jsonBody.error));
  const missing=await invoke(key,{...goodForm,notes:''});
  check('missing notes remains a 400 client error',missing.statusCode===400);

  // Simulate the trusted protocol core being unavailable on the server.
  const gen=await import('../api/_lib/server-generation.js');
  const priorFetch=global.fetch;
  let providerCalls=0;global.fetch=async()=>{providerCalls++;return {ok:true,json:async()=>({content:[{text:'x'}]})};};
  const priorApiKey=process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY='isolated_test_key';
  try{
    gen.__simulateCoreFailureForTests(true);
    const broken=await invoke(key,goodForm);
    check('unavailable protocol core is reported as a 500, not a client 400',broken.statusCode===500);
    check('core failure never reaches the provider or consumes quota',providerCalls===0&&(await licensing.getUsageCount(key))===0);
  }finally{
    gen.__simulateCoreFailureForTests(false);
    global.fetch=priorFetch;
    if(priorApiKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=priorApiKey;
  }

  console.log('\n6) trusted protocol core file is bundled with the generate function');
  const includeFiles=String(vercel.functions['api/generate.js'].includeFiles||'');
  check('vercel.json includes index.html in the generate function bundle',includeFiles.split(',').map(s=>s.trim()).includes('index.html'));

  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
