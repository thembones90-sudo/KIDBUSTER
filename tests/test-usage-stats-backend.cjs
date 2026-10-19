'use strict';
// Owner-only aggregate usage statistics (server side): durable atomic counters,
// idempotent report counting for every plan, estimated-spend accounting with
// unknown (never zero) cost, telemetry fault isolation, owner-only read route,
// and a no-PII storage audit. (The browser-side tracker is test-usage-stats.cjs.)
const {createChecker}=require('./helpers/assert.cjs');
const {validReport,validReportForProviderBody}=require('./helpers/valid-reports.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-usage-stats-backend.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const stats=await import('../api/_lib/usage-stats.js');
  const generate=(await import('../api/generate.js')).default;
  const admin=(await import('../api/admin-license-lookup.js')).default;
  const kvc=await import('../api/_lib/kv-client.js');
  const {__resetForTests,__simulateOutage,__dumpForTests,__simulateUsageStatsFault}=kvc;
  const saved={fetch:global.fetch,key:process.env.ANTHROPIC_API_KEY,owner:process.env.OWNER_LICENSE_KEYS,
    rate:process.env.GENERATE_RATE_LIMIT_PER_MINUTE,conc:process.env.GENERATE_MAX_CONCURRENT,err:console.error,
    timeout:process.env.ANTHROPIC_TIMEOUT_MS,model:process.env.ANTHROPIC_MODEL};
  process.env.ANTHROPIC_API_KEY='isolated_test_key';
  process.env.OWNER_LICENSE_KEYS='owner-stats-test-key-0001';
  process.env.GENERATE_RATE_LIMIT_PER_MINUTE='1000';process.env.GENERATE_MAX_CONCURRENT='200';
  delete process.env.ANTHROPIC_MODEL;
  const OWNER='owner-stats-test-key-0001';
  const NOTES='Fictional lesson: the student practiced ocean words.';
  const STUDENT='Test Student';
  const quiet=()=>{console.error=()=>{};};const loud=()=>{console.error=saved.err;};

  const GEN={MA:{rating:'4'},MS:{rating:'4'},FAIRY:{rating:'4'},BLITZ:{rating:'4'},BEIDA:{rating:'excellent'},
    OF:{rating:'Medium',studentGender:'boy'},PREPLY:{rating:'',preplyModule:'parent'}};
  function invoke(key,protocol='MA',requestId=''){
    const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'stats-browser',...(requestId?{'x-generation-id':requestId}:{})},
      body:{generation:{teacherName:'Layne',studentName:STUDENT,notes:NOTES,lengthFormat:'medium',protocol,...GEN[protocol]}}};
    let statusCode=200,jsonBody=null;
    const res={headers:{},setHeader(n,v){this.headers[n]=v;},status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    return generate(req,res).then(()=>({statusCode,jsonBody}));
  }
  function ok(options,usage={input_tokens:100,output_tokens:50},extra={}){
    return {ok:true,json:async()=>({content:[{type:'text',text:validReportForProviderBody(options.body)}],usage,stop_reason:'end_turn',model:'claude-haiku-5-5',...extra})};
  }
  function ownerRead(method='GET',key=OWNER,query={action:'usage-stats'},body={}){
    const req={method,headers:key?{'x-app-key':key}:{},query,body};
    let statusCode=200,jsonBody=null;
    const res={headers:{},setHeader(n,v){this.headers[n]=v;},status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    return admin(req,res).then(()=>({statusCode,jsonBody,headers:res.headers}));
  }
  const snap=()=>stats.getUsageStatsSnapshot();

  try{
    console.log('\n1) cost: exact integer nano-USD, unknown is never zero');
    check('plain usage is exact (100 in, 50 out = 35000 nano)',stats.costNanoUsd({input_tokens:100,output_tokens:50},'claude-haiku-5-5')===35000);
    check('cache write/read priced separately and exactly',stats.costNanoUsd({input_tokens:900,output_tokens:400,cache_read_input_tokens:1600},'claude-haiku-5-5')===306000);
    check('long-context tier applies per call',stats.costNanoUsd({input_tokens:100001,output_tokens:10},'claude-haiku-5-5')===100001*500+10*2500);
    check('dated Haiku snapshot id is still priced',stats.costNanoUsd({input_tokens:10,output_tokens:10},'claude-haiku-5-5-20261001')===10*100+10*500);
    check('rollback/unpriced model is unknown, not zero',stats.costNanoUsd({input_tokens:10,output_tokens:10},'claude-sonnet-4-6')===null);
    check('missing usage is unknown',stats.costNanoUsd(null,'claude-haiku-5-5')===null&&stats.costNanoUsd({},'claude-haiku-5-5')===null);
    check('garbage token counts are unknown',stats.costNanoUsd({input_tokens:'7',output_tokens:5},'claude-haiku-5-5')===null&&stats.costNanoUsd({input_tokens:-1,output_tokens:5},'claude-haiku-5-5')===null);
    check('nano formatting has no float drift',stats.nanoToUsdString(1)==='0.000000001'&&stats.nanoToUsdString(1234567890123)==='1234.567890123');

    console.log('\n2) one counted report per plan, every protocol');
    __resetForTests();
    global.fetch=async(_u,options)=>ok(options);
    let freeKey=await svc.getOrCreateFreeLicense('stats-free@example.com');
    let proRaw=await svc.createManualProLicense({email:'stats-pro@example.com'});
    let proKey=proRaw.licenseKey||proRaw;
    check('free plan report succeeds',(await invoke(freeKey,'MA')).statusCode===200);
    check('manual Pro report succeeds',(await invoke(proKey,'MS')).statusCode===200);
    check('founder/owner report succeeds',(await invoke(OWNER,'FAIRY')).statusCode===200);
    let s=await snap();
    check('all three plans counted exactly once each',s.lifetime.reports===3&&s.currentMonth.reports===3&&s.today.reports===3);
    check('per-protocol counts match',s.lifetime.byProtocol.MA.reports===1&&s.lifetime.byProtocol.MS.reports===1&&s.lifetime.byProtocol.FAIRY.reports===1&&s.lifetime.byProtocol.BLITZ.reports===0);
    for(const p of ['BLITZ','BEIDA','OF','PREPLY'])check(p+' report succeeds',(await invoke(proKey,p)).statusCode===200);
    s=await snap();
    check('all seven protocols counted',stats.USAGE_STATS_PROTOCOLS.every(p=>s.lifetime.byProtocol[p].reports===1)&&s.lifetime.reports===7);
    check('delivered spend equals 7 x 35000 nano with no unknown calls',s.lifetime.deliveredSpend.knownNanoUsd===245000&&s.lifetime.deliveredSpend.complete===true&&s.lifetime.deliveredSpend.partialReports===0);
    check('all-calls spend equals delivered spend when nothing failed',s.lifetime.allModelCalls.knownNanoUsd===245000&&s.lifetime.allModelCalls.calls===7);
    check('per-protocol spending reconciles with all API spend',stats.USAGE_STATS_PROTOCOLS.reduce((sum,p)=>sum+s.lifetime.byProtocol[p].apiSpend.knownNanoUsd,0)===s.lifetime.allModelCalls.knownNanoUsd);
    check('average cost per report is exact',s.lifetime.deliveredSpend.avgKnownNanoUsdPerReport===35000);

    console.log('\n3) duplicates: 409 and replay never double count');
    __resetForTests();
    const dupKey=await svc.getOrCreateFreeLicense('stats-dup@example.com');
    const id='stable_generation_id_0001';
    check('first request with id is delivered',(await invoke(dupKey,'MA',id)).statusCode===200);
    const again=await invoke(dupKey,'MA',id);
    check('same id again is rejected 409 duplicate_completed',again.statusCode===409&&again.jsonBody.reason==='duplicate_completed');
    s=await snap();
    check('409 did not change report count or add model calls',s.lifetime.reports===1&&s.lifetime.allModelCalls.calls===1);
    // Direct idempotency: replay the exact same stats update (worker retry after crash).
    const plan=stats.buildUsageStatsPlan({licenseKey:'k-replay',generationId:'g-replay-0000000001',runToken:'run-a',protocol:'OF',delivered:true,attempts:[{kind:'generation',nano:1000}]});
    const first=await kvc.applyUsageStatsPlan(plan),second=await kvc.applyUsageStatsPlan(plan);
    check('replaying one update is a no-op (code 2 then 0)',first===2&&second===0);
    // Same generation id delivered by two different runs (e.g. marker lost): report once, spend both.
    const other=stats.buildUsageStatsPlan({licenseKey:'k-replay',generationId:'g-replay-0000000001',runToken:'run-b',protocol:'OF',delivered:true,attempts:[{kind:'generation',nano:2000}]});
    check('second run for the same generation id reports duplicate report (code 3)',await kvc.applyUsageStatsPlan(other)===3);
    s=await snap();
    check('report counted once but both runs spend is in all-calls',s.lifetime.byProtocol.OF.reports===1&&s.lifetime.duplicateDeliveriesIgnored===1&&s.lifetime.allModelCalls.knownNanoUsd===35000+3000);
    check('duplicate delivery spend is NOT added to delivered spend',s.lifetime.deliveredSpend.knownNanoUsd===35000+1000);

    console.log('\n4) concurrency: atomic across all buckets');
    __resetForTests();
    const same=stats.buildUsageStatsPlan({licenseKey:'k-conc',generationId:'g-conc-00000000001',runToken:'run-c',protocol:'MA',delivered:true,attempts:[{kind:'generation',nano:500}]});
    const codes=await Promise.all(Array.from({length:50},()=>kvc.applyUsageStatsPlan(same)));
    check('50 concurrent replays apply exactly once',codes.filter(c=>c===2).length===1&&codes.filter(c=>c===0).length===49);
    const many=await Promise.all(Array.from({length:60},(_,i)=>kvc.applyUsageStatsPlan(stats.buildUsageStatsPlan({
      licenseKey:'k-conc',generationId:'g-conc-'+String(i).padStart(12,'0'),runToken:'run-m'+i,protocol:i%2?'MS':'MA',delivered:true,attempts:[{kind:'generation',nano:100},{kind:'repair',nano:null}]}))));
    s=await snap();
    check('60 distinct concurrent reports are all counted (61 total)',s.lifetime.reports===61&&s.currentMonth.reports===61&&s.today.reports===61);
    check('known and unknown spend sum exactly',s.lifetime.deliveredSpend.knownNanoUsd===500+60*100&&s.lifetime.deliveredSpend.unknownCalls===60&&s.lifetime.deliveredSpend.partialReports===60);
    check('repair calls are tracked',s.lifetime.deliveredSpend.repairCalls===60&&s.lifetime.deliveredSpend.repairedReports===60);
    const concHttp=await Promise.all(Array.from({length:12},()=>invoke(freeKey,'MA')));
    s=await snap();
    check('concurrent HTTP reports: count equals the delivered responses',s.lifetime.reports===61+concHttp.filter(r=>r.statusCode===200).length);

    console.log('\n5) repair and failed attempts');
    __resetForTests();
    let repKey=await svc.getOrCreateFreeLicense('stats-repair@example.com');
    const overlong=validReport('FAIRY',{extraVocab:20}),good=validReport('FAIRY');
    function script(steps){let n=0;global.fetch=async()=>{const st=steps[n++]||{status:599};
      if(st.throw)throw new Error('synthetic network failure');
      if(st.timeout)throw Object.assign(new Error('t'),{name:'ProviderTimeoutError'});
      if(st.status)return {ok:false,status:st.status,json:async()=>({error:{message:'x'}})};
      return {ok:true,json:async()=>({content:[{type:'text',text:st.text}],usage:st.usage,stop_reason:st.stop||'end_turn',model:'claude-haiku-5-5'})};};}
    script([{text:overlong,usage:{input_tokens:5000,output_tokens:1100,cache_creation_input_tokens:1600}},{text:good,usage:{input_tokens:900,output_tokens:400,cache_read_input_tokens:1600}}]);
    check('repaired report delivered',(await invoke(repKey,'FAIRY')).statusCode===200);
    s=await snap();
    check('repaired report counted once with both calls priced (1,556,000 nano)',s.lifetime.reports===1&&s.lifetime.deliveredSpend.knownNanoUsd===1556000&&s.lifetime.deliveredSpend.calls===2&&s.lifetime.deliveredSpend.repairedReports===1);
    __resetForTests();repKey=await svc.getOrCreateFreeLicense('stats-repair@example.com');
    script([{text:overlong,usage:{input_tokens:5000,output_tokens:1100}},{text:good,usage:undefined,stop:'end_turn'}]);
    await invoke(repKey,'FAIRY');
    s=await snap();
    check('repair call without usage is unknown, report flagged partial (lower bound)',s.lifetime.reports===1&&s.lifetime.deliveredSpend.unknownCalls===1&&s.lifetime.deliveredSpend.partialReports===1&&s.lifetime.deliveredSpend.complete===false&&s.lifetime.deliveredSpend.knownNanoUsd===5000*100+1100*500);
    __resetForTests();repKey=await svc.getOrCreateFreeLicense('stats-repair@example.com');
    script([{text:overlong,usage:{input_tokens:5000,output_tokens:1100}},{timeout:true}]);
    const rt=await invoke(repKey,'FAIRY');
    s=await snap();
    check('repair timeout leaves undeliverable noncompliant report: no counted report',rt.statusCode===422&&s.lifetime.reports===0);
    check('timed-out repair is an unknown call, first call is known spend',s.lifetime.allModelCalls.calls===2&&s.lifetime.allModelCalls.unknownCalls===1&&s.lifetime.allModelCalls.knownNanoUsd===5000*100+1100*500&&s.lifetime.allModelCalls.undeliveredRuns===1);
    check('failed run adds nothing to delivered spend',s.lifetime.deliveredSpend.calls===0&&s.lifetime.deliveredSpend.knownNanoUsd===0);
    __resetForTests();repKey=await svc.getOrCreateFreeLicense('stats-repair@example.com');
    script([{text:overlong,usage:{input_tokens:10,output_tokens:10}},{text:overlong,usage:{input_tokens:20,output_tokens:20}}]);
    check('still-noncompliant after repair -> 422',(await invoke(repKey,'FAIRY')).statusCode===422);
    s=await snap();
    check('both billed calls of a rejected report are recorded as all-call spend',s.lifetime.reports===0&&s.lifetime.allModelCalls.knownNanoUsd===(10*100+10*500)+(20*100+20*500)&&s.lifetime.allModelCalls.repairCalls===1);
    check('failed-call spending belongs to its protocol, despite zero reports',s.lifetime.byProtocol.FAIRY.reports===0&&s.lifetime.byProtocol.FAIRY.apiSpend.knownNanoUsd===s.lifetime.allModelCalls.knownNanoUsd);
    __resetForTests();repKey=await svc.getOrCreateFreeLicense('stats-repair@example.com');
    script([{throw:true}]);
    check('network failure -> 502',(await invoke(repKey,'MA')).statusCode===502);
    script([{timeout:true}]);
    await invoke(repKey,'MA');
    script([{status:529}]);
    check('provider 529 passes through',(await invoke(repKey,'MA')).statusCode===529);
    s=await snap();
    check('network/timeout/HTTP failures are unknown calls, not zero',s.lifetime.reports===0&&s.lifetime.allModelCalls.calls===3&&s.lifetime.allModelCalls.unknownCalls===3&&s.lifetime.allModelCalls.complete===false);
    __resetForTests();repKey=await svc.getOrCreateFreeLicense('stats-repair@example.com');
    script([{text:'cut off',usage:{input_tokens:300,output_tokens:16000},stop:'max_tokens'}]);
    check('truncated response -> 502',(await invoke(repKey,'MA')).statusCode===502);
    script([{text:'no',usage:{input_tokens:50,output_tokens:5},stop:'refusal'}]);
    await invoke(repKey,'MA');
    s=await snap();
    check('truncated and refused calls are priced from returned tokens and not counted as reports',s.lifetime.reports===0&&s.lifetime.allModelCalls.knownNanoUsd===(300*100+16000*500)+(50*100+5*500)&&s.lifetime.allModelCalls.undeliveredRuns===2);
    __resetForTests();repKey=await svc.getOrCreateFreeLicense('stats-repair@example.com');
    process.env.ANTHROPIC_MODEL='claude-sonnet-4-6';
    global.fetch=async(_u,o)=>({ok:true,json:async()=>({content:[{type:'text',text:validReportForProviderBody(o.body)}],usage:{input_tokens:100,output_tokens:50},stop_reason:'end_turn',model:'claude-sonnet-4-6'})});
    await invoke(repKey,'MA');
    delete process.env.ANTHROPIC_MODEL;
    s=await snap();
    check('unpriced rollback model: report counted, spend unknown not zero',s.lifetime.reports===1&&s.lifetime.deliveredSpend.knownNanoUsd===0&&s.lifetime.deliveredSpend.unknownCalls===1&&s.lifetime.deliveredSpend.complete===false);

    console.log('\n6) telemetry faults never block a report; quota behaviour unchanged');
    __resetForTests();
    const faultKey=await svc.getOrCreateFreeLicense('stats-fault@example.com');
    global.fetch=async(_u,o)=>ok(o);
    quiet();__simulateUsageStatsFault('throw');
    const thrown=await invoke(faultKey,'MA');
    loud();
    check('stats write failure still returns the report (200)',thrown.statusCode===200&&typeof thrown.jsonBody.text==='string');
    const licensing=await import('../api/_lib/licensing.js');
    check('quota is still consumed once despite stats failure',(await licensing.getUsageCount(faultKey))===1);
    __simulateUsageStatsFault('hang');
    const t0=Date.now();
    const hung=await invoke(faultKey,'MA');
    check('hung stats store cannot hold the response beyond the bounded wait',hung.statusCode===200&&Date.now()-t0<4500);
    __simulateUsageStatsFault(null);
    quiet();
    const direct=await stats.recordUsageStats({licenseKey:'k',runToken:'r',protocol:'MA',delivered:true,attempts:[]},{timeoutMs:50});
    __simulateOutage(true);
    const outageWrite=await stats.recordUsageStats({licenseKey:'k',runToken:'r2',protocol:'MA',delivered:true,attempts:[]});
    let readFailed=false;try{await snap();}catch{readFailed=true;}
    __simulateOutage(false);
    const badProto=await stats.recordUsageStats({licenseKey:'k',runToken:'r3',protocol:'NOPE',delivered:true,attempts:[]});
    loud();
    check('KV outage: recordUsageStats resolves (no throw) as not recorded',outageWrite.recorded===false&&direct.recorded===true&&badProto.recorded===false);
    check('KV outage: snapshot read fails loudly instead of showing zeros',readFailed===true);
    s=await snap();
    check('no counts were invented by failed writes',s.lifetime.reports===1&&s.lifetime.allModelCalls.calls===0);

    console.log('\n7) owner-only read route');
    __resetForTests();
    freeKey=await svc.getOrCreateFreeLicense('stats-free2@example.com');
    await invoke(OWNER,'MA');
    const good2=await ownerRead();
    check('owner GET returns the snapshot',good2.statusCode===200&&good2.jsonBody.schema==='pathfinder-usage-stats-v1'&&good2.jsonBody.lifetime.reports===1);
    check('response is not cacheable',good2.headers['Cache-Control']==='no-store');
    check('owner POST action works too',(await ownerRead('POST',OWNER,{},{action:'usage-stats'})).jsonBody?.lifetime?.reports===1);
    check('no key -> 403',(await ownerRead('GET',''))?.statusCode===403);
    check('free-plan customer key -> 403',(await ownerRead('GET',freeKey)).statusCode===403);
    check('Pro customer key -> 403',(await ownerRead('GET',proKey)).statusCode===403);
    const wrong=await ownerRead('GET','owner-stats-test-key-0002');
    check('wrong key -> 403 with no stats or key echo',wrong.statusCode===403&&!JSON.stringify(wrong.jsonBody).includes('lifetime')&&!JSON.stringify(wrong.jsonBody).includes('0002'));
    check('GET with another action is rejected (405)',(await ownerRead('GET',OWNER,{action:'reset-claim'})).statusCode===405&&(await ownerRead('GET',OWNER,{})).statusCode===405);
    check('PUT still rejected',(await ownerRead('PUT')).statusCode===405);
    check('existing lookup action unchanged',(await ownerRead('POST',OWNER,{},{action:'lookup',licenseKey:freeKey})).jsonBody?.exists===true);
    quiet();__simulateOutage(true);
    const down=await ownerRead();
    __simulateOutage(false);loud();
    check('store outage -> 503 generic error, no internals',down.statusCode===503&&down.jsonBody.reason==='stats_unavailable'&&!/Simulated/.test(JSON.stringify(down.jsonBody)));
    const out=JSON.stringify(good2.jsonBody);
    check('response contains no license key, email or student name',!out.includes(OWNER)&&!out.includes(freeKey)&&!out.includes('@')&&!out.includes(STUDENT));
    const empty=await (async()=>{__resetForTests();return (await ownerRead()).jsonBody;})();
    check('empty store: zeros, null baseline timestamp, null averages',empty.lifetime.reports===0&&empty.baseline.firstRecordedAt===null&&empty.lifetime.deliveredSpend.avgKnownNanoUsdPerReport===null&&empty.baseline.backfilled===false);

    console.log('\n8) storage audit: no PII, bounded expiry, UTC buckets');
    __resetForTests();
    proRaw=await svc.createManualProLicense({email:'stats-audit@example.com'});proKey=proRaw.licenseKey||proRaw;
    const auditId='audit_generation_id_000001';
    await invoke(proKey,'BEIDA',auditId);
    const dump=__dumpForTests();
    const statKeys=Object.keys(dump).filter(k=>k.startsWith('stats:v1:'));
    const blob=JSON.stringify(Object.fromEntries(statKeys.map(k=>[k,dump[k].value]))) + statKeys.join('|');
    check('stats keys exist',statKeys.length===5);
    check('no license key, generation id, student, teacher or report text in stats storage',![proKey,auditId,STUDENT,'Layne','Hi ','@'].some(x=>blob.includes(x)));
    const hashFields=statKeys.filter(k=>/:(total|m:|d:)/.test(k)).flatMap(k=>Object.keys(dump[k].value));
    check('hash fields are fixed counter names with protocol codes only',hashFields.every(f=>/^(firstRecordedAt|reports|dup\.deliveries|(all|dl)\.[a-z_]+|runs\.undelivered|p\.(MA|MS|FAIRY|BLITZ|BEIDA|OF|PREPLY)\.[a-z_]+)$/.test(f)));
    const marker=statKeys.filter(k=>/:(run|rep):/.test(k));
    check('idempotency markers are 64-hex digests',marker.length===2&&marker.every(k=>/^stats:v1:(run|rep):[0-9a-f]{64}$/.test(k)));
    const today=new Date().toISOString();
    check('UTC month and day buckets',!!dump['stats:v1:m:'+today.slice(0,7)]&&!!dump['stats:v1:d:'+today.slice(0,10)]);
    check('lifetime and month hashes never expire; day hash and markers do',dump['stats:v1:total'].expiresAt===null&&dump['stats:v1:m:'+today.slice(0,7)].expiresAt===null&&dump['stats:v1:d:'+today.slice(0,10)].expiresAt>Date.now()+390*86400e3&&marker.every(k=>dump[k].expiresAt>Date.now()));
    const eve=stats.buildUsageStatsPlan({licenseKey:'k',runToken:'a',protocol:'MA',delivered:true,attempts:[],now:new Date('2026-12-31T23:59:59.999Z')});
    const morn=stats.buildUsageStatsPlan({licenseKey:'k',runToken:'b',protocol:'MA',delivered:true,attempts:[],now:new Date('2027-01-01T00:00:00.000Z')});
    check('UTC rollover changes both day and month bucket',eve.keys.day==='stats:v1:d:2026-12-31'&&eve.keys.month==='stats:v1:m:2026-12'&&morn.keys.day==='stats:v1:d:2027-01-01'&&morn.keys.month==='stats:v1:m:2027-01');
    const jan=await stats.getUsageStatsSnapshot(new Date('2027-01-15T12:00:00Z'));
    check('previous-month period handles year rollover',jan.periods.previousMonth==='2026-12');
    check('baseline date is explicit',/^\d{4}-\d{2}-\d{2}$/.test((await snap()).baseline.utcDate)&&(await snap()).baseline.firstRecordedAt!==null);
    check('response labels spend as an estimate, not an invoice',/not an Anthropic invoice/.test((await snap()).estimateNotice));
  }finally{
    loud();
    global.fetch=saved.fetch;
    for(const [k,v] of [['ANTHROPIC_API_KEY',saved.key],['OWNER_LICENSE_KEYS',saved.owner],['GENERATE_RATE_LIMIT_PER_MINUTE',saved.rate],['GENERATE_MAX_CONCURRENT',saved.conc],['ANTHROPIC_TIMEOUT_MS',saved.timeout],['ANTHROPIC_MODEL',saved.model]]){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
    __resetForTests();
  }
  return getFailures();
};

if(require.main===module){
  process.env.KIDBUSTER_TEST_KV='1';
  module.exports().then(n=>process.exit(n?1:0));
}
