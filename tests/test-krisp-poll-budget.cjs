'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
module.exports=async function(){
  const context={TextEncoder};vm.createContext(context);
  vm.runInContext(fs.readFileSync('assets/krisp-poll-budget.js','utf8'),context);
  const create=context.ClassbusterKrispPollBudget.create;
  let now=0;const storage=new Map(),held=new Set();
  const env={crypto:webcrypto,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},navigator:{locks:{async request(name,opts,fn){
    assert.equal(opts.ifAvailable,true);if(held.has(name))return fn(null);
    held.add(name);try{return await fn({name});}finally{held.delete(name);}
  }}}};
  function tab(key='synthetic-A'){
    const t={key,hidden:false,armed:false,enabled:true,calls:0,ok:true,work:null};
    t.budget=create({env,now:()=>now,key:()=>t.key,hidden:()=>t.hidden,armed:()=>t.armed,enabled:()=>t.enabled,run:async()=>{t.calls++;if(t.work)await t.work;return t.ok?{}:null;}});
    return t;
  }
  const a=tab();await a.budget.tick();assert.equal(a.calls,1);
  now=15000;await a.budget.tick();assert.equal(a.calls,1,'idle/disarmed cannot poll at armed cadence');
  now=60000;await a.budget.tick();assert.equal(a.calls,2);
  a.hidden=true;now=120000;await a.budget.tick();assert.equal(a.calls,2,'hidden makes no reads');
  a.hidden=false;a.budget.reset();await a.budget.tick();assert.equal(a.calls,3,'return discovers delayed arrivals');
  a.armed=true;now+=60000;await a.budget.tick();now+=15000;await a.budget.tick();assert.equal(a.calls,5,'armed discovery remains 15s');
  a.ok=false;now+=15000;await a.budget.tick();const failed=a.calls;
  now+=15000;await a.budget.tick();assert.equal(a.calls,failed,'outage backs off');
  now+=15000;await a.budget.tick();assert.equal(a.calls,failed+1);
  now+=60000;await a.budget.tick();now+=120000;await a.budget.tick();const capped=a.calls;
  now+=60000;await a.budget.tick();assert.equal(a.calls,capped);
  now+=60000;a.ok=true;await a.budget.tick();now+=15000;await a.budget.tick();assert.equal(a.calls,capped+2,'healthy response restores cadence');
  now+=15000;let finish;a.work=new Promise(r=>finish=r);const one=a.budget.tick();
  await new Promise(setImmediate);await a.budget.tick();const during=a.calls;finish();await one;assert.equal(a.calls,during,'no overlapping requests');a.work=null;
  now+=120000;const b=tab();await Promise.all([a.budget.tick(),b.budget.tick()]);
  const total=a.calls+b.calls;await b.budget.tick();assert.equal(a.calls+b.calls,total,'same-account follower cannot duplicate budget');
  const c=tab('synthetic-B');await c.budget.tick();assert.equal(c.calls,1,'other account has independent budget');
  assert.ok([...storage.keys()].every(k=>/^classbuster:krisp-poll:v1:[a-f0-9]{64}$/.test(k)));
  assert.ok([...storage.values()].every(v=>/^\d+$/.test(v)),'only deadlines stored');
  now+=120000;a.hidden=true;await b.budget.tick();assert.equal(b.calls,1,'visible follower takes over after leader hidden/closed');
  b.key='synthetic-C';b.budget.reset();await b.budget.tick();assert.equal(b.calls,2,'account switch resets budget');
  b.enabled=false;now+=120000;await b.budget.tick();assert.equal(b.calls,2,'disconnect stops background work');
  const fallback=tab('fallback');fallback.budget=create({env:{},now:()=>now,key:()=>fallback.key,hidden:()=>false,armed:()=>false,enabled:()=>true,run:async()=>{fallback.calls++;return {};}});
  await fallback.budget.tick();await fallback.budget.tick();assert.equal(fallback.calls,1,'missing Web Locks/crypto fails open to bounded discovery');
  console.log('PASS polling budget: idle, visibility/resume, backoff/recovery, overlap, tabs, isolation, no sensitive shared state');return 0;
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
