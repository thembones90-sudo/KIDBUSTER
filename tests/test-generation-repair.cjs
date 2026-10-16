'use strict';
// Bounded compliance repair in api/generate.js (2026-10-15 generation quality
// repair). A scripted provider returns fictional fixture reports. Proves:
// valid output costs one call; at most one repair; failed repair is a
// controlled, uncharged, retryable error; quota/request identity/timeouts hold.
const {createChecker}=require('./helpers/assert.cjs');
const {validReport}=require('./helpers/valid-reports.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-generation-repair.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const licensing=await import('../api/_lib/licensing.js');
  const generate=(await import('../api/generate.js')).default;
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const saved={fetch:global.fetch,key:process.env.ANTHROPIC_API_KEY,budget:process.env.GENERATION_BUDGET_MS,
    min:process.env.GENERATION_REPAIR_MIN_MS,timeout:process.env.ANTHROPIC_TIMEOUT_MS};
  process.env.ANTHROPIC_API_KEY='isolated_test_key';
  const NOTES='Fictional lesson: the student practiced ocean words and short sentences with can.';

  let calls=[];
  // script: array of steps, one per provider call: {text, usage, stop, status, delay, hang}
  function scriptProvider(script){
    calls=[];
    global.fetch=async(_url,options)=>{
      const step=script[calls.length]||{status:599};
      calls.push(JSON.parse(options.body));
      if(step.hang)return new Promise(()=>{});
      if(step.delay)await new Promise(r=>setTimeout(r,step.delay));
      if(step.status)return {ok:false,status:step.status,json:async()=>({error:{message:'synthetic provider error'}})};
      return {ok:true,json:async()=>({content:[{type:'text',text:step.text}],usage:step.usage||{input_tokens:100,output_tokens:50},stop_reason:step.stop||'end_turn'})};
    };
  }
  function invoke(key,generation,requestId=''){
    const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'repair-test-browser',...(requestId?{'x-generation-id':requestId}:{})},
      body:{generation:{teacherName:'Layne',studentName:'Test Student',notes:NOTES,lengthFormat:'medium',...generation}}};
    let statusCode=200,jsonBody=null;
    const res={headers:{},setHeader(n,v){this.headers[n]=v;},status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    return generate(req,res).then(()=>({statusCode,jsonBody,headers:res.headers}));
  }
  const fairy={protocol:'FAIRY',rating:'4'};
  const overlongFairy=validReport('FAIRY',{extraVocab:20});
  const goodFairy=validReport('FAIRY');

  try{
    console.log('\n1) valid responses incur no correction call');
    for(const [protocol,generation] of [['MA',{rating:'4'}],['MS',{rating:'4'}],['FAIRY',{rating:'4'}],['BLITZ',{rating:'4'}],
      ['BEIDA',{rating:'excellent'}],['OF',{rating:'Medium',studentGender:'boy'}],['PREPLY',{rating:'',preplyModule:'parent'}]]){
      __resetForTests();
      const key=await svc.createManualProLicense({email:protocol.toLowerCase()+'-valid@example.com'});
      scriptProvider([{text:validReport(protocol)}]);
      const r=await invoke(key.licenseKey||key,{protocol,...generation});
      check(protocol+': valid report delivered with exactly one provider call',r.statusCode===200&&calls.length===1);
      check(protocol+': response reports structural compliance without claiming content review',
        r.jsonBody?.outputContract?.compliant===true&&r.jsonBody.outputContract.contentReviewed===false&&r.jsonBody.outputContract.repair.attempted===false);
    }

    console.log('\n2) an overlong report gets one bounded repair and is charged once');
    __resetForTests();
    const freeKey=await svc.getOrCreateFreeLicense('repair-success@example.com');
    scriptProvider([{text:overlongFairy,usage:{input_tokens:5000,output_tokens:1100,cache_creation_input_tokens:1600}},
      {text:goodFairy,usage:{input_tokens:900,output_tokens:400,cache_read_input_tokens:1600}}]);
    const repaired=await invoke(freeKey,fairy);
    check('repaired report is delivered',repaired.statusCode===200&&repaired.jsonBody.text===goodFairy);
    check('exactly two provider calls (generation + one repair)',calls.length===2);
    check('repair outcome is reported',repaired.jsonBody.outputContract.repair.attempted===true&&repaired.jsonBody.outputContract.repair.outcome==='repaired');
    check('usage sums both calls for cost accounting',repaired.jsonBody.usage.output_tokens===1500&&repaired.jsonBody.usage.input_tokens===5900&&repaired.jsonBody.usage.cache_read_input_tokens===1600);
    check('trial quota is consumed exactly once',(await licensing.getTrialUsageCount(freeKey,'FAIRY'))===1);
    const repairBody=calls[1];
    check('repair reuses the identical cacheable system prompt',JSON.stringify(repairBody.system)===JSON.stringify(calls[0].system));
    check('repair message contains the draft and the failed check',repairBody.messages[0].content.includes('COMPLIANCE REVISION')&&repairBody.messages[0].content.includes('CRITICAL: Report is'));
    check('repair keeps the fixed per-report facts (student name) without the transcript',repairBody.messages[0].content.includes('FIXED FACTS FOR THIS REPORT')&&repairBody.messages[0].content.includes('Student: Test Student'));
    check('repair never re-sends the lesson transcript',!repairBody.messages[0].content.includes(NOTES)&&repairBody.messages.length===1);

    console.log('\n3) a second invalid response is a controlled, uncharged, retryable failure');
    __resetForTests();
    const failKey=await svc.getOrCreateFreeLicense('repair-fail@example.com');
    const failId='repair_fail_request_123456';
    scriptProvider([{text:overlongFairy},{text:overlongFairy},{text:goodFairy}]);
    const failed=await invoke(failKey,fairy,failId);
    check('still-overlong repair returns 422 output_noncompliant',failed.statusCode===422&&failed.jsonBody.reason==='output_noncompliant');
    check('never more than one repair (two provider calls total)',calls.length===2);
    check('failure explains that nothing was charged',failed.jsonBody.error.includes('Nothing was charged')&&failed.jsonBody.repair.outcome==='still_noncompliant');
    check('failure lists the deterministic check that failed',failed.jsonBody.checks.some(c=>c.includes('CRITICAL')));
    check('no overlong text is returned as send-ready',!failed.jsonBody.text);
    check('reservation released: no trial use consumed',(await licensing.getTrialUsageCount(failKey,'FAIRY'))===0);
    check('Retry-After guidance is sent',failed.headers['Retry-After']==='2');
    scriptProvider([{text:goodFairy}]);
    const retried=await invoke(failKey,fairy,failId);
    check('the same request identity can retry (marker released, not duplicate)',retried.statusCode===200);
    check('retry consumes exactly one use',(await licensing.getTrialUsageCount(failKey,'FAIRY'))===1);

    console.log('\n4) a missing mandatory section is repaired or refused');
    __resetForTests();
    const msKey=await svc.getOrCreateFreeLicense('repair-ms@example.com');
    scriptProvider([{text:validReport('MS',{omitSuperpower:true})},{text:validReport('MS')}]);
    const ms=await invoke(msKey,{protocol:'MS',rating:'4'});
    check('Sugarcoat missing Superpower is repaired before delivery',ms.statusCode===200&&ms.jsonBody.text.includes("Today's Superpower")&&calls.length===2);
    scriptProvider([{text:validReport('MS',{omitSuperpower:true})},{text:validReport('MS',{omitSuperpower:true})}]);
    const msFail=await invoke(msKey,{protocol:'MS',rating:'4'});
    check('Sugarcoat still missing Superpower after repair is refused',msFail.statusCode===422&&msFail.jsonBody.checks.some(c=>c.includes('Superpower')));

    console.log('\n5) stylistic overshoot: repair only if it helps, never fail the teacher');
    __resetForTests();
    const pKey=(await svc.createManualProLicense({email:'repair-preply@example.com'})).licenseKey;
    const preplyGen={protocol:'PREPLY',rating:'',preplyModule:'parent'};
    scriptProvider([{text:validReport('PREPLY',{overlong:true})},{text:validReport('PREPLY')}]);
    const shorter=await invoke(pKey,preplyGen);
    check('far-over-target Preply is shortened by the single repair',shorter.statusCode===200&&shorter.jsonBody.text===validReport('PREPLY')&&shorter.jsonBody.outputContract.repair.outcome==='repaired');
    scriptProvider([{text:validReport('PREPLY',{overlong:true})},{status:529}]);
    const providerDown=await invoke(pKey,preplyGen);
    check('if the shortening call fails, the compliant original is still delivered',providerDown.statusCode===200&&providerDown.jsonBody.text===validReport('PREPLY',{overlong:true})&&providerDown.jsonBody.outputContract.repair.outcome==='provider_error');
    check('...with the length advisory kept for the teacher',providerDown.jsonBody.outputContract.advisory.some(a=>a.includes('150-word target')));
    scriptProvider([{text:validReport('PREPLY',{overlong:true})},{text:validReport('PREPLY',{overlong:true})+' Extra.'}]);
    const notBetter=await invoke(pKey,preplyGen);
    check('a repair that is not shorter is discarded',notBetter.statusCode===200&&notBetter.jsonBody.text===validReport('PREPLY',{overlong:true})&&notBetter.jsonBody.outputContract.repair.outcome==='not_improved');

    console.log('\n6) repair failures on a blocking report release everything');
    __resetForTests();
    const eKey=await svc.getOrCreateFreeLicense('repair-provider-error@example.com');
    scriptProvider([{text:overlongFairy},{status:529}]);
    const pe=await invoke(eKey,fairy);
    check('provider error during repair -> 422, not charged',pe.statusCode===422&&pe.jsonBody.repair.outcome==='provider_error'&&(await licensing.getTrialUsageCount(eKey,'FAIRY'))===0);
    scriptProvider([{text:overlongFairy},{text:goodFairy.slice(0,200),stop:'max_tokens'}]);
    const tr=await invoke(eKey,fairy);
    check('truncated repair is never delivered',tr.statusCode===422&&tr.jsonBody.repair.outcome==='truncated'&&(await licensing.getTrialUsageCount(eKey,'FAIRY'))===0);

    console.log('\n7) one shared deadline bounds all provider work');
    __resetForTests();
    const tKey=await svc.getOrCreateFreeLicense('repair-timeout@example.com');
    process.env.GENERATION_BUDGET_MS='400';process.env.GENERATION_REPAIR_MIN_MS='50';
    scriptProvider([{text:overlongFairy},{hang:true}]);
    const started=Date.now();
    const to=await invoke(tKey,fairy);
    const elapsed=Date.now()-started;
    check('hanging repair times out inside the generation budget',to.statusCode===422&&to.jsonBody.repair.outcome==='timeout'&&elapsed<1000);
    check('timed-out repair consumes no quota',(await licensing.getTrialUsageCount(tKey,'FAIRY'))===0);
    process.env.GENERATION_BUDGET_MS='120';process.env.GENERATION_REPAIR_MIN_MS='100';
    scriptProvider([{text:overlongFairy,delay:60},{text:goodFairy}]);
    const noTime=await invoke(tKey,fairy);
    check('no repair is started without enough time left (single provider call)',noTime.statusCode===422&&noTime.jsonBody.repair.outcome==='no_time'&&calls.length===1);
    delete process.env.GENERATION_BUDGET_MS;delete process.env.GENERATION_REPAIR_MIN_MS;

    console.log('\n8) duplicate-request protection holds across the repair');
    __resetForTests();
    const dKey=await svc.getOrCreateFreeLicense('repair-duplicate@example.com');
    const dId='repair_duplicate_request_1234';
    scriptProvider([{text:overlongFairy},{text:goodFairy,delay:60}]);
    const first=invoke(dKey,fairy,dId);
    await new Promise(r=>setTimeout(r,20));
    const concurrent=await invoke(dKey,fairy,dId);
    check('a duplicate of a request that is mid-repair is rejected as in progress',concurrent.statusCode===409&&concurrent.jsonBody.reason==='duplicate_in_progress');
    const done=await first;
    check('the original repaired request completes once',done.statusCode===200&&(await licensing.getTrialUsageCount(dKey,'FAIRY'))===1);
    const replay=await invoke(dKey,fairy,dId);
    check('a replay after completion is a completed duplicate, never a new paid call',replay.statusCode===409&&replay.jsonBody.reason==='duplicate_completed'&&calls.length===2);

    console.log('\n9) entitlement is still checked before any provider spend');
    __resetForTests();
    const exKey=await svc.getOrCreateFreeLicense('repair-entitlement@example.com');
    for(let i=0;i<licensing.TRIAL_GENERATIONS_PER_PROTOCOL;i++){scriptProvider([{text:goodFairy}]);await invoke(exKey,fairy);}
    scriptProvider([{text:overlongFairy},{text:goodFairy}]);
    const blocked=await invoke(exKey,fairy);
    check('exhausted trial is refused with no provider or repair call',blocked.statusCode===402&&calls.length===0);
  }finally{
    global.fetch=saved.fetch;
    for(const [env,val] of [['ANTHROPIC_API_KEY',saved.key],['GENERATION_BUDGET_MS',saved.budget],['GENERATION_REPAIR_MIN_MS',saved.min],['ANTHROPIC_TIMEOUT_MS',saved.timeout]]){
      if(val===undefined)delete process.env[env];else process.env[env]=val;
    }
  }
  return getFailures();
};

if(require.main===module){
  process.env.KIDBUSTER_TEST_KV='1';
  module.exports().then(f=>process.exit(f?1:0));
}
