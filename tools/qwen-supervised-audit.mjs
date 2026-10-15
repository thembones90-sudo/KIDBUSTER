// Read-only local Qwen reviewer. The model receives only allowlisted project
// files through narrow tools; it has no shell, write, secrets, or Git tools.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const ROOT=path.resolve(import.meta.dirname,'..');
const MODEL=process.argv[3]||'qwen3-coder:30b';
const API='http://127.0.0.1:11434/api/chat';
const OUT_ROOT=path.join(ROOT,'artifacts','qwen-audits');
const TASKS={
  billing:{
    files:['api/payment-webhook.js','api/create-checkout-session.js','api/_lib/subscription-lifecycle.js','api/_lib/subscription-reconciliation.js','api/_lib/providers/lemonsqueezy.js','api/_lib/license-service.js','tests/test-atomic-payment-webhook.cjs','tests/test-billing-recovery-refunds.cjs','tests/test-subscription-lifecycle.cjs','tests/test-reconciliation-preview.cjs','tests/test-monetization-e2e.cjs'],
    request:'Audit the Lemon Squeezy subscription state machine. Find only evidence-backed gaps involving reordered or duplicate events, identity mismatch, cancellation grace, payment recovery, refunds, reconciliation, locks, and interrupted writes.'
  },
  security:{
    files:['api/license-signup.js','api/license-recover.js','api/license-verify.js','api/create-checkout-session.js','api/generate.js','api/krisp-session.js','api/krisp-webhook.js','api/_lib/account-verification.js','api/_lib/license-service.js','api/_lib/licensing.js','api/_lib/kv-client.js','api/_lib/krisp-token.js','tests/test-license-routes.cjs','tests/test-checkout-ownership.cjs','tests/test-atomic-generation-quota.cjs','tests/test-krisp-queue-reliability.cjs'],
    request:'Audit account recovery, checkout ownership, enumeration defenses, atomic quota enforcement, webhook replay handling, and Krisp isolation. Prioritize exploitable or data-loss defects, not style.'
  },
  protocols:{
    files:['index.html','api/_lib/server-generation.js','api/generate.js','api/_lib/licensing.js','tests/test-classic-protocol.cjs','tests/test-blitz.cjs','tests/test-beida.cjs','tests/test-of-protocol.cjs','tests/test-preply.cjs','tests/test-length-format.cjs','tests/test-server-controlled-generation.cjs','tests/test-browser-smoke.cjs'],
    request:'Audit parity across MA, MS, FAIRY, BLITZ, BEIDA, OF, and PREPLY: frontend choice, server validation, entitlement classification, prompt construction, parsing/validation, theme behavior, and regression coverage.'
  },
  tests:{
    files:['api/generate.js','api/payment-webhook.js','api/krisp-session.js','api/krisp-webhook.js','api/_lib/kv-client.js','api/_lib/license-service.js','api/_lib/subscription-lifecycle.js','tests/test-atomic-generation-quota.cjs','tests/test-atomic-payment-webhook.cjs','tests/test-krisp-queue-reliability.cjs','tests/test-monetization-e2e.cjs','tests/test-license-routes.cjs'],
    request:'Find high-value missing tests for concurrency, malformed input, partial writes, stale events, boundary sizes, lock expiry, compensation failure, and retry recovery. Do not repeat cases already covered.'
  },
  ui:{
    files:['index.html','tests/test-browser-smoke.cjs','tests/test-customer-copy.cjs','V2-READABILITY-CONTRACT.md','V2-FIVEPART-VISUAL-REPORT-2026-10-12.md'],
    request:'Review the current post-handoff UI/onboarding diff for factual copy errors, broken accessibility semantics, interaction regressions, and missing tests. Do not recommend aesthetic preferences without evidence.',
    diffBase:'4044c11'
  }
};

