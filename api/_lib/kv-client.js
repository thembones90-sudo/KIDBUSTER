// Thin KV adapter.
//
// Production uses Vercel KV exactly as before. Tests opt into the in-memory
// implementation by setting KIDBUSTER_TEST_KV=1 before importing modules that
// use KV. This keeps the test double in committed source instead of relying on
// a hand-edited node_modules/@vercel/kv stub.

import { kv as vercelKv } from '@vercel/kv';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// V2 LOCAL ONLY. Never use production KV credentials in the isolated preview.
// Records and the owner key live under a gitignored A: directory, not Vercel.
const localDbPath = process.env.PATHFINDER_V2_LOCAL_DB || '';
const useLocal = localDbPath !== '' && process.env.KIDBUSTER_TEST_KV !== '1';
let localData = {};
if(useLocal){
  if(!/^[A-Z]:\\/i.test(localDbPath)) throw new Error('V2 local KV requires an absolute Windows disk path.');
  mkdirSync(dirname(localDbPath), {recursive:true});
  try{localData = JSON.parse(readFileSync(localDbPath,'utf8'));}catch(e){
    if(e.code !== 'ENOENT') throw e;
  }
}
function persistLocal(){
  const staging = localDbPath + '.tmp';
  writeFileSync(staging, JSON.stringify(localData), {mode:0o600});
  renameSync(staging,localDbPath);
}
const localKv = {
  async get(key){
    const item=localData[key];
    if(!item) return null;
    if(item.until != null && item.until <= Date.now()){
      delete localData[key];persistLocal();return null;
    }
    return item.value;
  },
  async set(key,value,options){
    if(options?.nx === true && Object.hasOwn(localData,key)){
      const existing=localData[key];
      if(existing.until == null || existing.until > Date.now()) return null;
    }
    const until=Number.isSafeInteger(options?.pxat) ? options.pxat :
      Number.isInteger(options?.ex) && options.ex > 0 ? Date.now() + options.ex*1000 : null;
    localData[key]={value,until};persistLocal();return 'OK';
  },
  async del(key){const found=Object.hasOwn(localData,key);delete localData[key];persistLocal();return found?1:0;},
  async getdel(key){const val=await this.get(key);delete localData[key];persistLocal();return val;},
  async incr(key){const current=await this.get(key);const next=(Number(current)||0)+1;await this.set(key,next);return next;},
  async expire(key,seconds){
    if(!localData[key])return 0;
    localData[key].until=Date.now()+seconds*1000;persistLocal();return 1;
  },
  async scan(cursor,options){return scanKeys(Object.keys(localData),cursor,options);}
};

// Bounded SCAN double for owner audits, shaped like Redis: [nextCursor, keys],
// cursor '0' when finished. Only trailing-* prefix patterns are supported.
function scanKeys(allKeys,cursor,{match='*',count=100}={}){
  const prefix=String(match).replace(/\*$/,'');
  const keys=allKeys.filter(key=>key.startsWith(prefix)).sort();
  const start=Number(cursor)||0;
  const next=start+count>=keys.length?'0':String(start+count);
  return [next,keys.slice(start,start+count)];
}

function localCounterReservation(key,limit,ttlSeconds){
  const item=localData[key];
  if(item?.until && item.until<=Date.now()) delete localData[key];
  const current=Number(localData[key]?.value)||0;
  if(current>=limit)return null;
  const next=current+1;
  localData[key]={value:next,until:ttlSeconds>0?Date.now()+ttlSeconds*1000:null};
  persistLocal();return next;
}
function localCounterRelease(key){
  const current=Number(localData[key]?.value)||0;
  if(current<=1){delete localData[key];persistLocal();return 0;}
  localData[key].value=current-1;persistLocal();return current-1;
}

let memoryStore = new Map();
let outage = false;

function failIfOutage(){
  if(outage){
    throw new Error('Simulated KV outage');
  }
}

