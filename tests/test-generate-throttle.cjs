'use strict';
// Slice 5: per-license-key abuse guard on /api/generate.
//  - rate cap and concurrency cap return 429 BEFORE any provider spend
//  - limits are per key (one noisy key never blocks another)
//  - a refused request does not consume quota, and a finished one frees its slot
//  - slots are released on every exit path (success, provider error, timeout)
//  - missing key / wrong method keep their normal 401 / 405 responses
//  - raw license keys never appear in KV key names
const {createChecker}=require('./helpers/assert.cjs');
const {validReportForProviderBody}=require('./helpers/valid-reports.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-generate-throttle.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const licensing=await import('../api/_lib/licensing.js');
  const generate=(await import('../api/generate.js')).default;
  const kvc=await import('../api/_lib/kv-client.js');
  const throttle=await import('../api/_lib/generate-throttle.js');
  const {__resetForTests,__simulateOutage}=kvc;
  const priorFetch=global.fetch;
  const saved={k:process.env.ANTHROPIC_API_KEY,r:process.env.GENERATE_RATE_LIMIT_PER_MINUTE,c:process.env.GENERATE_MAX_CONCURRENT};
  process.env.ANTHROPIC_API_KEY='isolated_test_key';

  function invoke(key,headers={}){
    const req={method:'POST',headers:{...(key?{'x-app-key':key}:{}),'x-installation-id':'throttle-browser',...headers},body:{generation:{
      teacherName:'Layne',studentName:'Test Student',notes:'Practised reading and answered questions.',rating:'4',protocol:'MA'}}};
    let statusCode=200,jsonBody=null;
    const res={headers:{},setHeader(n,v){this.headers[n]=v;},status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    return generate(req,res).then(()=>({statusCode,jsonBody,headers:res.headers}));
  }
  // A contract-compliant report for whatever the server actually asked for.
  const okProvider=(options)=>({ok:true,json:async()=>({content:[{type:'text',text:validReportForProviderBody(options.body)}],usage:{output_tokens:4}})});

  try{
    console.log('\n1) env clamps');
    delete process.env.GENERATE_RATE_LIMIT_PER_MINUTE;delete process.env.GENERATE_MAX_CONCURRENT;
    check('defaults are 10 per minute and 3 in flight',throttle.generateRateLimitPerMinute()===10&&throttle.generateMaxConcurrent()===3);
    process.env.GENERATE_RATE_LIMIT_PER_MINUTE='0';process.env.GENERATE_MAX_CONCURRENT='abc';
    check('invalid values fall back to the safe defaults',throttle.generateRateLimitPerMinute()===10&&throttle.generateMaxConcurrent()===3);
    process.env.GENERATE_RATE_LIMIT_PER_MINUTE='4';process.env.GENERATE_MAX_CONCURRENT='2';
    check('valid overrides are honoured',throttle.generateRateLimitPerMinute()===4&&throttle.generateMaxConcurrent()===2);

    console.log('\n2) rate cap: refused before provider spend and before quota');
    __resetForTests();
    process.env.GENERATE_RATE_LIMIT_PER_MINUTE='4';process.env.GENERATE_MAX_CONCURRENT='10';
    const key=await svc.getOrCreateFreeLicense('throttle-rate@example.com');
    let providerCalls=0;global.fetch=async(_u,o)=>{providerCalls++;return okProvider(o);};
    const results=[];for(let i=0;i<7;i++)results.push(await invoke(key));
    check('first four sequential requests succeed',results.slice(0,4).every(r=>r.statusCode===200));
    check('requests beyond the rate cap get 429 rate_limited',results.slice(4).every(r=>r.statusCode===429&&r.jsonBody.reason==='rate_limited'));
    check('429 carries a Retry-After header',results[4].headers['Retry-After']==='60');
    check('provider is called only for admitted requests',providerCalls===4);
    check('refused requests consume no quota',(await licensing.getUsageCount(key))===4);

    console.log('\n3) limits are per key');
    const other=await svc.getOrCreateFreeLicense('throttle-other@example.com');
    const otherResult=await invoke(other);
    check('a different key is unaffected by the first key being rate limited',otherResult.statusCode===200);

    console.log('\n4) concurrency cap');
    __resetForTests();
    process.env.GENERATE_RATE_LIMIT_PER_MINUTE='100';process.env.GENERATE_MAX_CONCURRENT='2';
    const ckey=await svc.getOrCreateFreeLicense('throttle-conc@example.com');
    providerCalls=0;let release;const gate=new Promise(r=>{release=r;});
    global.fetch=async(_u,o)=>{providerCalls++;await gate;return okProvider(o);};
    const inflight=[invoke(ckey),invoke(ckey)];
    await new Promise(r=>setTimeout(r,30));
    const third=await invoke(ckey);
    check('third simultaneous request is refused with too_many_in_flight',third.statusCode===429&&third.jsonBody.reason==='too_many_in_flight');
    check('the refused request never reached the provider',providerCalls===2);
    release();
    const done=await Promise.all(inflight);
    check('the two admitted requests both complete',done.every(r=>r.statusCode===200));
    global.fetch=async(_u,o)=>okProvider(o);
    const after=await invoke(ckey);
    check('slots are freed once requests finish',after.statusCode===200);
    // Rate 3, one slot: while one report is in flight, 5 refused attempts must not
    // eat the rate allowance, so after it finishes two more still fit.
    __resetForTests();
    process.env.GENERATE_RATE_LIMIT_PER_MINUTE='3';process.env.GENERATE_MAX_CONCURRENT='1';
    const rkey=await svc.getOrCreateFreeLicense('throttle-refund@example.com');
    let release2;const gate2=new Promise(r=>{release2=r;});
    global.fetch=async(_u,o)=>{await gate2;return okProvider(o);};
    const held=invoke(rkey);await new Promise(r=>setTimeout(r,30));
    const refused=[];for(let i=0;i<5;i++)refused.push(await invoke(rkey));
    check('refused attempts while a report is in flight are all too_many_in_flight',refused.every(r=>r.statusCode===429&&r.jsonBody.reason==='too_many_in_flight'));
    release2();await held;global.fetch=async(_u,o)=>okProvider(o);
    const again=[await invoke(rkey),await invoke(rkey)];
    check('a concurrency refusal gives back its rate allowance',again.every(r=>r.statusCode===200));

    console.log('\n5) slots released on failure paths');
    __resetForTests();
    process.env.GENERATE_RATE_LIMIT_PER_MINUTE='100';process.env.GENERATE_MAX_CONCURRENT='1';
    const fkey=await svc.getOrCreateFreeLicense('throttle-fail@example.com');
    global.fetch=async()=>({ok:false,status:529,json:async()=>({error:{message:'overloaded'}})});
    for(let i=0;i<3;i++)await invoke(fkey);
    global.fetch=async(_u,o)=>okProvider(o);
    check('provider errors do not leak concurrency slots',(await invoke(fkey)).statusCode===200);
    global.fetch=async()=>{throw new Error('socket hang up');};
    await invoke(fkey);await invoke(fkey);
    global.fetch=async(_u,o)=>okProvider(o);
    check('network errors do not leak concurrency slots',(await invoke(fkey)).statusCode===200);
    const bad=await invoke(fkey,{'x-generation-id':'bad id!'});
    check('early validation failures also free the slot',bad.statusCode===400&&(await invoke(fkey)).statusCode===200);

    console.log('\n6) normal responses are unchanged');
    const noKey=await invoke('');
    check('missing key still gets 401 missing_key',noKey.statusCode===401&&noKey.jsonBody.reason==='missing_key');
    const getReq={method:'GET',headers:{'x-app-key':fkey},body:{}};
    let st=0;const r2={status(c){st=c;return r2;},json(){return r2;},setHeader(){}};
    await generate(getReq,r2);
    check('GET still gets 405',st===405);

    console.log('\n7) guard failure never blocks entitlement-approved teachers');
    __resetForTests();
    process.env.GENERATE_RATE_LIMIT_PER_MINUTE='100';process.env.GENERATE_MAX_CONCURRENT='3';
    const priorErr=console.error;console.error=()=>{};
    __simulateOutage(true);
    let threw=false;try{await throttle.acquireGenerateThrottle('x');}catch(e){threw=true;}
    __simulateOutage(false);console.error=priorErr;
    check('guard raises on KV failure (generate.js catches it and lets entitlement decide)',threw);

    console.log('\n8) raw license keys never land in KV key names');
    const t=await throttle.acquireGenerateThrottle('LICENSE-SECRET-ABC123');
    const names=[...(await (async()=>{ // inspect in-memory store via a probing get on candidate names
      const crypto=require('crypto');const id=crypto.createHash('sha256').update('LICENSE-SECRET-ABC123').digest('hex').slice(0,32);
      return [['genthrottle:rate:'+id,await kvc.kv.get('genthrottle:rate:'+id)],['genthrottle:slots:'+id,await kvc.kv.get('genthrottle:slots:'+id)],['genthrottle:rate:LICENSE-SECRET-ABC123',await kvc.kv.get('genthrottle:rate:LICENSE-SECRET-ABC123')]];
    })())];
    check('counters live under a hashed name',names[0][1]===1&&names[1][1]===1);
    check('nothing is stored under the raw key',names[2][1]===null);
    await t.release();await t.release();
    check('release is idempotent and returns the slot to zero',(await kvc.kv.get(names[1][0]))===null);
  }finally{
    global.fetch=priorFetch;
    for(const [n,v] of [['ANTHROPIC_API_KEY',saved.k],['GENERATE_RATE_LIMIT_PER_MINUTE',saved.r],['GENERATE_MAX_CONCURRENT',saved.c]]){
      if(v===undefined)delete process.env[n];else process.env[n]=v;
    }
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
