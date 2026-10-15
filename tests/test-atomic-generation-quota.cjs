'use strict';
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-atomic-generation-quota.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const licensing=await import('../api/_lib/licensing.js');
  const generate=(await import('../api/generate.js')).default;
  const {__resetForTests,__simulateOutage}=await import('../api/_lib/kv-client.js');
  const priorFetch=global.fetch;
  const priorKey=process.env.ANTHROPIC_API_KEY;
  const priorTimeout=process.env.ANTHROPIC_TIMEOUT_MS;
  process.env.ANTHROPIC_API_KEY='isolated_test_key';

  function invoke(key,protocol='MA',requestId=''){
    const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'quota-test-browser',...(requestId?{'x-generation-id':requestId}:{})},body:{generation:{
      teacherName:'Layne',studentName:'Test Student',notes:'Practised reading and answered questions.',rating:protocol==='BEIDA'?'excellent':'4',protocol
    }}};
    let statusCode=200,jsonBody=null;
    const res={headers:{},setHeader(name,value){this.headers[name]=value;},status(code){statusCode=code;return res;},json(body){jsonBody=body;return res;}};
    return generate(req,res).then(()=>({statusCode,jsonBody}));
  }

  try{
    console.log('\n1) monthly Free quota is atomic under concurrency');
    __resetForTests();
    const monthlyKey=await svc.getOrCreateFreeLicense('atomic-monthly@example.com');
    let providerCalls=0;
    global.fetch=async()=>{providerCalls++;await new Promise(resolve=>setTimeout(resolve,5));return {
      ok:true,json:async()=>({content:[{text:'A complete report'}],usage:{output_tokens:4}})
    };};
    const monthly=await Promise.all(Array.from({length:64},()=>invoke(monthlyKey,'MA')));
    check('exactly the configured 20 concurrent requests receive reports',monthly.filter(x=>x.statusCode===200).length===licensing.FREE_MONTHLY_LIMIT);
    check('every excess concurrent request is rejected before provider spend',monthly.filter(x=>x.statusCode===402).length===64-licensing.FREE_MONTHLY_LIMIT);
    check('provider is called only for atomically reserved requests',providerCalls===licensing.FREE_MONTHLY_LIMIT);
    check('stored monthly usage never overshoots the limit',(await licensing.getUsageCount(monthlyKey))===licensing.FREE_MONTHLY_LIMIT);

    console.log('\n2) one-time protocol trial is atomic under concurrency');
    __resetForTests();providerCalls=0;
    const trialKey=await svc.getOrCreateFreeLicense('atomic-trial@example.com');
    const trial=await Promise.all(Array.from({length:32},()=>invoke(trialKey,'BEIDA')));
    check('exactly five concurrent trial reports succeed',trial.filter(x=>x.statusCode===200).length===licensing.TRIAL_GENERATIONS_PER_PROTOCOL);
    check('trial provider calls are capped at the allowance',providerCalls===licensing.TRIAL_GENERATIONS_PER_PROTOCOL);
    check('permanent trial counter never overshoots',(await licensing.getTrialUsageCount(trialKey,'BEIDA'))===licensing.TRIAL_GENERATIONS_PER_PROTOCOL);
    check('successful response reports zero remaining at exhaustion',trial.filter(x=>x.statusCode===200).some(x=>x.jsonBody.trialStatus?.remaining===0));

    console.log('\n3) known upstream failures compensate the reservation');
    __resetForTests();
    const retryKey=await svc.getOrCreateFreeLicense('atomic-release@example.com');
    global.fetch=async()=>{throw new Error('synthetic network failure');};
    const failed=await invoke(retryKey,'MA');
    check('network failure is surfaced as 502',failed.statusCode===502);
    check('failed request returns the reserved monthly use',(await licensing.getUsageCount(retryKey))===0);
    global.fetch=async()=>({ok:false,status:529,json:async()=>({error:{message:'overloaded'}})});
    const rejected=await invoke(retryKey,'MA');
    check('provider rejection keeps provider status',rejected.statusCode===529);
    check('provider rejection also returns the reservation',(await licensing.getUsageCount(retryKey))===0);
    global.fetch=async()=>({ok:true,json:async()=>({content:[]})});
    const empty=await invoke(retryKey,'MA');
    check('empty provider result is rejected',empty.statusCode===502);
    check('empty result also returns the reservation',(await licensing.getUsageCount(retryKey))===0);
    global.fetch=async()=>({ok:true,json:async()=>{throw new Error('synthetic invalid JSON');}});
    const invalidJson=await invoke(retryKey,'MA');
    check('invalid success JSON is rejected as an upstream failure',invalidJson.statusCode===502);
    check('invalid success JSON returns the reservation',(await licensing.getUsageCount(retryKey))===0);
    global.fetch=async()=>({ok:true,json:async()=>({content:'not-an-array'})});
    const invalidShape=await invoke(retryKey,'MA');
    check('invalid success schema is rejected as an upstream failure',invalidShape.statusCode===502);
    check('invalid success schema returns the reservation',(await licensing.getUsageCount(retryKey))===0);
    global.fetch=async()=>({ok:true,json:async()=>({content:[{text:'Delivered'}]})});
    const recovered=await invoke(retryKey,'MA');
    check('a later successful retry still works',recovered.statusCode===200);
    check('only the delivered report remains counted',(await licensing.getUsageCount(retryKey))===1);

    console.log('\n4) abandoned durable holds are reclaimed after worker failure');
    __resetForTests();
    const crashKey=await svc.getOrCreateFreeLicense('atomic-crash-recovery@example.com');
    const originalNow=Date.now;
    let now=originalNow();
    Date.now=()=>now;
    try{
      const abandoned=await svc.reserveGeneration(crashKey,'MA','crashed-worker');
      check('limited generation creates a durable reservation token',
        abandoned.allowed===true&&typeof abandoned.reservation?.token==='string'&&
        (await licensing.getUsageCount(crashKey))===1);
      now+=16*60*1000;
      const repaired=await svc.reserveGeneration(crashKey,'MA','replacement-worker');
      check('next reservation refunds the expired hold before reserving again',
        repaired.allowed===true&&repaired.reservation.count===1&&
        (await licensing.getUsageCount(crashKey))===1);
      check('committing the replacement hold succeeds exactly once',
        await svc.commitGeneration(repaired.reservation)===true&&
        await svc.commitGeneration(repaired.reservation)===false);

      const abandonedTrial=await svc.reserveGeneration(crashKey,'BEIDA','crashed-trial-worker');
      now+=16*60*1000;
      const repairedTrial=await svc.reserveGeneration(crashKey,'BEIDA','replacement-trial-worker');
      check('expired one-time trial hold is also reclaimed',
        abandonedTrial.reservation.count===1&&repairedTrial.reservation.count===1&&
        (await licensing.getTrialUsageCount(crashKey,'BEIDA'))===1);
      await svc.releaseGeneration(repairedTrial.reservation);
    }finally{
      Date.now=originalNow;
    }

    console.log('\n5) commit outage fails closed and the hold later self-heals');
    __resetForTests();
    const commitKey=await svc.getOrCreateFreeLicense('atomic-commit-outage@example.com');
    global.fetch=async()=>({ok:true,json:async()=>{
      __simulateOutage(true);
      return {content:[{text:'Generated but not safely committed'}]};
    }});
    const commitFailure=await invoke(commitKey,'MA');
    __simulateOutage(false);
    check('report text is not delivered when quota commit cannot be confirmed',
      commitFailure.statusCode===503&&commitFailure.jsonBody.reason==='finalization_uncertain'&&!commitFailure.jsonBody.text);
    const originalCommitNow=Date.now;
    let commitNow=originalCommitNow();
    Date.now=()=>commitNow+16*60*1000;
    try{
      const healed=await svc.reserveGeneration(commitKey,'MA','after-commit-outage');
      check('uncommitted successful-provider hold is reclaimed after expiry',
        healed.allowed===true&&healed.reservation.count===1);
      await svc.releaseGeneration(healed.reservation);
    }finally{Date.now=originalCommitNow;}

    console.log('\n6) same-request retries cannot duplicate provider work or quota');
    __resetForTests();providerCalls=0;
    const idempotentKey=await svc.getOrCreateFreeLicense('idempotent-generation@example.com');
    global.fetch=async()=>{providerCalls++;await new Promise(resolve=>setTimeout(resolve,20));return {ok:true,json:async()=>({content:[{text:'One delivered report'}]})};};
    const sameId='generation_request_1234567890';
    const duplicates=await Promise.all(Array.from({length:16},()=>invoke(idempotentKey,'MA',sameId)));
    check('one concurrent copy owns the generation request',duplicates.filter(x=>x.statusCode===200).length===1);
    check('all concurrent duplicate copies receive deterministic conflicts',duplicates.filter(x=>x.statusCode===409&&x.jsonBody.reason==='duplicate_in_progress').length===15);
    check('same request causes exactly one provider call and one quota use',providerCalls===1&&(await licensing.getUsageCount(idempotentKey))===1);
    const replay=await invoke(idempotentKey,'MA',sameId);
    check('completed replay cannot call provider or consume quota again',replay.statusCode===409&&replay.jsonBody.reason==='duplicate_completed'&&providerCalls===1&&(await licensing.getUsageCount(idempotentKey))===1);

    const invalidId=await invoke(idempotentKey,'MA','too-short');
    check('malformed request identities are rejected before provider or quota work',invalidId.statusCode===400&&providerCalls===1&&(await licensing.getUsageCount(idempotentKey))===1);

    const retryId='generation_retry_123456789012';
    global.fetch=async()=>{providerCalls++;throw new Error('synthetic retryable failure');};
    const firstRetry=await invoke(idempotentKey,'MA',retryId);
    global.fetch=async()=>{providerCalls++;return {ok:true,json:async()=>({content:[{text:'Recovered safely'}]})};};
    const secondRetry=await invoke(idempotentKey,'MA',retryId);
    check('known failure releases identity so exact same request can retry',firstRetry.statusCode===502&&secondRetry.statusCode===200);
    check('failed then successful same-id retry consumes quota only once',(await licensing.getUsageCount(idempotentKey))===2);

    console.log('\n6b) output-limit truncation is not a completed generation');
    __resetForTests();providerCalls=0;
    const truncatedKey=await svc.getOrCreateFreeLicense('truncated-generation@example.com');
    const truncatedId='generation_truncated_1234567890';
    global.fetch=async()=>{providerCalls++;return {ok:true,json:async()=>({
      content:[{text:'Only the first half of the student report.'}],
      stop_reason:'max_tokens'
    })};};
    const truncated=await invoke(truncatedKey,'MA',truncatedId);
    check('max_tokens stops delivery with retryable truncated reason',
      truncated.statusCode===502&&truncated.jsonBody?.reason==='generation_truncated'&&
      !truncated.jsonBody?.text&&truncated.jsonBody?.error?.includes('lesson notes'));
    check('partial response does not consume free quota',
      (await licensing.getUsageCount(truncatedKey))===0);
    global.fetch=async()=>{providerCalls++;return {ok:true,json:async()=>({
      content:[{text:'Fully completed student report.'}],stop_reason:'end_turn'
    })};};
    const recoveredTruncated=await invoke(truncatedKey,'MA',truncatedId);
    check('same request may retry to valid end_turn and consume quota exactly once',
      recoveredTruncated.statusCode===200&&recoveredTruncated.jsonBody?.text==='Fully completed student report.'&&
      providerCalls===2&&(await licensing.getUsageCount(truncatedKey))===1);

    console.log('\n7) provider timeouts restore quota and ignore late responses');
    __resetForTests();providerCalls=0;process.env.ANTHROPIC_TIMEOUT_MS='20';
    const timeoutKey=await svc.getOrCreateFreeLicense('timeout-generation@example.com');
    const timeoutId='generation_timeout_1234567890';
    global.fetch=async(_url,options)=>new Promise((resolve,reject)=>{
      providerCalls++;
      options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    });
    const timedOut=await invoke(timeoutKey,'MA',timeoutId);
    check('provider deadline returns a deterministic retryable timeout',timedOut.statusCode===504&&timedOut.jsonBody.reason==='generation_timeout');
    check('aborted timeout restores the reserved quota',(await licensing.getUsageCount(timeoutKey))===0);
    global.fetch=async()=>{providerCalls++;return {ok:true,json:async()=>({content:[{text:'Recovered after timeout'}]})};};
    const timeoutRetry=await invoke(timeoutKey,'MA',timeoutId);
    check('the exact timed-out request identity can retry successfully',timeoutRetry.statusCode===200&&(await licensing.getUsageCount(timeoutKey))===1);

    __resetForTests();providerCalls=0;
    const lateKey=await svc.getOrCreateFreeLicense('late-generation@example.com');
    const lateId='generation_late_response_12345';
    global.fetch=async()=>new Promise(resolve=>{
      providerCalls++;
      setTimeout(()=>resolve({ok:true,json:async()=>({content:[{text:'Too late to deliver'}]})}),70);
    });
    const late=await invoke(lateKey,'MA',lateId);
    await new Promise(resolve=>setTimeout(resolve,90));
    check('a provider that ignores abort still times out promptly',late.statusCode===504&&late.jsonBody.reason==='generation_timeout');
    check('late success cannot commit quota after the handler timed out',(await licensing.getUsageCount(lateKey))===0&&providerCalls===1);
    global.fetch=async()=>{providerCalls++;return {ok:true,json:async()=>({content:[{text:'Safe late-response retry'}]})};};
    const lateRetry=await invoke(lateKey,'MA',lateId);
    check('late-response request marker is released for a safe retry',lateRetry.statusCode===200&&(await licensing.getUsageCount(lateKey))===1&&providerCalls===2);

    __resetForTests();providerCalls=0;
    const stalledBodyKey=await svc.getOrCreateFreeLicense('stalled-body@example.com');
    const stalledBodyId='generation_stalled_body_12345';
    global.fetch=async(_url,options)=>{
      providerCalls++;
      return {ok:true,json:()=>new Promise((resolve,reject)=>{
        options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('body aborted'),{name:'AbortError'})),{once:true});
      })};
    };
    const stalledBody=await invoke(stalledBodyKey,'MA',stalledBodyId);
    check('deadline covers stalled provider response-body parsing',stalledBody.statusCode===504&&stalledBody.jsonBody.reason==='generation_timeout');
    check('stalled response body also restores quota and request identity',(await licensing.getUsageCount(stalledBodyKey))===0);
  }finally{
    global.fetch=priorFetch;
    if(priorKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=priorKey;
    if(priorTimeout===undefined)delete process.env.ANTHROPIC_TIMEOUT_MS;else process.env.ANTHROPIC_TIMEOUT_MS=priorTimeout;
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