const memoryExpiry = new Map();
const memoryKv = {
  async get(key){
    failIfOutage();
    const expires=memoryExpiry.get(key);
    if(expires !== undefined && expires <= Date.now()){
      memoryExpiry.delete(key);memoryStore.delete(key);
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  async set(key, value, options){
    failIfOutage();
    // No await between checking and setting: this is the single-process
    // in-memory equivalent of Redis atomic SET NX.
    const priorExpiry=memoryExpiry.get(key);
    if(priorExpiry !== undefined && priorExpiry <= Date.now()){
      memoryExpiry.delete(key);memoryStore.delete(key);
    }
    if(options?.nx === true && memoryStore.has(key)) return null;
    memoryStore.set(key, value);
    if(Number.isSafeInteger(options?.pxat)) memoryExpiry.set(key,options.pxat);
    else if(Number.isInteger(options?.ex) && options.ex>0)
      memoryExpiry.set(key,Date.now()+options.ex*1000);
    else memoryExpiry.delete(key);
    return 'OK';
  },
  async del(key){
    failIfOutage();
    memoryExpiry.delete(key);
    return memoryStore.delete(key) ? 1 : 0;
  },
  async getdel(key){
    failIfOutage();
    const expires = memoryExpiry.get(key);
    if(expires !== undefined && expires <= Date.now()){
      memoryStore.delete(key);memoryExpiry.delete(key);return null;
    }
    if(!memoryStore.has(key)) return null;
    const value = memoryStore.get(key);
    memoryStore.delete(key);
    memoryExpiry.delete(key);
    return value;
  },
  async incr(key){
    failIfOutage();
    const current = memoryStore.has(key) ? Number(memoryStore.get(key)) : 0;
    const next = current + 1;
    memoryStore.set(key, next);
    return next;
  },
  async expire(key,seconds){
    failIfOutage();
    if(!memoryStore.has(key))return 0;
    memoryExpiry.set(key,Date.now()+seconds*1000);
    return 1;
  },
  async scan(cursor,options){
    failIfOutage();
    return scanKeys([...memoryStore.keys()],cursor,options);
  }
};

export const kv = process.env.KIDBUSTER_TEST_KV === '1' ? memoryKv : (useLocal ? localKv : vercelKv);

// SET NX EX is atomic on Redis/Upstash. Expiry is a recovery mechanism after
// a worker crashes. Only the holder's random token may release a lock;
// Redis compares + deletes atomically in ONE Lua script.
export async function acquirePaymentLock(key, token, ttlSeconds = 60){
  const reply = await kv.set(key,token,{nx:true,ex:ttlSeconds});
  return reply === 'OK' || reply === true;
}
// ---- Atomic email-index ownership ----
// Moves an email index from `expected` to `next` in ONE atomic step, so no
// webhook, signup, recovery or owner repair running on another worker can
// interleave between the check and the write. The current holder's license
// record is read inside the same step:
//   mode 'unpaid' - replace only if that record is not paid or issued
//                   (Pro, a payment customer/subscription id, or manual);
//   mode 'stale'  - replace only if that record no longer exists;
//   mode 'nosub'  - replace unless that record is a Pro provider subscription
//                   (manual key re-issue may move a Free or older manual link).
// expected === null means "only if the index is absent" (mode ignored).
// Returns { swapped, current } where current is the index value seen.
// An unreadable holder record is treated as paid: refuse, never overwrite.
export const GUARDED_INDEX_LUA=[
  'local cur=redis.call("GET",KEYS[1])',
  'if ARGV[1]=="" then',
  ' if cur then return {0,cur} end',
  'else',
  ' if cur~=ARGV[1] then return {0,cur or ""} end',
  ' local rec=redis.call("GET",KEYS[2])',
  ' if ARGV[3]=="stale" then',
  '  if rec then return {0,cur} end',
  ' elseif rec then',
  '  local ok,lic=pcall(cjson.decode,rec)',
  '  if not ok or type(lic)~="table" then return {0,cur} end',
  '  local function present(v) return v~=nil and v~=cjson.null and v~=false and v~="" end',
  '  if ARGV[3]=="nosub" then',
  '   if lic.plan=="pro" and (present(lic.paymentSubscriptionId) or lic.source=="subscription") then return {0,cur} end',
  '  elseif lic.plan=="pro" or present(lic.paymentCustomerId) or present(lic.paymentSubscriptionId) or lic.manual==true then return {0,cur} end',
  ' end',
  'end',
  'redis.call("SET",KEYS[1],ARGV[2])',
  'return {1,cur or ""}'
].join('\n');

function guardedSwapLocally(read,write,indexKey,licenseKeyOfExpected,expected,next,mode){
  // Single-process stores: no await between check and write = atomic.
  const cur=read(indexKey);
  if(expected===null){ if(cur!==null&&cur!==undefined)return {swapped:false,current:cur}; }
  else{
    if(cur!==expected)return {swapped:false,current:cur??null};
    const rec=read(licenseKeyOfExpected);
    if(mode==='stale'){ if(rec!==null&&rec!==undefined)return {swapped:false,current:cur}; }
    else if(rec!==null&&rec!==undefined){
      if(typeof rec!=='object')return {swapped:false,current:cur};
      if(mode==='nosub'){ if(rec.plan==='pro'&&(rec.paymentSubscriptionId||rec.source==='subscription'))return {swapped:false,current:cur}; }
      else if(rec.plan==='pro'||rec.paymentCustomerId||rec.paymentSubscriptionId||rec.manual===true)return {swapped:false,current:cur};
    }
  }
  write(indexKey,next);
  return {swapped:true,current:cur??null};
}

export async function guardedEmailIndexSwap(indexKey,licenseRecordKeyOfExpected,expected,next,mode='unpaid'){
  if(!indexKey||!next||(expected!==null&&!licenseRecordKeyOfExpected))throw new Error('guardedEmailIndexSwap: invalid arguments');
  if(process.env.KIDBUSTER_TEST_KV === '1'){
    failIfOutage();
    const read=k=>{const e=memoryExpiry.get(k);if(e&&e<=Date.now()){memoryExpiry.delete(k);memoryStore.delete(k);}return memoryStore.has(k)?memoryStore.get(k):null;};
    return guardedSwapLocally(read,(k,v)=>{memoryStore.set(k,v);memoryExpiry.delete(k);},indexKey,licenseRecordKeyOfExpected,expected,next,mode);
  }
  if(useLocal){
    const read=k=>{const i=localData[k];if(!i)return null;if(i.until&&i.until<=Date.now()){delete localData[k];return null;}return i.value;};
    const result=guardedSwapLocally(read,(k,v)=>{localData[k]={value:v,until:null};},indexKey,licenseRecordKeyOfExpected,expected,next,mode);
    if(result.swapped)persistLocal();
    return result;
  }
  let reply;
  try{
    reply=await vercelKv.eval(GUARDED_INDEX_LUA,[indexKey,licenseRecordKeyOfExpected||indexKey],[expected??'',next,mode]);
  }catch(err){
    // Fail SAFE: never overwrite and never throw. A paid record is always
    // written before its email is claimed, so a failed claim only leaves the
    // email unlinked (reported by the owner audit) - a payment webhook still
    // activates Pro instead of failing and being retried forever.
    console.error('kv guarded email-index swap failed:', err?.message || 'unknown error');
    return {swapped:false,current:null,error:true};
  }
  const swapped=Array.isArray(reply)&&Number(reply[0])===1;
  const current=Array.isArray(reply)&&reply[1]!==''&&reply[1]!==null&&reply[1]!==undefined?String(reply[1]):null;
  return {swapped,current};
}

export async function releasePaymentLock(key,token){
  if(process.env.KIDBUSTER_TEST_KV === '1'){
    failIfOutage();
    if(await memoryKv.get(key)!==token)return false;
    await memoryKv.del(key);return true;
  }
  if(useLocal){
    const item=localData[key];
    if(!item || (item.until && item.until<=Date.now()) || item.value!==token)return false;
    delete localData[key];persistLocal();return true;
  }
  const result=await vercelKv.eval(
    'if redis.call("GET",KEYS[1]) == ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end',
    [key],[token]);
  return Number(result)===1;
}

// Opaque generation request markers contain no lesson or report content.
export async function beginGenerationRequest(key,token,ttlSeconds=900){
  const reply=await kv.set(key,'running:'+token,{nx:true,ex:ttlSeconds});
  if(reply==='OK'||reply===true)return {acquired:true,state:'running'};
  const existing=await kv.get(key);
  return {acquired:false,state:String(existing||'').startsWith('completed')?'completed':'running'};
}
export async function completeGenerationRequest(key,token,ttlSeconds=86400){
  const expected='running:'+token;
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();if(await memoryKv.get(key)!==expected)return false;
    await memoryKv.set(key,'completed',{ex:ttlSeconds});return true;
  }
  if(useLocal){
    const item=localData[key];
    if(!item||(item.until&&item.until<=Date.now())||item.value!==expected)return false;
    localData[key]={value:'completed',until:Date.now()+ttlSeconds*1000};persistLocal();return true;
  }
  return Number(await vercelKv.eval(
    'if redis.call("GET",KEYS[1])~=ARGV[1] then return 0 end; redis.call("SET",KEYS[1],"completed","EX",ARGV[2]); return 1',
    [key],[expected,String(ttlSeconds)]))===1;
}
export async function releaseGenerationRequest(key,token){
  return releasePaymentLock(key,'running:'+token);
}

// Atomically reserve one bounded use. A null result means the limit was
// already reached. The production implementation is one Redis Lua command,
// so concurrent serverless workers cannot all pass a read-then-increment gap.
export async function reserveBoundedCounter(key,limit,ttlSeconds=0){
  if(!Number.isInteger(limit)||limit<1)throw new Error('Counter limit must be a positive integer');
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();
    const expires=memoryExpiry.get(key);
    if(expires&&expires<=Date.now()){memoryExpiry.delete(key);memoryStore.delete(key);}
    const current=Number(memoryStore.get(key))||0;
    if(current>=limit)return null;
    const next=current+1;memoryStore.set(key,next);
    if(ttlSeconds>0)memoryExpiry.set(key,Date.now()+ttlSeconds*1000);
    return next;
  }
  if(useLocal)return localCounterReservation(key,limit,ttlSeconds);
  const result=await vercelKv.eval(
    'local n=tonumber(redis.call("GET",KEYS[1]) or "0"); if n>=tonumber(ARGV[1]) then return -1 end; n=redis.call("INCR",KEYS[1]); if tonumber(ARGV[2])>0 then redis.call("EXPIRE",KEYS[1],ARGV[2]) end; return n',
    [key],[String(limit),String(ttlSeconds)]);
  return Number(result)<0?null:Number(result);
}

