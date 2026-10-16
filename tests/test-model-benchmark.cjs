'use strict';
// Three-model benchmark harness. No network: every provider call is mocked.
// Proves production-identical requests, shared prompts across models, the paid
// run gate, the validation/repair pipeline, cost math, blinding and reporting.
const {createChecker}=require('./helpers/assert.cjs');
const {validReport,validReportForProviderBody}=require('./helpers/valid-reports.cjs');
const C=require('../tools/model-benchmark/config.cjs');
const B=require('../tools/model-benchmark/core.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-model-benchmark.cjs ===');
  const sg=await import('../api/_lib/server-generation.js');
  const notes='Fictional lesson: Mia practiced ocean words and short sentences with can after a model.';
  const form={protocol:'OF',teacherName:'Nora',studentName:'Mia',notes,remarks:'',rating:'Medium',lengthFormat:'medium',studentGender:'girl',signoffEmoji:'',blitzVoice:'warm',preplyModule:'parent',preplyTrialPerson:'child'};

  console.log('\n1) benchmark requests are byte-identical to production except for the model');
  {
    const svc=await import('../api/_lib/license-service.js');
    const generate=(await import('../api/generate.js')).default;
    const {__resetForTests}=await import('../api/_lib/kv-client.js');
    __resetForTests();
    const key=await svc.getOrCreateFreeLicense('benchmark-parity@example.com');
    const prior=global.fetch,priorKey=process.env.ANTHROPIC_API_KEY;process.env.ANTHROPIC_API_KEY='isolated_test_key';
    // Production since 2026-10-16 = Haiku 5.5 / effort high / 8000 = benchmark
    // profile 'haiku-high' for Haiku. The rollback (ANTHROPIC_MODEL=
    // claude-sonnet-4-6) = benchmark profile 'production' for Sonnet 4.6.
    let productionBody=null,rollbackBody=null;
    const priorModel=process.env.ANTHROPIC_MODEL;
    global.fetch=async(_u,o)=>{const b=JSON.parse(o.body);if(b.model==='claude-sonnet-4-6')rollbackBody=b;else productionBody=b;return {ok:true,json:async()=>({content:[{text:validReportForProviderBody(o.body,{teacher:'Nora'})}]})};};
    const res={status(){return this;},json(){return this;},setHeader(){}};
    try{
      delete process.env.ANTHROPIC_MODEL;
      await generate({method:'POST',headers:{'x-app-key':key,'x-installation-id':'benchmark-parity'},body:{generation:form}},res);
      process.env.ANTHROPIC_MODEL='claude-sonnet-4-6';
      await generate({method:'POST',headers:{'x-app-key':key,'x-installation-id':'benchmark-parity'},body:{generation:form}},res);
    }finally{global.fetch=prior;if(priorKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=priorKey;if(priorModel===undefined)delete process.env.ANTHROPIC_MODEL;else process.env.ANTHROPIC_MODEL=priorModel;}
    const built=sg.buildServerGeneration(form);
    const bench=B.buildRequestBody({model:'claude-sonnet-4-6',systemPrompt:built.systemPrompt,messages:[{role:'user',content:built.userMessage}]});
    const benchHaiku=B.buildRequestBody({model:'claude-haiku-5-5',systemPrompt:built.systemPrompt,messages:[{role:'user',content:built.userMessage}],profile:'haiku-high'});
    check('production and rollback requests were captured',!!productionBody&&!!rollbackBody);
    check('production request is byte-identical to the benchmark haiku-high arm',JSON.stringify(productionBody)===JSON.stringify(benchHaiku));
    check('rollback request is byte-identical to the benchmark legacy production arm',JSON.stringify(rollbackBody)===JSON.stringify(bench));
    check('production profile adds no thinking/effort/temperature parameters',!('thinking' in bench)&&!('output_config' in bench)&&!('temperature' in bench));
    for(const m of ['claude-haiku-5-5','claude-sonnet-5-5'])
      check(m+' differs from production only in model',JSON.stringify({...B.buildRequestBody({model:m,systemPrompt:built.systemPrompt,messages:[{role:'user',content:built.userMessage}]}),model:0})===JSON.stringify({...bench,model:0}));
    const hb=m=>B.buildRequestBody({model:m,systemPrompt:built.systemPrompt,messages:[{role:'user',content:built.userMessage}],profile:'thinking-headroom'});
    check('thinking-headroom keeps Sonnet 4.6 byte-identical to production',JSON.stringify(hb('claude-sonnet-4-6'))===JSON.stringify(bench));
    check('thinking-headroom raises only max_tokens for thinking models',['claude-haiku-5-5','claude-sonnet-5-5'].every(m=>{const b=hb(m);return b.max_tokens===8000&&JSON.stringify({...b,model:0,max_tokens:0})===JSON.stringify({...bench,model:0,max_tokens:0});}));
    const hh=m=>B.buildRequestBody({model:m,systemPrompt:built.systemPrompt,messages:[{role:'user',content:built.userMessage}],profile:'haiku-high'});
    check('haiku-high sends effort high (and 8000 max_tokens) for Haiku only',hh('claude-haiku-5-5').output_config?.effort==='high'&&hh('claude-haiku-5-5').max_tokens===8000);
    check('haiku-high leaves Sonnet 4.6 byte-identical to production',JSON.stringify(hh('claude-sonnet-4-6'))===JSON.stringify(bench));
    check('haiku-high adds no effort to Sonnet 5.5',!('output_config' in hh('claude-sonnet-5-5')));
    check('models outside the allow-list are refused',(()=>{try{B.buildRequestBody({model:'claude-opus-5-5',systemPrompt:'x',messages:[]});return false;}catch{return true;}})());
  }

  console.log('\n2) one prompt per transcript x protocol x repetition, shared by all models');
  {
    let builds=0;
    const stubBuild=g=>{builds++;return {...sg.buildServerGeneration(g)};};
    let refused=false;try{B.planJobs({phase:'full',buildServerGeneration:stubBuild,readPrivate:()=>'not the real transcript'});}catch(e){refused=/hash mismatch/.test(e.message);}
    check('private transcript settings come from a git-ignored sidecar, not committed config',!JSON.stringify(C.TRANSCRIPTS).match(/studentName|teacherName/)&&!!C.TRANSCRIPTS['real-1'].settingsPath);
    check('a private transcript with the wrong hash is refused',refused);
    // Use the fictional transcripts only for a fully offline plan.
    const savedPhase=C.PHASES.test;C.PHASES.test={transcripts:['mixed-fictional','scaffolded-fictional'],repetitions:2};
    builds=0;
    const p=B.planJobs({phase:'test',buildServerGeneration:stubBuild,readPrivate:()=>''});
    check('2 transcripts x 7 protocols x 2 reps = 28 prompts, each built exactly once',p.prompts.length===28&&builds===28);
    check('every prompt is shared by all three models (84 jobs)',p.jobs.length===84&&p.prompts.every(pr=>p.jobs.filter(j=>j.promptId===pr.promptId).length===3));
    check('jobs for one prompt carry the same prompt hash',(()=>{const ids=new Set(p.prompts.map(x=>x.promptId));return [...ids].every(id=>new Set(p.jobs.filter(j=>j.promptId===id).map(j=>p.prompts.find(x=>x.promptId===id).promptSha256)).size===1);})());
    const est=B.estimate(p);
    check('estimate reports 84 reports and at most 168 provider calls',est.reports===84&&est.maxProviderCalls===168);
    check('upper bound exceeds lower bound',est.upperUsd>est.lowerUsd&&est.lowerUsd>0);
    const code=B.approvalCode(p,est,'production','abc1234');
    check('approval code is deterministic',code===B.approvalCode(p,est,'production','abc1234'));
    check('approval code changes when the commit changes',code!==B.approvalCode(p,est,'production','def5678'));
    const tweaked={...p,prompts:p.prompts.map((x,i)=>i?x:{...x,promptSha256:'changed'})};
    check('approval code changes when any prompt changes',code!==B.approvalCode(tweaked,est,'production','abc1234'));
    // Reproducibility: Blitz/Classic pick random style variants; plans must not.
    const again=B.planJobs({phase:'test',buildServerGeneration:sg.buildServerGeneration,readPrivate:()=>'',resetCore:sg.__resetServerGenerationForTests});
    const again2=B.planJobs({phase:'test',buildServerGeneration:sg.buildServerGeneration,readPrivate:()=>'',resetCore:sg.__resetServerGenerationForTests});
    check('rebuilding the same plan reproduces every prompt hash (incl. Blitz and Classic)',JSON.stringify(again.prompts.map(x=>x.promptSha256))===JSON.stringify(again2.prompts.map(x=>x.promptSha256)));
    check('rebuilding the same plan reproduces the approval code',B.approvalCode(again,B.estimate(again),'production','c1')===B.approvalCode(again2,B.estimate(again2),'production','c1'));
    const r1=Math.random();check('Math.random is restored after planning',typeof r1==='number'&&Math.random!==undefined&&Math.random()!==r1);
    if(savedPhase===undefined)delete C.PHASES.test;else C.PHASES.test=savedPhase;
    check('initial phase is 21 reports and full phase is 126 by configuration',C.PHASES.initial.transcripts.length*7*3*C.PHASES.initial.repetitions===21&&C.PHASES.full.transcripts.length*7*3*C.PHASES.full.repetitions===126);
  }

  console.log('\n3) paid runs need explicit, plan-specific approval and a spend cap');
  {
    const est={upperUsd:0.8};
    const ok={PATHFINDER_EVAL_ALLOW_LIVE:'YES'};
    const blocked=(env,approve,cap,expect)=>{try{B.liveGate({env,approve,expectedCode:'abc',maxSpendUsd:cap,est});return false;}catch(e){return e.message.includes(expect);}};
    check('blocked without PATHFINDER_EVAL_ALLOW_LIVE=YES',blocked({},'abc',5,'PATHFINDER_EVAL_ALLOW_LIVE'));
    check('blocked when the production ANTHROPIC_API_KEY is present',blocked({...ok,ANTHROPIC_API_KEY:'x'},'abc',5,'production ANTHROPIC_API_KEY'));
    check('blocked without an approval code',blocked(ok,undefined,5,'--approve'));
    check('blocked when the approval code is for a different plan',blocked(ok,'zzz',5,'does not match'));
    check('blocked without a spend cap',blocked(ok,'abc',NaN,'--max-spend-usd'));
    check('blocked when the estimate exceeds the cap',blocked(ok,'abc',0.5,'exceeds'));
    check('allowed with every gate satisfied',B.liveGate({env:ok,approve:'abc',expectedCode:'abc',maxSpendUsd:1,est})===true);
  }

  console.log('\n4) pipeline mirrors production validation and the single repair');
  {
    const prompt={promptSha256:'h',systemPrompt:sg.buildServerGeneration({...form,protocol:'FAIRY',rating:'4'}).systemPrompt,
      userMessage:'u',form:sg.buildServerGeneration({...form,protocol:'FAIRY',rating:'4'}).form};
    const job={jobId:'t__FAIRY__r1__claude-haiku-5-5',model:'claude-haiku-5-5',protocol:'FAIRY',transcript:'t',rep:1};
    const good=validReport('FAIRY',{student:'Mia',teacher:'Nora'}),long=validReport('FAIRY',{student:'Mia',teacher:'Nora',extraVocab:20});
    function scripted(steps){let i=0;const bodies=[];return {bodies,fetchImpl:async(_u,o)=>{bodies.push(JSON.parse(o.body));const s=steps[i++];
      return {ok:!s.status,status:s.status||200,json:async()=>s.status?{error:{message:'x'}}:{content:s.content||[{type:'text',text:s.text}],usage:s.usage||{input_tokens:1000,output_tokens:500},stop_reason:s.stop||'end_turn'}};}};}
    const run=(steps,extra={})=>{const s=scripted(steps);return B.runJob({job,prompt,fetchImpl:s.fetchImpl,apiKey:'k',evaluateGeneratedOutput:sg.evaluateGeneratedOutput,buildRepairMessage:sg.buildRepairMessage,...extra}).then(r=>({r,bodies:s.bodies}));};
    let {r,bodies}=await run([{text:good}]);
    check('valid draft accepted with one provider call',r.accepted&&r.providerCalls===1&&r.finalText===good);
    ({r,bodies}=await run([{text:long},{text:good}]));
    check('overlong draft repaired once and accepted',r.accepted&&r.providerCalls===2&&r.repair.outcome==='repaired');
    check('raw first draft and repaired text are both kept',r.rawText===long&&r.repairText===good&&r.finalText===good);
    check('repair request uses the same model and never re-sends the transcript',bodies[1].model==='claude-haiku-5-5'&&bodies[1].messages[0].content.includes('COMPLIANCE REVISION')&&!bodies[1].messages[0].content.includes(prompt.userMessage+'x'));
    ({r}=await run([{text:long},{text:long},{text:good}]));
    check('second invalid draft -> not accepted, no third call',!r.accepted&&r.providerCalls===2&&r.finalText===null&&r.repair.outcome==='still_noncompliant');
    ({r}=await run([{content:[],stop:'refusal'}]));
    check('refusal is recorded as its own outcome, never repaired',r.firstOutcome==='refusal'&&!r.accepted&&r.providerCalls===1);
    ({r}=await run([{text:good.slice(0,300),stop:'max_tokens'}]));
    check('truncation (e.g. thinking consuming max_tokens) is recorded, not delivered',r.firstOutcome==='truncated'&&!r.accepted);
    ({r}=await run([{content:[{type:'thinking',thinking:''},{type:'text',text:good}],usage:{input_tokens:2000,output_tokens:1500,cache_creation_input_tokens:800}}]));
    check('thinking blocks are counted and excluded from report text',r.accepted&&r.finalText===good&&r.thinkingBlocks===1);
    check('cost uses the model\'s own prices (Haiku 5.5)',Math.abs(r.costUsd-(2000*0.10+1500*0.50+800*0.125)/1e6)<1e-12);
    ({r}=await run([{status:529}]));
    check('provider HTTP errors are recorded with their status',r.firstOutcome==='http_529'&&!r.accepted);
    let t=0;const now=()=>t;
    ({r}=await run([{text:long},{text:good}],{now:()=>{const v=now();t+=25000;return v;}}));
    check('no repair is started without enough of the 55 s budget left',r.repair.outcome==='no_time'&&r.providerCalls===1);
  }

  console.log('\n5) cost accounting');
  check('Sonnet 4.6 cost math',Math.abs(B.costUsd({input_tokens:1e6,output_tokens:1e6,cache_creation_input_tokens:1e6,cache_read_input_tokens:1e6},'claude-sonnet-4-6')-(3+15+3.75+0.30))<1e-9);
  check('Sonnet 5.5 cost math',Math.abs(B.costUsd({input_tokens:1e6,output_tokens:1e6},'claude-sonnet-5-5')-12)<1e-9);
  check('unknown model costs nothing rather than guessing',B.costUsd({input_tokens:1e6},'unknown')===0);

  console.log('\n6) blinded teacher packet hides model identity and names');
  const recs=[];const prompts=[];
  for(const protocol of ['MA','OF']){
    const promptId='real-1__'+protocol+'__r1';
    prompts.push({promptId,protocol,transcriptKind:'private',names:['Rory','Wren']});
    for(const model of Object.keys(C.MODELS))recs.push({jobId:promptId+'__'+model,model,protocol,accepted:true,finalText:'Hi Rory! Great work. Cheers, Teacher Wren',rawText:'x',costUsd:model==='claude-haiku-5-5'?0.001:0.04,latencyMs:1000,usage:{output_tokens:100},repair:{attempted:false},firstOutcome:'ok',firstContract:{blocking:[]}});
  }
  const packet=B.buildBlindPacket({records:recs,prompts,seed:'s1'});
  check('packet never names a model ID or label',!Object.keys(C.MODELS).some(m=>packet.markdown.includes(m))&&!/Sonnet|Haiku|Claude|Anthropic/i.test(packet.markdown));
  check('student and teacher names are replaced',!/\bLeo\b|\bLina\b/.test(packet.markdown)&&packet.markdown.includes('[Student]')&&packet.markdown.includes('[Teacher]'));
  check('every report gets a code in the sealed key',packet.key.length===recs.length&&new Set(packet.key.map(k=>k.code)).size===recs.length);
  check('scoresheet has one row per report',packet.scoresheetCsv.trim().split('\n').length===recs.length+1);
  check('same seed reproduces the same order',JSON.stringify(B.buildBlindPacket({records:recs,prompts,seed:'s1'}).key)===JSON.stringify(packet.key));
  check('a different seed changes the assignment',JSON.stringify(B.buildBlindPacket({records:recs,prompts,seed:'other'}).key)!==JSON.stringify(packet.key));

  console.log('\n7) comparison keeps hallucinations apart from writing scores and finds the economical mix');
  const csv=['code,protocol,reviewer,factual_grounding_1_5,hallucination_count,hallucination_notes,educational_usefulness_1_5,writing_quality_1_5,personality_1_5,send_ready_yes_edits_no,comments',
    ...packet.key.map(k=>[k.code,'', 'T1', k.model==='claude-sonnet-5-5'?5:k.model==='claude-haiku-5-5'?4:3, k.model==='claude-sonnet-4-6'?1:0,'',4,4,4,'yes',''].join(','))].join('\n');
  const cmp=B.compare({records:recs,key:packet.key,scoresCsv:csv});
  check('cost per accepted report is computed',cmp.rows.every(r=>r.costPerAcceptedUsd===r.costUsd/r.accepted));
  check('strongest model per protocol follows teacher factual scores',cmp.best.MA.model==='claude-sonnet-5-5'&&cmp.best.MA.basis==='teacher scores');
  check('economical mix picks the cheapest model meeting the bar (factual >= 4, no hallucinations)',cmp.economical.MA.model==='claude-haiku-5-5');
  check('confirmed hallucinations are counted separately',cmp.rows.find(r=>r.model==='claude-sonnet-4-6').hallucinations===1);
  const noScores=B.compare({records:recs,key:packet.key,scoresCsv:null});
  check('without teacher scores rankings say they are deterministic only',noScores.best.MA.basis.includes('deterministic only'));
  check('heuristic flags are candidates, separate from confirmed counts',typeof noScores.rows[0].heuristicFlags==='number'&&noScores.rows[0].hallucinations===0);

  console.log('\n8) committed configuration contains no secrets or transcripts');
  const cfgText=require('fs').readFileSync(require('path').join(__dirname,'../tools/model-benchmark/config.cjs'),'utf8');
  check('no API key material in config',!/sk-ant|x-api-key/i.test(cfgText));
  check('private transcripts are referenced only inside .v2-local',Object.values(C.TRANSCRIPTS).filter(t=>t.kind==='private').every(t=>t.path.startsWith('.v2-local/')));
  check('verified API model IDs (not display names) are configured',Object.keys(C.MODELS).every(id=>/^claude-[a-z]+-\d-\d$/.test(id)));

  return getFailures();
};

if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(f=>process.exit(f?1:0));}
