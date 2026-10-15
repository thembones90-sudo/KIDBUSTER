// Temporary Upstash guest, synthetic V2 manual key, true multi-process race.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const base=path.resolve(here,'../..');
const md=fs.readFileSync(path.join(base,'.v2-local','upstash-guest-redis-instructions.md'),'utf8');
const endpoint=md.match(/^\*\*Endpoint:\*\*\s*(https:\/\/\S+)\s*$/m)?.[1];
const token=md.match(/^\*\*Token:\*\*\s*(\S+)\s*$/m)?.[1];
if(!endpoint || !token || !/^https:\/\/[a-z0-9.-]+\.upstash\.io\/?$/.test(endpoint)){
  console.log('BLOCKED: guest-only credentials missing');process.exit(1);
}
delete process.env.KIDBUSTER_TEST_KV;
delete process.env.PATHFINDER_V2_LOCAL_DB;
delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
process.env.KV_REST_API_URL=endpoint;process.env.KV_REST_API_TOKEN=token;
const {createManualProLicense}=await import('../../api/_lib/license-service.js');
const {getLicense,getManualClaim}=await import('../../api/_lib/licensing.js');
const {kv}=await import('../../api/_lib/kv-client.js');
let key=null;
async function one(i){
 return await new Promise(resolve=>{
  const work=spawn(process.execPath,[path.join(here,'guest-activation-worker.mjs'),key,'test-browser-'+i],{
   cwd:base,env:{...process.env},stdio:['ignore','pipe','ignore']});
  let answer='';work.stdout.on('data',b=>answer+=b.toString('utf8'));
  work.on('close',()=>resolve(answer.trim()));work.on('error',()=>resolve('ERROR'));
 });
}
try{
 const created=await createManualProLicense({email:'',days:30,note:'SYNTHETIC Upstash 3-day isolated DB test'});
 key=created.licenseKey;
 const statuses=await Promise.all(Array.from({length:20},(_,i)=>one(i)));
 const record=await getLicense(key);
 const marker=await getManualClaim(key);
 const winner=statuses.filter(x=>x==='WIN').length;
 const loser=statuses.filter(x=>x==='LOSE').length;
 const allowedFirst=winner===1 && loser===19 && record.activationPending===false &&
   record.claimedInstallationId===marker.installationId && marker.expiresAt===record.expiresAt;
 const expiry=Math.abs(Date.parse(record.expiresAt)-Date.now()-30*86400000)<30000;
 console.log((allowedFirst?'PASS':'FAIL')+' 20 independent processes claim a real V2 manual key: 1 winner, 19 rejected');
 console.log((expiry?'PASS':'FAIL')+' winning timestamp produces 30-day expiry without restart');
 const subsequent=await Promise.all(Array.from({length:8},(_,i)=>one(i+100)));
 const noSteal=subsequent.every(x=>x==='LOSE') &&
   (await getLicense(key)).expiresAt===record.expiresAt;
 console.log((noSteal?'PASS':'FAIL')+' late browsers cannot steal or extend expiry');
 console.log('SUMMARY '+[allowedFirst,expiry,noSteal].filter(Boolean).length+'/3 passed');
 if(!allowedFirst||!expiry||!noSteal)process.exitCode=1;
}catch(e){
 console.log('FAILURE_CLASS='+e?.constructor?.name);process.exitCode=1;
}finally{
 if(key){for(const name of ['license:'+key,'manualClaim:'+key]){try{await kv.del(name)}catch{}}}
}