// Fixed-window counter: ONE atomic step increments and makes sure the key has
// an expiry. The old pattern (INCR, then EXPIRE only when the result was 1)
// left a counter with no expiry forever if the worker died between the two
// calls, which silently locked that email or IP out for good. The Redis script
// also repairs any such already-orphaned counter (TTL < 0) on its next hit.
// The window is anchored at the first hit and is NOT extended by later hits.
export async function incrementWindowCounter(key,ttlSeconds){
  if(!Number.isInteger(ttlSeconds)||ttlSeconds<1)throw new Error('Window TTL must be a positive integer');
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();
    const expires=memoryExpiry.get(key);
    if(expires&&expires<=Date.now()){memoryExpiry.delete(key);memoryStore.delete(key);}
    const next=(Number(memoryStore.get(key))||0)+1;
    memoryStore.set(key,next);
    if(next===1||!memoryExpiry.has(key))memoryExpiry.set(key,Date.now()+ttlSeconds*1000);
    return next;
  }
  if(useLocal){
    const item=localData[key];
    if(item?.until&&item.until<=Date.now())delete localData[key];
    const cur=localData[key];
    const next=(Number(cur?.value)||0)+1;
    const until=(next===1||!cur?.until)?Date.now()+ttlSeconds*1000:cur.until;
    localData[key]={value:next,until};persistLocal();return next;
  }
  return Number(await vercelKv.eval(
    'local n=redis.call("INCR",KEYS[1]); if n==1 or redis.call("TTL",KEYS[1])<0 then redis.call("EXPIRE",KEYS[1],ARGV[1]) end; return n',
    [key],[String(ttlSeconds)]));
}

