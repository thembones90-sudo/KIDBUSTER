'use strict';
const {createChecker}=require('./helpers/assert.cjs');
const {CASES,PROTOCOLS,SCENARIOS}=require('../tools/protocol-output-eval-cases.cjs');
const evalTool=require('../tools/evaluate-protocol-outputs.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-protocol-output-evaluation.cjs ===');

  check('21 fictional cases: seven distinct protocols, three scenarios each',
    CASES.length===21&&PROTOCOLS.length===7&&SCENARIOS.length===3&&
    PROTOCOLS.every(p=>SCENARIOS.every(s=>CASES.some(c=>c.id===p.toLowerCase()+'-'+s))));
  check('all fixtures satisfy the strict synthetic data contract',evalTool.validateFixtures());
  check('OF, Beida and Preply use their native non-numeric rating scales',
    CASES.filter(c=>c.protocol==='OF').every(c=>['Low','Medium','High'].includes(c.generation.rating))&&
    CASES.filter(c=>c.protocol==='BEIDA').every(c=>['excellent','try_harder'].includes(c.generation.rating))&&
    CASES.filter(c=>c.protocol==='PREPLY').every(c=>c.generation.rating===''));

  let noNetworkCalls=0;
  const neverFetch=async()=>{noNetworkCalls++;throw new Error('Network must not be used');};
  const offline=await evalTool.runEvaluation({mode:'check',fetchImpl:neverFetch,env:{},writeFiles:false});
  check('offline validation invokes the real trusted prompt builder for 21 cases',
    offline.cases.length===21&&offline.cases.every(c=>/^[a-f0-9]{64}$/.test(c.serverPromptSha256)));
  check('offline check performs zero network calls and never claims live results',
    noNetworkCalls===0&&offline.realModelOutputs===0&&offline.humanReviewedOutputs===0&&!offline.fullyCertified);
  const dry=await evalTool.runEvaluation({mode:'dry-run',limit:4,fetchImpl:neverFetch,env:{},writeFiles:false});
  check('dry run makes zero provider requests, writes no fake reports',
    dry.cases.length===4&&dry.status==='DRY_RUN_NO_MODEL_OUTPUT'&&
    dry.cases.every(c=>!('report' in c))&&noNetworkCalls===0);

  let blocked=false;
  try{await evalTool.runEvaluation({mode:'live',limit:1,env:{},fetchImpl:neverFetch,writeFiles:false});}
  catch(e){blocked=e.message.includes('LIVE_BLOCKED');}
  check('live mode fails closed without explicit opt-in',blocked&&noNetworkCalls===0);
  blocked=false;
  try{await evalTool.runEvaluation({mode:'live',limit:1,env:{PATHFINDER_EVAL_ALLOW_LIVE:'YES',ANTHROPIC_API_KEY:'production-should-not-be-used'},fetchImpl:neverFetch,writeFiles:false});}
  catch(e){blocked=e.message.includes('LIVE_BLOCKED')&&e.message.includes('production ANTHROPIC_API_KEY');}
  check('production ANTHROPIC_API_KEY is never accepted as evaluation credential',blocked&&noNetworkCalls===0);

  const fakeKey='dedicated-test-key-never-log';
  const opts={mode:'live',limit:1,
    env:{PATHFINDER_EVAL_ALLOW_LIVE:'YES',PATHFINDER_EVAL_ANTHROPIC_API_KEY:fakeKey},
    writeFiles:false};
  let sent=null;
  const mocked=await evalTool.runEvaluation({...opts,fetchImpl:async(url,request)=>{
    sent={url,request};
    return {ok:true,status:200,json:async()=>({stop_reason:'end_turn',
      content:[{type:'text',text:'Avery Example practiced coral reef ecology today. There was a clear lesson focus.'}],
      usage:{input_tokens:130,output_tokens:19}})};
  }});
  check('explicit mocked provider call uses intended model and trusted system prompt',
    sent?.url==='https://api.anthropic.com/v1/messages'&&
    JSON.parse(sent.request.body).model==='claude-sonnet-4-6'&&
    JSON.parse(sent.request.body).system[0].text.length>1000&&
    JSON.parse(sent.request.body).messages[0].content.includes('coral reef ecology'));
  check('mocked response remains PENDING human review, never becomes a 95% certificate',
    mocked.realModelOutputs===1&&mocked.humanReviewedOutputs===0&&mocked.cases[0].humanReview==='PENDING'&&
    mocked.fullyCertified===false);
  check('dedicated provider credential never appears in evidence bundle',
    !JSON.stringify(mocked).includes(fakeKey)&&mocked.cases[0].report.includes('Avery Example'));

  const fakeResponse=(stop_reason,text)=>async()=>({ok:true,status:200,
    json:async()=>({stop_reason,content:[{type:'text',text}],usage:{output_tokens:3000}})});
  const cut=await evalTool.callAnthropic({systemPrompt:'synthetic system',userMessage:'synthetic user',key:fakeKey,
    model:'claude-sonnet-4-6',fetchImpl:fakeResponse('max_tokens','Partial and unsafe')});
  check('truncated real-model response is rejected and never treated as generated',cut.status==='TRUNCATED'&&!cut.text);
  const empty=await evalTool.callAnthropic({systemPrompt:'synthetic system',userMessage:'synthetic user',key:fakeKey,
    model:'claude-sonnet-4-6',fetchImpl:fakeResponse('end_turn','')});
  check('empty successful provider response is rejected',empty.status==='EMPTY');
  const failure=await evalTool.callAnthropic({systemPrompt:'synthetic system',userMessage:'synthetic user',key:fakeKey,
    model:'claude-sonnet-4-6',fetchImpl:async()=>({ok:false,status:429})});
  check('provider failures are recorded without printing provider error bodies',failure.status==='PROVIDER_ERROR'&&failure.httpStatus===429);

  const csv=evalTool.makeReviewCsv(offline.cases);
  check('review template has 21 pending human review rows and a reviewer signoff field',
    csv.split(/\r?\n/).filter(Boolean).length===22&&csv.includes('reviewer_signoff')&&
    csv.includes('factual_accuracy_0_to_5'));

  const invalidArgs=[
    ['--live'], ['--live','--limit','0'],['--live','--limit','22'],
    ['--live','--limit','abc'],['--live','--dry-run'],
    ['--unknown'],['--check','--check'],['--limit','0']
  ];
  check('CLI refuses invalid modes and paid mode without an explicit case limit',
    invalidArgs.every(args=>{try{evalTool.parseArgs(args);return false;}catch{return true;}}));
  check('explicit paid batch size is preserved by the CLI parser',
    evalTool.parseArgs(['--live','--limit','1']).limit===1&&
    evalTool.parseArgs(['--live','--limit','21']).limit===21);

  let mixedCredentialsBlocked=false;
  try{evalTool.guardedLiveConfig({PATHFINDER_EVAL_ALLOW_LIVE:'YES',
    PATHFINDER_EVAL_ANTHROPIC_API_KEY:fakeKey,ANTHROPIC_API_KEY:fakeKey});}
  catch(err){mixedCredentialsBlocked=err.message.includes('LIVE_BLOCKED');}
  check('any production credential in environment blocks live evaluation without reading it',mixedCredentialsBlocked);

  const dup=structuredClone(CASES);
  dup[1].id=dup[0].id;
  let duplicateRejected=false;
  try{evalTool.validateFixtures(dup);}catch(err){duplicateRejected=err.message.includes('Duplicate');}
  const mismatch=structuredClone(CASES);
  mismatch[0].generation.protocol='OF';
  let mismatchRejected=false;
  try{evalTool.validateFixtures(mismatch);}catch(err){mismatchRejected=true;}
  check('fixture validator rejects duplicate case IDs and mismatched protocol inputs',
    duplicateRejected&&mismatchRejected);

  const timeout=await evalTool.callAnthropic({systemPrompt:'test system',userMessage:'test notes',
    key:fakeKey,model:evalTool.DEFAULT_MODEL,timeoutMs:12,
    fetchImpl:async(_url,opts)=>new Promise((_resolve,reject)=>{
      opts.signal.addEventListener('abort',()=>{
        const err=new Error('Request aborted');err.name='AbortError';reject(err);
      },{once:true});
    })});
  check('timed-out provider requests are aborted and classified as provider errors',
    timeout.status==='PROVIDER_ERROR'&&timeout.reason.includes('timed out'));

  const notesWarning=evalTool.automatedChecks('The student has excellent skills and good progress.',
    CASES.find(x=>x.scenario==='contradictory'));
  const inventionWarning=evalTool.automatedChecks('The student had perfect attendance this year.',CASES[0]);
  check('automatic screening warns on unresolved contradictory notes and obvious unsupported claims',
    notesWarning.reviewWarnings.some(x=>x.includes('Contradictory'))&&
    inventionWarning.reviewWarnings.some(x=>x.includes('perfect attendance')));

  const fs=require('node:fs'),path=require('node:path');
  const scratch=path.join(__dirname,'../.v2-local/protocol-evals/unit-test-fixtures');
  try{
    const saved=await evalTool.runEvaluation({...opts,writeFiles:true,outputRoot:scratch,
      fetchImpl:async()=>({ok:true,status:200,json:async()=>({
        stop_reason:'end_turn',content:[{type:'text',text:'Avery Example practiced coral reef ecology today.'}]
      })})});
    const onDisk=fs.readFileSync(path.join(saved.outputDirectory,'results.json'),'utf8');
    const review=fs.readFileSync(path.join(saved.outputDirectory,'human-review-template.csv'),'utf8');
    const status=fs.readFileSync(path.join(saved.outputDirectory,'REVIEW-STATUS.txt'),'utf8');
    check('bundle actually saves a report and human signoff without storing API keys',
      saved.cases.length===1&&review.includes('reviewer_signoff')&&
      status.includes('HUMAN_REVIEW_REQUIRED')&&!onDisk.includes(fakeKey)&&
      JSON.parse(onDisk).fullyCertified===false);
    let calls=0,checkpointVerified=false;
    const resumed=await evalTool.runEvaluation({...opts,limit:2,writeFiles:true,outputRoot:scratch,
      fetchImpl:async()=>{
        calls++;
        if(calls===2){
          const dirs=fs.readdirSync(scratch,{withFileTypes:true}).filter(x=>x.isDirectory());
          checkpointVerified=dirs.some(x=>{
            const raw=fs.readFileSync(path.join(scratch,x.name,'results.json'),'utf8');
            const state=JSON.parse(raw);
            return state.status==='LIVE_IN_PROGRESS'&&state.cases.length===1&&
              state.realModelOutputs===1&&raw.includes('Avery Example')&&!raw.includes(fakeKey);
          });
        }
        return {ok:true,status:200,json:async()=>({stop_reason:'end_turn',
          content:[{type:'text',text:'Avery Example practiced fictional vocabulary.'}]})};
      }});
    check('multi-request paid run saves a checkpoint before requesting the next case',
      checkpointVerified&&resumed.realModelOutputs===2&&resumed.status==='LIVE_UNREVIEWED');
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}

  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(err=>{console.error(err);process.exit(1);});
