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
    if(item.until && item.until <= Date.now()){
      delete localData[key];persistLocal();return null;
    }
    return item.value;
  },
  async set(key,value,options){
    if(options?.nx === true && Object.hasOwn(localData,key)){
      const existing=localData[key];
      if(!existing.until || existing.until > Date.now()) return null;
    }
    const until=Number.isInteger(options?.ex) && options.ex > 0
      ? Date.now() + options.ex*1000 : null;
    localData[key]={value,until};persistLocal();return 'OK';
  },
  async del(key){const found=Object.hasOwn(localData,key);delete localData[key];persistLocal();return found?1:0;},
  async getdel(key){const val=await this.get(key);delete localData[key];persistLocal();return val;},
  async incr(key){const current=await this.get(key);const next=(Number(current)||0)+1;await this.set(key,next);return next;},
  async expire(key,seconds){
    if(!localData[key])return 0;
    localData[key].until=Date.now()+seconds*1000;persistLocal();return 1;
  }
};

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
    if(expires && expires <= Date.now()){
      memoryExpiry.delete(key);memoryStore.delete(key);
    }
    return memoryStore.has(key) ? memoryStore.get(key) : null;
  },
  async set(key, value, options){
    failIfOutage();
    // No await between checking and setting: this is the single-process
    // in-memory equivalent of Redis atomic SET NX.
    const priorExpiry=memoryExpiry.get(key);
    if(priorExpiry && priorExpiry <= Date.now()){
      memoryExpiry.delete(key);memoryStore.delete(key);
    }
    if(options?.nx === true && memoryStore.has(key)) return null;
    memoryStore.set(key, value);
    if(Number.isInteger(options?.ex) && options.ex>0)
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

export function __resetForTests(){
  memoryStore = new Map();
  memoryExpiry.clear();
  outage = false;
}

export function __simulateOutage(value){
  outage = !!value;
}