// Compensates a reservation only for a generation known not to have produced
// a report. The compare/decrement is atomic and never makes a counter negative.
export async function releaseBoundedCounter(key){
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();
    const current=Number(memoryStore.get(key))||0;
    if(current<=1){memoryStore.delete(key);memoryExpiry.delete(key);return 0;}
    memoryStore.set(key,current-1);return current-1;
  }
  if(useLocal)return localCounterRelease(key);
  return Number(await vercelKv.eval(
    'local n=tonumber(redis.call("GET",KEYS[1]) or "0"); if n<=1 then redis.call("DEL",KEYS[1]); return 0 end; return redis.call("DECR",KEYS[1])',
    [key],[]));
}

// Atomically couples a bounded counter increment to an expiring reservation
// hold. Expired holds are refunded before each new reservation, repairing a
// worker crash without storing report text or lesson data.
export async function reserveCounterHold(key,token,limit,{counterTtlSeconds=0,holdTtlSeconds=900,nowMs=Date.now()}={}){
  const holdsKey=key+':holds';
  if(!Number.isInteger(limit)||limit<1)throw new Error('Counter limit must be a positive integer');
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();
    const holds={...(memoryStore.get(holdsKey)||{})};
    const counterExpiry=memoryExpiry.get(key);
    if(counterExpiry&&counterExpiry<=nowMs){memoryExpiry.delete(key);memoryStore.delete(key);}
    let current=Number(memoryStore.get(key))||0;
    for(const [id,expiresAt] of Object.entries(holds)){
      if(Number(expiresAt)<=nowMs){delete holds[id];current=Math.max(0,current-1);}
    }
    memoryStore.set(key,current);memoryStore.set(holdsKey,holds);
    if(current>=limit)return null;
    current++;memoryStore.set(key,current);holds[token]=nowMs+holdTtlSeconds*1000;
    memoryStore.set(holdsKey,holds);
    if(counterTtlSeconds>0)memoryExpiry.set(key,nowMs+counterTtlSeconds*1000);
    return current;
  }
  if(useLocal){
    const holds={...(localData[holdsKey]?.value||{})};
    if(localData[key]?.until&&localData[key].until<=nowMs)delete localData[key];
    let current=Number(localData[key]?.value)||0;
    for(const [id,expiresAt] of Object.entries(holds)){
      if(Number(expiresAt)<=nowMs){delete holds[id];current=Math.max(0,current-1);}
    }
    localData[key]={value:current,until:counterTtlSeconds>0?nowMs+counterTtlSeconds*1000:null};
    if(current>=limit){localData[holdsKey]={value:holds,until:null};persistLocal();return null;}
    current++;localData[key].value=current;holds[token]=nowMs+holdTtlSeconds*1000;
    localData[holdsKey]={value:holds,until:null};persistLocal();return current;
  }
  const result=await vercelKv.eval(
    'local h=redis.call("HGETALL",KEYS[2]); local n=tonumber(redis.call("GET",KEYS[1]) or "0"); for i=1,#h,2 do if tonumber(h[i+1])<=tonumber(ARGV[4]) then redis.call("HDEL",KEYS[2],h[i]); if n>0 then n=redis.call("DECR",KEYS[1]) end end end; if n>=tonumber(ARGV[1]) then return -1 end; n=redis.call("INCR",KEYS[1]); redis.call("HSET",KEYS[2],ARGV[2],tonumber(ARGV[4])+tonumber(ARGV[3])*1000); if tonumber(ARGV[5])>0 then redis.call("EXPIRE",KEYS[1],ARGV[5]) end; redis.call("EXPIRE",KEYS[2],math.max(tonumber(ARGV[3])*2,86400)); return n',
    [key,holdsKey],[String(limit),token,String(holdTtlSeconds),String(nowMs),String(counterTtlSeconds)]);
  return Number(result)<0?null:Number(result);
}

