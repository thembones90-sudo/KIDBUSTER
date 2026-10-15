// Real test Upstash Redis, isolated synthetic-only signed webhook concurrency.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const md=fs.readFileSync(path.join(root,'.v2-local','upstash-guest-redis-instructions.md'),'utf8');
const url=md.match(/^\*\*Endpoint:\*\*\s*(https:\/\/\S+)\s*$/m)?.[1];
const token=md.match(/^\*\*Token:\*\*\s*(\S+)\s*$/m)?.[1];
if(!url||!token||!/^https:\/\/[a-z0-9.-]+\.upstash\.io\/?$/.test(url)){
 console.log('BLOCKED: guest credentials unavailable');process.exit(1);
}
delete process.env.KIDBUSTER_TEST_KV;
delete process.env.PATHFINDER_V2_LOCAL_DB;
delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
process.env.KV_REST_API_URL=url;process.env.KV_REST_API_TOKEN=token;
process.env.LEMONSQUEEZY_WEBHOOK_SECRET='V2_Synthetic_Only_'+crypto.randomBytes(16).toString('hex');
process.env.PAYMENT_PROVIDER='lemonsqueezy';
const {getOrCreateFreeLicense}=await import('../../api/_lib/license-service.js');
const {getLicense}=await import('../../api/_lib/licensing.js');
const {kv}=await import('../../api/_lib/kv-client.js');
let key=null;
const nonce=crypto.randomBytes(7).toString('hex'), email='v2-test-'+nonce+'@example.invalid';
const customer='V2_TEMP_CUST_'+nonce,subscription='V2_TEMP_SUB_'+nonce;
const cleanup=new Set();
const checks=[];
function check(label,ok){checks.push(Boolean(ok));console.log((ok?'PASS ':'FAIL ')+label)}
function fixture(type,minute,endsAt){
 const stamp=new Date(Date.now()+minute*60000).toISOString();
 return {meta:{event_name:type,custom_data:{license_key:key}},
   data:{id:subscription,type:'subscriptions',attributes:{
     customer_id:customer,user_email:email,
     created_at:stamp,updated_at:stamp,ends_at:endsAt||null,
     status:type==='subscription_cancelled'?'cancelled':'active',
     order_id:'SYNTHETIC_ORDER_'+nonce
   }}};
}
async function run(payload){
 const raw=Buffer.from(JSON.stringify(payload));
 const proc=spawn(process.execPath,[path.join(here,'guest-webhook-worker.mjs'),raw.toString('base64')],{
   cwd:root,env:{...process.env},stdio:['ignore','pipe','ignore']});
 return await new Promise(resolve=>{
  let content='';proc.stdout.on('data',b=>content+=b.toString());
  proc.on('close',()=>resolve(content.trim()));
  proc.on('error',()=>resolve('ERROR'));
 });
}
try{
 key=await getOrCreateFreeLicense(email);
 cleanup.add('license:'+key);cleanup.add('email:'+email);cleanup.add('paymentCustomer:'+customer);
 const creation=fixture('subscription_created',-5);
 const hash=crypto.createHash('sha256').update(Buffer.from(JSON.stringify(creation))).digest('hex');
 cleanup.add('webhookSeen:'+hash);
 const responses=await Promise.all(Array.from({length:12},()=>run(creation)));
 const types=responses.reduce((o,v)=>(o[v]=(o[v]||0)+1,o),{});
 const license=await getLicense(key);
 check('12 independent Node processes race signed subscription_created without error',
   responses.every(x=>x.startsWith('200:')||x.startsWith('503:')));
 check('signed concurrent deliveries activate exactly ONE customer subscription',
   license?.plan==='pro' && license.paymentSubscriptionId===subscription &&
   license.paymentCustomerId===customer);
 check('at least one signed delivery commits and others retry or deduplicate',
   responses.some(x=>x==='200:OK') && (await kv.get('webhookSeen:'+hash))===true);
 const again=await run(creation);
 check('signed replay after commit returns duplicate instead of reprocessing',again==='200:DUP');
 const cancel=fixture('subscription_cancelled',-4,new Date(Date.now()+5*86400000).toISOString());
 const cancelHash=crypto.createHash('sha256').update(Buffer.from(JSON.stringify(cancel))).digest('hex');
 cleanup.add('webhookSeen:'+cancelHash);
 const cancelRes=await run(cancel);
 const updated=await getLicense(key);
 check('signed cancellation on real Redis retains Pro until paid-through date',
    cancelRes==='200:OK'&&updated.subscriptionStatus==='cancelled'&&updated.plan==='pro');
 console.log('SUMMARY '+checks.filter(Boolean).length+'/'+checks.length+' passed');
 if(checks.some(x=>!x))process.exitCode=1;
}catch(e){
 console.log('FAILURE_CLASS='+e?.constructor?.name);process.exitCode=1;
}finally{
 for(const entry of cleanup){try{await kv.del(entry)}catch{}}
}