function safeTaskFile(task,relative){
  if(typeof relative!=='string'||!task.files.includes(relative))throw new Error('File is not allowlisted');
  const absolute=path.resolve(ROOT,relative);
  if(!absolute.startsWith(ROOT+path.sep))throw new Error('Path escaped repository');
  return absolute;
}
function numberedLines(task,args){
  const absolute=safeTaskFile(task,args.path);
  const lines=fs.readFileSync(absolute,'utf8').split(/\r?\n/);
  const start=Math.max(1,Number(args.start)||1);
  const end=Math.min(lines.length,Number(args.end)||Math.min(lines.length,start+219));
  if(end<start||end-start>299)throw new Error('Request at most 300 consecutive lines');
  return lines.slice(start,end).map((line,index)=>`${start+index}: ${line}`).join('\n');
}
function search(task,args){
  if(typeof args.pattern!=='string'||!args.pattern||args.pattern.length>120)throw new Error('Invalid search pattern');
  const needle=args.pattern.toLowerCase();
  const hits=[];
  for(const relative of task.files){
    const lines=fs.readFileSync(safeTaskFile(task,relative),'utf8').split(/\r?\n/);
    lines.forEach((line,index)=>{if(hits.length<80&&line.toLowerCase().includes(needle))hits.push(`${relative}:${index+1}: ${line.trim()}`);});
  }
  return hits.join('\n')||'No matches';
}
function diff(task){
  if(!task.diffBase)return 'No diff is available for this task';
  return execFileSync('git',['diff','--unified=3',`${task.diffBase}..HEAD`,'--',...task.files],{cwd:ROOT,encoding:'utf8',maxBuffer:2_000_000}).slice(0,60000);
}

const tools=[
  {type:'function',function:{name:'read_lines',description:'Read an allowlisted file with exact line numbers, maximum 300 lines.',parameters:{type:'object',properties:{path:{type:'string'},start:{type:'integer'},end:{type:'integer'}},required:['path','start','end']}}},
  {type:'function',function:{name:'search',description:'Case-insensitive literal search across allowlisted files.',parameters:{type:'object',properties:{pattern:{type:'string'}},required:['pattern']}}},
  {type:'function',function:{name:'read_diff',description:'Read the bounded current diff when this task provides one.',parameters:{type:'object',properties:{}}}}
];
async function chat(messages, allowTools=true){
  const payload={model:MODEL,messages,stream:false,think:false,keep_alive:'10m',options:{num_ctx:8192,num_predict:900,temperature:0}};
  if(allowTools)payload.tools=tools;
  const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok)throw new Error(`Ollama ${response.status}: ${await response.text()}`);
  return await response.json();
}
async function main(){
  const name=process.argv[2];
  const task=TASKS[name];
  if(!task)throw new Error('Choose one task: '+Object.keys(TASKS).join(', '));
  const messages=[
    {role:'system',content:'You are a skeptical read-only code auditor supervised by another engineer. Use tools for source evidence. Never invent execution, runtime behavior, files, or line numbers. Report findings only when supported. Distinguish confirmed defects from hypotheses. You cannot edit, run shell commands, access secrets, or approve deployment.'},
    {role:'user',content:`${task.request}\n\nAllowed files:\n${task.files.join('\n')}\n\nReturn: (1) confirmed findings ordered by severity with exact file:line evidence and exploit/failure sequence; (2) hypotheses needing runtime verification; (3) non-duplicative test proposals; (4) areas checked with no defect found. If evidence disproves a concern, say so. Do not pad the report.`}
  ];
  const transcript=[];
  let answer='';
  for(let round=0;round<10;round++){
    const result=await chat(messages);
    const message=result.message||{};
    transcript.push({round,message});messages.push(message);
    const calls=Array.isArray(message.tool_calls)?message.tool_calls:[];
    if(!calls.length){answer=message.content||'';break;}
    for(const call of calls){
      let content;
      try{
        if(call.function.name==='read_lines')content=numberedLines(task,call.function.arguments||{});
        else if(call.function.name==='search')content=search(task,call.function.arguments||{});
        else if(call.function.name==='read_diff')content=diff(task);
        else throw new Error('Unknown tool');
      }catch(error){content='TOOL ERROR: '+error.message;}
      messages.push({role:'tool',name:call.function.name,content});
      transcript.push({tool:call.function.name,args:call.function.arguments,contentLength:content.length});
    }
  }
  if(!answer){
    messages.push({role:'user',content:'Evidence gathering is over. Produce the requested final report using only evidence already in this conversation. Do not claim tests were run or code was executed. Omit any concern that lacks exact source evidence.'});
    const result=await chat(messages,false);
    answer=result.message?.content||'';
    transcript.push({round:'forced-synthesis',message:result.message||{}});
  }
  if(!answer)throw new Error('Qwen did not produce a final report within the supervised round limit');
  fs.mkdirSync(OUT_ROOT,{recursive:true});
  const modelSlug=MODEL.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toUpperCase();
  const output=path.join(OUT_ROOT,`PATHFINDER-QWEN-${modelSlug}-${name.toUpperCase()}-AUDIT.json`);
  fs.writeFileSync(output,JSON.stringify({task:name,model:MODEL,createdAt:new Date().toISOString(),answer,transcript},null,2));
  console.log(JSON.stringify({task:name,output,answer},null,2));
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