// Refunds every EXPIRED hold on a counter without reserving anything new.
// Reservation attempts already do this implicitly, but an entitlement check
// that rejects a request at the limit never reaches the reservation step, so
// an abandoned hold sitting exactly at the allowance would otherwise stay
// charged forever. Committed usage has no hold entry and is never refunded.
// Returns the number of holds refunded.
export async function reclaimExpiredCounterHolds(key,{nowMs=Date.now()}={}){
  const holdsKey=key+':holds';
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();
    const holds={...(memoryStore.get(holdsKey)||{})};
    let current=Number(memoryStore.get(key))||0,refunded=0;
    for(const [id,expiresAt] of Object.entries(holds)){
      if(Number(expiresAt)<=nowMs){delete holds[id];refunded++;current=Math.max(0,current-1);}
    }
    if(refunded){memoryStore.set(key,current);memoryStore.set(holdsKey,holds);}
    return refunded;
  }
  if(useLocal){
    const holds={...(localData[holdsKey]?.value||{})};
    let current=Number(localData[key]?.value)||0,refunded=0;
    for(const [id,expiresAt] of Object.entries(holds)){
      if(Number(expiresAt)<=nowMs){delete holds[id];refunded++;current=Math.max(0,current-1);}
    }
    if(refunded){
      localData[key]={value:current,until:localData[key]?.until??null};
      localData[holdsKey]={value:holds,until:null};persistLocal();
    }
    return refunded;
  }
  return Number(await vercelKv.eval(
    'local h=redis.call("HGETALL",KEYS[2]); local n=tonumber(redis.call("GET",KEYS[1]) or "0"); local r=0; for i=1,#h,2 do if tonumber(h[i+1])<=tonumber(ARGV[1]) then redis.call("HDEL",KEYS[2],h[i]); r=r+1; if n>0 then n=redis.call("DECR",KEYS[1]) end end end; return r',
    [key,holdsKey],[String(nowMs)]))||0;
}

