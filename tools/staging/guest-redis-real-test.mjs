// Test-only distributed Redis operations. NO real customers/secrets/production.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const base=path.resolve(here,'../..');
const instructions=fs.readFileSync(path.join(base,'.v2-local','upstash-guest-redis-instructions.md'),'utf8');
const endpoint=instructions.match(/^\*\*Endpoint:\*\*\s*(https:\/\/\S+)\s*$/m)?.[1];
const token=instructions.match(/^\*\*Token:\*\*\s*(\S+)\s*$/m)?.[1];
if(!endpoint||!token){console.log('BLOCKED: temporary test Redis details cannot be parsed');process.exit(1);}
if(!/^https:\/\/[a-z0-9.-]+\.upstash\.io\/?$/.test(endpoint)){console.log('BLOCKED: URL is not an Upstash HTTPS endpoint');process.exit(1);}
delete process.env.KIDBUSTER_TEST_KV;delete process.env.PATHFINDER_V2_LOCAL_DB;
process.env.KV_REST_API_URL=endpoint;
process.env.KV_REST_API_TOKEN=token;
process.env.PAYMENT_PROVIDER='lemonsqueezy';
delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
const {kv,acquirePaymentLock,releasePaymentLock}=await import('../../api/_lib/kv-client.js');
const prefix='v2-guest-test:'+crypto.randomBytes(9).toString('hex');
const cleanup=new Set();
const results=[];
function check(name,passed){results.push({name,passed:!!passed});console.log((passed?'PASS':'FAIL')+' '+name);}
async function spawnWorker(key,owner){
  return await new Promise(resolve=>{
    const job=spawn(process.execPath,[path.join(here,'guest-redis-worker.mjs'),key,owner],
      {cwd:base,env:{...process.env},stdio:['ignore','pipe','ignore']});
    let out='';job.stdout.on('data',d=>out+=d.toString('utf8'));
    job.on('close',()=>resolve(out.trim()));
    job.on('error',()=>resolve('ERROR'));
  });
}
try{
 const first=prefix+':first';cleanup.add(first);
 const a=await acquirePaymentLock(first,'owner-A',60);
 const b=await acquirePaymentLock(first,'owner-B',60);
 check('real Redis SET NX EX elects only the first writer',a===true&&b===false);
 const wrong=await releasePaymentLock(first,'owner-B');
 const persisted=await kv.get(first);
 check('wrong lock token cannot release owner-A',wrong===false&&persisted==='owner-A');
 const good=await releasePaymentLock(first,'owner-A');
 check('real Upstash Lua releases rightful lock',good===true&&await kv.get(first)===null);
 const concurrent=prefix+':concurrent';cleanup.add(concurrent);
 const race=await Promise.all(Array.from({length:16},(_,i)=>spawnWorker(concurrent,'browser-'+i)));
 check('16 independent Node processes elect exactly ONE Redis lock holder',
   race.filter(x=>x==='WIN').length===1 && race.filter(x=>x==='LOSE').length===15);
 const expiry=prefix+':expiry';cleanup.add(expiry);
 const s=await acquirePaymentLock(expiry,'old',2);
 await new Promise(resolve=>setTimeout(resolve,2350));
 const newer=await acquirePaymentLock(expiry,'new',6);
 const staleRelease=await releasePaymentLock(expiry,'old');
 const validRelease=await releasePaymentLock(expiry,'new');
 check('expired lock may be reclaimed, stale worker cannot delete its successor',
   s===true&&newer===true&&staleRelease===false&&validRelease===true);
}catch(e){
 check('no network/SDK failure while performing real Redis checks',false);
 console.log('FAILURE_CLASS='+e?.constructor?.name);
}finally{
 for(const key of cleanup){
   try{await kv.del(key)}catch{}
 }
}
console.log('SUMMARY '+results.filter(x=>x.passed).length+'/'+results.length+' passed');
if(results.some(x=>!x.passed))process.exitCode=1;
