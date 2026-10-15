'use strict';
/*
 * Local-only certification harness. NO real model call without --live and
 * BOTH dedicated evaluation environment variables. Does not use licensing,
 * Vercel, KV, Krisp, production keys, or customer records.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {CASES,PROTOCOLS,SCENARIOS}=require('./protocol-output-eval-cases.cjs');

const ANTHROPIC_ENDPOINT='https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL='claude-sonnet-4-6';
const MAX_TOKENS=3000;
const DEFAULT_TIMEOUT_MS=90000;
const OUTPUT_ROOT=path.resolve(__dirname,'../.v2-local/protocol-evals');

function parseArgs(args){
  const flags={mode:'check',limit:CASES.length};
  let modeSeen=false,hasExplicitLimit=false;
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--help'||arg==='-h')return {help:true};
    if(['--check','--dry-run','--live'].includes(arg)){
      if(modeSeen)throw new Error('Choose exactly one of --check, --dry-run or --live');
      flags.mode=arg.slice(2); modeSeen=true;continue;
    }
    if(arg==='--limit'){
      const raw=args[++i];
      if(!/^[0-9]+$/.test(raw||''))throw new Error('--limit requires an integer');
      flags.limit=Number(raw);
      if(flags.limit<1||flags.limit>CASES.length)throw new Error('--limit must be 1 through '+CASES.length);
      hasExplicitLimit=true;
      continue;
    }
    throw new Error('Unknown CLI option: '+arg);
  }
  // Never silently submit a whole paid batch when the operator intended a trial.
  if(flags.mode==='live'&&!hasExplicitLimit)throw new Error('LIVE_BLOCKED: specify --limit N explicitly for paid provider calls');
  return flags;
}

function validateFixtures(cases=CASES){
  if(cases.length!==21)throw new Error('Expected exactly 21 fictional evaluation cases');
  const seen=new Set();
  for(const c of cases){
    if(seen.has(c.id))throw new Error('Duplicate fixture: '+c.id);
    seen.add(c.id);
    if(!PROTOCOLS.includes(c.protocol)||!SCENARIOS.includes(c.scenario))
      throw new Error('Unknown protocol or scenario in '+c.id);
    if(c.fictionalOnly!==true||c.generation.teacherName!=='Teacher Mira'||c.generation.studentName!=='Avery Example')
      throw new Error('Fixture is missing fictional identity controls: '+c.id);
    if(c.generation.protocol!==c.protocol)throw new Error('Protocol mismatch: '+c.id);
    if(c.protocol==='PREPLY'&&c.generation.rating!=='')throw new Error('Preply must not use numeric ratings');
    if(c.protocol==='BEIDA'&&!['excellent','try_harder'].includes(c.generation.rating))throw new Error('Invalid Beida rating');
    if(c.protocol==='OF'&&!['Low','Low/Medium','Medium','Medium/High','High'].includes(c.generation.rating))throw new Error('Invalid OF rating');
    if(!c.evidence.established.length||!c.evidence.topic||!c.generation.notes.includes(c.evidence.topic))
      throw new Error('Missing provenance facts: '+c.id);
  }
  for(const p of PROTOCOLS)for(const s of SCENARIOS)
    if(!seen.has(p.toLowerCase()+'-'+s))throw new Error('Missing '+p+'/'+s+' fixture');
  return true;
}

async function compileCases(limit=CASES.length){
  validateFixtures();
  const {buildServerGeneration}=await import('../api/_lib/server-generation.js');
  const selected=CASES.slice(0,limit);
  return selected.map(c=>{
    const built=buildServerGeneration(c.generation);
    if(built.protocol!==c.protocol||!built.userMessage.includes(c.evidence.topic))
      throw new Error('Server generation contract failed for '+c.id);
    return {fixture:c,prompt:built,promptHash:crypto.createHash('sha256')
      .update(built.systemPrompt+'\n'+built.userMessage).digest('hex')};
  });
}

function makeReviewCsv(rows){
  const cols=['case_id','protocol','scenario','human_reviewer','reviewed_at_utc',
    'factual_accuracy_0_to_5','unsupported_facts_count','protocol_adherence_0_to_5',
    'rating_tone_0_to_5_or_NA','language_quality_0_to_5','format_length_0_to_5',
    'teacher_usefulness_0_to_5','needs_rewrite_yes_no','notes','reviewer_signoff'];
  const safe=value=>{
    const str=String(value??'');
    return '"'+str.replace(/"/g,'""')+'"';
  };
  const table=[cols.join(',')];
  for(const row of rows){
    const cells=[row.caseId,row.protocol,row.scenario,'','','','','',
      row.protocol==='PREPLY'?'NA':'','','','','','',''];
    table.push(cells.map(safe).join(','));
  }
  return table.join('\r\n')+'\r\n';
}

function outputFolder(root=OUTPUT_ROOT,now=new Date()){
  const stamp=now.toISOString().replace(/[:.]/g,'-');
  return path.join(root,stamp+'-'+crypto.randomBytes(3).toString('hex'));
}

function writeBundle(runDir,manifest){
  fs.mkdirSync(runDir,{recursive:true});
  fs.writeFileSync(path.join(runDir,'results.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
  fs.writeFileSync(path.join(runDir,'human-review-template.csv'),makeReviewCsv(manifest.cases),'utf8');
  fs.writeFileSync(path.join(runDir,'REVIEW-STATUS.txt'),
    'HUMAN_REVIEW_REQUIRED: No output is certified until a reviewer checks every report against its fictional source notes, completes the CSV, signs off, and verifies zero invented student facts.\n','utf8');
}

function guardedLiveConfig(env){
  if(env.PATHFINDER_EVAL_ALLOW_LIVE!=='YES')
    throw new Error('LIVE_BLOCKED: set PATHFINDER_EVAL_ALLOW_LIVE=YES explicitly');
  // Fail closed if a production Anthropic credential even exists in this
  // process. Never read or compare its value. Use a clean test-only shell.
  if(Object.hasOwn(env,'ANTHROPIC_API_KEY'))
    throw new Error('LIVE_BLOCKED: production ANTHROPIC_API_KEY must not be present in evaluation environment');
  const key=env.PATHFINDER_EVAL_ANTHROPIC_API_KEY;
  if(typeof key!=='string'||key.trim().length<8)
    throw new Error('LIVE_BLOCKED: dedicated PATHFINDER_EVAL_ANTHROPIC_API_KEY is required');
  const model=(env.PATHFINDER_EVAL_MODEL||DEFAULT_MODEL).trim();
  if(!/^[A-Za-z0-9._-]{5,100}$/.test(model))
    throw new Error('LIVE_BLOCKED: invalid evaluation model ID');
  return {key,model};
}

async function callAnthropic({systemPrompt,userMessage,key,model,fetchImpl,timeoutMs=DEFAULT_TIMEOUT_MS}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  try{
    const resp=await fetchImpl(ANTHROPIC_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({
        model,max_tokens:MAX_TOKENS,
        system:[{type:'text',text:systemPrompt}],
        messages:[{role:'user',content:userMessage}]
      }),
      signal:controller.signal
    });
    if(!resp.ok)return {status:'PROVIDER_ERROR',httpStatus:resp.status,elapsedMs:Date.now()-started,
      reason:'Provider returned non-success HTTP status'};
    const data=await resp.json();
    const text=Array.isArray(data.content)?data.content.map(x=>typeof x?.text==='string'?x.text:'').join('').trim():'';
    const stopReason=data.stop_reason||null;
    if(stopReason==='max_tokens'||stopReason==='model_context_window_exceeded')
      return {status:'TRUNCATED',stopReason,elapsedMs:Date.now()-started,usage:data.usage||null,
        reason:'Provider stopped at output/context token limit'};
    if(!text)return {status:'EMPTY',stopReason,elapsedMs:Date.now()-started,reason:'Provider returned no text'};
    return {status:'GENERATED',text,stopReason,elapsedMs:Date.now()-started,usage:data.usage||null};
  }catch(err){
    return {status:'PROVIDER_ERROR',elapsedMs:Date.now()-started,
      reason:err?.name==='AbortError'?'Provider request timed out':'Network or provider response error'};
  }finally{clearTimeout(timer);}
}

function automatedChecks(text,fixture){
  if(typeof text!=='string'||!text.trim())return {nonempty:false,reviewWarnings:['Empty report']};
  const warnings=[];
  if(text.length<100)warnings.push('Suspiciously short report: manually verify required sections');
  if(fixture.scenario==='contradictory'&&!/conflict|contradic|inconclusive|unclear|unverif|cannot confirm|could not confirm|uncertain|both records|different notes|disagree|mixed evidence/i.test(text))
    warnings.push('Contradictory evidence may have been presented as settled fact: human review required');
  for(const phrase of ['perfect attendance','won a competition','diagnosed with','completed all homework']){
    if(text.toLowerCase().includes(phrase))warnings.push('Potential unsupported claim: '+phrase);
  }
  return {nonempty:true,reviewWarnings:warnings,
    note:'These are screening warnings only, NOT factual-accuracy scores or certification'};
}

async function runEvaluation({mode='check',limit=CASES.length,env=process.env,
  fetchImpl=globalThis.fetch,outputRoot=OUTPUT_ROOT,writeFiles=true}={}){
  if(!['check','dry-run','live'].includes(mode))throw new Error('Invalid evaluation mode');
  if(!Number.isInteger(limit)||limit<1||limit>CASES.length)throw new Error('Invalid limit');
  // Credential guard precedes file creation and all provider calls.
  const live=mode==='live'?guardedLiveConfig(env):null;
  const compiled=await compileCases(limit);
  const records=[];
  // Checkpoint completed LIVE reports after each request, so interruptions
  // cannot erase an expensive multi-report evaluation run.
  const runDir=writeFiles&&mode!=='check'?outputFolder(outputRoot):null;
  const manifest={
    schemaVersion:1,
    status:mode==='live'?'LIVE_IN_PROGRESS':mode==='dry-run'?'DRY_RUN_NO_MODEL_OUTPUT':'INPUTS_VALIDATED_NO_MODEL_OUTPUT',
    mode,model:live?.model||env.PATHFINDER_EVAL_MODEL||DEFAULT_MODEL,
    endpoint:mode==='live'?ANTHROPIC_ENDPOINT:null,
    realModelOutputs:0,humanReviewedOutputs:0,fullyCertified:false,
    keyUsed:'dedicated evaluation key only (never stored)',
    caveats:['Input-contract checks are not report-quality certification.',
      'Automatic warnings are not proof that a claim is supported.',
      'A human must compare every generated output against its fictional lesson notes.'],
    cases:records
  };
  if(runDir){
    manifest.outputDirectory=runDir;
    if(live)writeBundle(runDir,manifest);
  }
  for(const {fixture,prompt,promptHash} of compiled){
    const row={caseId:fixture.id,protocol:fixture.protocol,scenario:fixture.scenario,
      rating:fixture.generation.rating||null,preplyModule:fixture.generation.preplyModule,
      fictionalOnly:true,evidence:fixture.evidence,serverPromptSha256:promptHash,
      status:mode==='live'?'PENDING':mode==='dry-run'?'DRY_RUN':'INPUT_VALIDATED',
      humanReview:'PENDING'};
    if(live){
      const result=await callAnthropic({systemPrompt:prompt.systemPrompt,userMessage:prompt.userMessage,
        key:live.key,model:live.model,fetchImpl});
      row.status=result.status;
      row.stopReason=result.stopReason||null;
      row.elapsedMs=result.elapsedMs;
      if(result.usage)row.usage=result.usage;
      if(result.text){
        row.report=result.text;
        row.automatedChecks=automatedChecks(result.text,fixture);
      }else row.providerError=result.reason||'No report';
    }
    records.push(row);
    if(row.status==='GENERATED')manifest.realModelOutputs++;
    if(runDir&&live)writeBundle(runDir,manifest);
  }
  if(live)manifest.status='LIVE_UNREVIEWED';
  if(runDir)writeBundle(runDir,manifest);
  return manifest;
}

function help(){
  return [
    'Pathfinder V2 protocol output evaluation — fictional data only',
    '  node tools/evaluate-protocol-outputs.cjs --check                 (default: NO network)',
    '  node tools/evaluate-protocol-outputs.cjs --dry-run [--limit N]   (NO network; produces review bundle)',
    '  node tools/evaluate-protocol-outputs.cjs --live --limit N        (PAID real Anthropic calls; count required)',
    'Live mode requires BOTH PATHFINDER_EVAL_ALLOW_LIVE=YES and',
    'PATHFINDER_EVAL_ANTHROPIC_API_KEY=<dedicated nonproduction key>.',
    'PATHFINDER_EVAL_MODEL can override the production-aligned default '+DEFAULT_MODEL+'.',
    'No production license, API token, webhook, account, or customer transcript is used.'
  ].join('\n');
}
async function main(){
  const flags=parseArgs(process.argv.slice(2));
  if(flags.help){console.log(help());return;}
  const result=await runEvaluation(flags);
  console.log('EVAL_STATUS='+result.status+'; FIXTURES='+result.cases.length+
    '; MODEL_OUTPUTS='+result.realModelOutputs+'; HUMAN_REVIEWED='+result.humanReviewedOutputs);
  if(result.outputDirectory)console.log('EVAL_BUNDLE='+result.outputDirectory);
  if(flags.mode==='live'&&result.realModelOutputs!==flags.limit)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error('EVALUATION_BLOCKED_OR_FAILED: '+e.message);process.exitCode=1;});
module.exports={parseArgs,validateFixtures,compileCases,runEvaluation,guardedLiveConfig,
  callAnthropic,automatedChecks,makeReviewCsv,help,MAX_TOKENS,DEFAULT_MODEL};