export async function commitCounterHold(key,token){
  const holdsKey=key+':holds';
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();const holds={...(memoryStore.get(holdsKey)||{})};
    const found=Object.hasOwn(holds,token);delete holds[token];memoryStore.set(holdsKey,holds);return found;
  }
  if(useLocal){const holds={...(localData[holdsKey]?.value||{})};const found=Object.hasOwn(holds,token);delete holds[token];localData[holdsKey]={value:holds,until:null};persistLocal();return found;}
  return Number(await vercelKv.eval('return redis.call("HDEL",KEYS[1],ARGV[1])',[holdsKey],[token]))===1;
}

export async function releaseCounterHold(key,token){
  const holdsKey=key+':holds';
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();const holds={...(memoryStore.get(holdsKey)||{})};
    if(!Object.hasOwn(holds,token))return Number(await memoryKv.get(key))||0;
    delete holds[token];memoryStore.set(holdsKey,holds);return await releaseBoundedCounter(key);
  }
  if(useLocal){const holds={...(localData[holdsKey]?.value||{})};if(!Object.hasOwn(holds,token))return Number((await localKv.get(key))||0);delete holds[token];localData[holdsKey]={value:holds,until:null};return localCounterRelease(key);}
  return Number(await vercelKv.eval('if redis.call("HDEL",KEYS[2],ARGV[1])==0 then return tonumber(redis.call("GET",KEYS[1]) or "0") end; local n=tonumber(redis.call("GET",KEYS[1]) or "0"); if n<=1 then redis.call("DEL",KEYS[1]); return 0 end; return redis.call("DECR",KEYS[1])',[key,holdsKey],[token]));
}

// ---- Aggregate usage statistics (content-free, owner-only) ----
// ONE atomic step applies a whole statistics update to the lifetime, monthly
// and daily hashes. KEYS[1] is a per-run idempotency marker: a retried update
// of the same run is a no-op (returns 0). When a report key is supplied it is
// a second marker so one delivered report is counted once even if two runs
// delivered it (returns 3 = run applied, report already counted). Hashes are
// only ever HINCRBY'd, so concurrent workers cannot lose updates. The daily and
// monthly hashes get a bounded expiry; the lifetime hash and the
// firstRecordedAt baseline never expire.
const STATS_LUA=[
  'local function apply(f,d) for i=3,5 do redis.call("HINCRBY",KEYS[i],f,d) end end',
  'if not redis.call("SET",KEYS[1],"1","NX","EX",ARGV[1]) then return 0 end',
  'local n=tonumber(ARGV[6]); local idx=7',
  'for i=1,n do apply(ARGV[idx],ARGV[idx+1]); idx=idx+2 end',
  'local result=1',
  'if ARGV[5]=="1" then',
  ' if redis.call("SET",KEYS[2],"1","NX","EX",ARGV[1]) then',
  '  while idx<=#ARGV do apply(ARGV[idx],ARGV[idx+1]); idx=idx+2 end',
  '  result=2',
  ' else apply("dup.deliveries","1"); result=3 end',
  'end',
  'redis.call("HSETNX",KEYS[3],"firstRecordedAt",ARGV[4])',
  'if tonumber(ARGV[2])>0 then redis.call("EXPIRE",KEYS[5],ARGV[2]) end',
  'if tonumber(ARGV[3])>0 then redis.call("EXPIRE",KEYS[4],ARGV[3]) end',
  'return result'
].join('\n');

