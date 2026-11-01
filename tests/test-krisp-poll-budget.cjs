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

  // 2026-11-01: away-from-keyboard floor and explicit return (demand).
  function awayTab(key){
    const t={key,hidden:false,armed:true,enabled:true,calls:0,ok:true,lastInput:now,work:null};
    t.budget=create({env,now:()=>now,key:()=>t.key,hidden:()=>t.hidden,armed:()=>t.armed,enabled:()=>t.enabled,
      away:()=>now-t.lastInput,run:async()=>{t.calls++;if(t.work)await t.work;return t.ok?{}:null;}});
    return t;
  }
  now+=600000;
  const w=awayTab('synthetic-away');
  await w.budget.tick();assert.equal(w.calls,1);
  now+=15000;await w.budget.tick();assert.equal(w.calls,2,'present + armed keeps the 15 s cadence');
  now+=5*60000;await w.budget.tick();const awayStart=w.calls; // due had passed; schedules with away floor
  now+=15000;await w.budget.tick();now+=15000;await w.budget.tick();now+=15000;await w.budget.tick();
  assert.equal(w.calls,awayStart,'away 5 min: armed discovery slows to once a minute');
  now+=15000;await w.budget.tick();assert.equal(w.calls,awayStart+1);
  w.lastInput=now-31*60000;await w.budget.tick();now+=60000;await w.budget.tick();const longAway=w.calls;
  now+=240000;await w.budget.tick();assert.equal(w.calls,longAway,'away 30 min: once every 5 minutes');
  now+=60000;await w.budget.tick();assert.equal(w.calls,longAway+1);
  // Shared deadline never carries the away floor, so an active tab of the
  // same account is not slowed by a forgotten one.
  const sharedValues=[...storage.entries()].filter(([k])=>k.length>0).map(([,v])=>Number(v)-now);
  assert.ok(sharedValues.every(v=>v<=120000),'shared deadlines stay within the two-minute bound');
  // Coming back: demand refreshes at once, at most once per 15 s per tab.
  now+=20000;w.lastInput=now;const beforeDemand=w.calls;
  await w.budget.demand();assert.equal(w.calls,beforeDemand+1,'return after being away refreshes immediately');
  await w.budget.demand();assert.equal(w.calls,beforeDemand+1,'repeated focus bursts do not multiply reads');
  now+=15000;await w.budget.demand();assert.equal(w.calls,beforeDemand+2);
  w.hidden=true;now+=15000;await w.budget.demand();assert.equal(w.calls,beforeDemand+2,'demand never reads from a hidden tab');
  w.hidden=false;w.enabled=false;await w.budget.demand();assert.equal(w.calls,beforeDemand+2,'demand never reads when disconnected');
  w.enabled=true;now+=15000;let release;w.work=new Promise(r=>release=r);const slow=w.budget.demand();
  await new Promise(setImmediate);await w.budget.tick();await w.budget.demand();
  const inFlight=w.calls;release();await slow;w.work=null;
  assert.equal(inFlight,beforeDemand+3,'demand and tick never overlap requests');
  // A follower tab whose leader holds the shared deadline still refreshes its
  // own view on an explicit return.
  now+=120000;const leader=awayTab('synthetic-shared'),follower=awayTab('synthetic-shared');
  await leader.budget.tick();await follower.budget.tick();
  assert.equal(leader.calls+follower.calls,1,'background discovery stays single-reader');
  await (leader.calls?follower:leader).budget.demand();
  assert.equal(leader.calls+follower.calls,2,'explicit return bypasses the shared hint for this tab only');
  // Account switch (reset) clears the per-tab demand gap.
  now+=15000;await w.budget.demand();const beforeReset=w.calls;
  await w.budget.demand();assert.equal(w.calls,beforeReset,'demand gap still applies before reset');
  w.budget.reset();await w.budget.demand();assert.equal(w.calls,beforeReset+1,'reset clears the per-tab demand gap');
  // Returning within 15 s of a read made while away: the demand is refused,
  // but the away-length deadline is pulled back to the normal cadence.
  now+=120000;const r=awayTab('synthetic-return');
  r.lastInput=now-31*60000;await r.budget.tick();const awayRead=r.calls;
  now+=5000;r.lastInput=now;await r.budget.demand();assert.equal(r.calls,awayRead,'too soon after the last read');
  now+=10000;await r.budget.tick();assert.equal(r.calls,awayRead+1,'returning teacher is back on the 15 s cadence, not 5 minutes');
  console.log('PASS polling budget: idle, visibility/resume, backoff/recovery, overlap, tabs, isolation, no sensitive shared state, away floor, bounded demand');return 0;
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