function statsPlanArgs(plan){
  const always=plan.always||[],delivered=plan.delivered||[];
  return [String(plan.seenTtl),String(plan.dayTtl),String(plan.monthTtl),String(plan.nowIso),
    plan.reportKey?'1':'0',String(always.length),
    ...always.flatMap(([f,d])=>[f,String(d)]),
    ...delivered.flatMap(([f,d])=>[f,String(d)])];
}
let statsFault=null;
// Shared by the in-memory and local-file stores (both are single-process and
// synchronous inside this function, which is their equivalent of one Lua call).
function applyStatsPlanLocally(plan,io){
  const {total,month,day}=plan.keys;
  if(!io.setNx(plan.runKey,plan.seenTtl))return 0;
  const apply=(f,d)=>{for(const k of [total,month,day])io.incr(k,f,d);};
  for(const [f,d] of plan.always||[])apply(f,d);
  let result=1;
  if(plan.reportKey){
    if(io.setNx(plan.reportKey,plan.seenTtl)){
      for(const [f,d] of plan.delivered||[])apply(f,d);
      result=2;
    }else{apply('dup.deliveries',1);result=3;}
  }
  io.setNxField(total,'firstRecordedAt',plan.nowIso);
  if(plan.dayTtl>0)io.expire(day,plan.dayTtl);
  if(plan.monthTtl>0)io.expire(month,plan.monthTtl);
  return result;
}
export async function applyUsageStatsPlan(plan){
  if(process.env.KIDBUSTER_TEST_KV==='1'&&statsFault){
    if(statsFault==='hang')return await new Promise(()=>{});
    throw new Error('Simulated usage-stats write failure');
  }
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();
    const live=key=>{const e=memoryExpiry.get(key);if(e&&e<=Date.now()){memoryExpiry.delete(key);memoryStore.delete(key);}};
    return applyStatsPlanLocally(plan,{
      setNx(key,ttl){live(key);if(memoryStore.has(key))return false;memoryStore.set(key,'1');memoryExpiry.set(key,Date.now()+ttl*1000);return true;},
      incr(key,f,d){live(key);const h=memoryStore.get(key)||{};h[f]=(Number(h[f])||0)+Number(d);memoryStore.set(key,h);},
      setNxField(key,f,v){live(key);const h=memoryStore.get(key)||{};if(!(f in h))h[f]=v;memoryStore.set(key,h);},
      expire(key,ttl){if(memoryStore.has(key))memoryExpiry.set(key,Date.now()+ttl*1000);}
    });
  }
  if(useLocal){
    const live=key=>{if(localData[key]?.until&&localData[key].until<=Date.now())delete localData[key];};
    const result=applyStatsPlanLocally(plan,{
      setNx(key,ttl){live(key);if(localData[key])return false;localData[key]={value:'1',until:Date.now()+ttl*1000};return true;},
      incr(key,f,d){live(key);const h=localData[key]?.value||{};h[f]=(Number(h[f])||0)+Number(d);localData[key]={value:h,until:localData[key]?.until??null};},
      setNxField(key,f,v){live(key);const h=localData[key]?.value||{};if(!(f in h))h[f]=v;localData[key]={value:h,until:localData[key]?.until??null};},
      expire(key,ttl){if(localData[key])localData[key].until=Date.now()+ttl*1000;}
    });
    persistLocal();return result;
  }
  const {total,month,day}=plan.keys;
  return Number(await vercelKv.eval(STATS_LUA,[plan.runKey,plan.reportKey||plan.runKey+':none',total,month,day],statsPlanArgs(plan)));
}
// Reads whole statistics hashes (missing key -> {}). Values are coerced by the caller.
export async function readUsageStatsHashes(keys){
  if(process.env.KIDBUSTER_TEST_KV==='1'){
    failIfOutage();
    return keys.map(key=>({...(liveMemoryValue(key)||{})}));
  }
  if(useLocal)return keys.map(key=>{const item=localData[key];return item&&!(item.until&&item.until<=Date.now())?{...item.value}:{};});
  return await Promise.all(keys.map(async key=>({...((await vercelKv.hgetall(key))||{})})));
}
function liveMemoryValue(key){
  const e=memoryExpiry.get(key);
  if(e&&e<=Date.now()){memoryExpiry.delete(key);memoryStore.delete(key);}
  return memoryStore.get(key);
}

export function __resetForTests(){
  memoryStore = new Map();
  memoryExpiry.clear();
  outage = false;
  statsFault = null;
}

// Test hooks (memory store only): inspect stored data, or make ONLY the
// statistics write fail ('throw') or never finish ('hang').
export function __dumpForTests(){
  const out={};
  for(const [key,value] of memoryStore)out[key]={value:JSON.parse(JSON.stringify(value)),expiresAt:memoryExpiry.get(key)??null};
  return out;
}
export function __simulateUsageStatsFault(mode){statsFault=mode||null;}

export function __simulateOutage(value){
  outage = !!value;
}
