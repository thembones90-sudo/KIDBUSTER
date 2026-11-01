/* Background discovery only. Explicit inbox actions bypass this budget. */
(function(root){
  'use strict';
  // Nobody at the keyboard (no input or window focus in THIS tab): after
  // 5 minutes discovery runs at most once a minute, after 30 minutes once
  // every 5 minutes, even while armed. Coming back calls demand(), so a
  // transcript that arrived during the lesson appears the moment the teacher
  // switches back. The away floor is per-tab only: it is never written to the
  // shared cross-tab deadline, so a forgotten tab cannot slow an active one.
  var AWAY_MS=5*60000, LONG_AWAY_MS=30*60000, AWAY_DELAY_MS=60000, LONG_AWAY_DELAY_MS=300000;
  // An explicit return (focus, input after being away) refreshes at once, but
  // never more than once per armed cadence per tab.
  var DEMAND_GAP_MS=15000;
  function create(options){
    var busy=false, due=0, failures=0, scope=null, scopeKey=null, lastRunAt=null;
    var clock=options.now || Date.now;
    var env=options.env || root;
    // Shared cadence: armed 15 s, unarmed 60 s, failures back off to 120 s.
    function sharedDelay(){ return Math.min(120000,(options.armed()?15000:60000)*Math.pow(2,Math.min(failures,3))); }
    function awayFloor(){
      var away=0;
      try{ away=options.away ? Number(options.away()) : 0; }catch(_err){ away=0; }
      if(!(away>0)) return 0;
      return away>=LONG_AWAY_MS ? LONG_AWAY_DELAY_MS : away>=AWAY_MS ? AWAY_DELAY_MS : 0;
    }
    function delay(){ return Math.max(sharedDelay(), awayFloor()); }
    async function accountScope(key){
      if(scopeKey===key) return scope;
      // No raw credentials in lock names, storage keys or values.
      if(!env.crypto?.subtle) return null;
      var bytes;
      try{bytes=await env.crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));}
      catch(_err){return null;}
      if(options.key()!==key) return null;
      scopeKey=key;
      scope='classbuster:krisp-poll:v1:'+Array.from(new Uint8Array(bytes),function(x){return x.toString(16).padStart(2,'0');}).join('');
      return scope;
    }
    async function attempt(explicit){
      var key=options.key();
      if(busy || !key || !options.enabled() || options.hidden()) return;
      if(explicit && lastRunAt!==null && clock()-lastRunAt<DEMAND_GAP_MS){
        // Too soon for another read, but the teacher is back: never leave an
        // away-length deadline (up to 5 minutes) in place.
        due=Math.min(due,lastRunAt+delay());
        return;
      }
      if(!explicit && clock()<due) return;
      busy=true;
      try{
        var name=await accountScope(key);
        async function run(){
          if(key!==options.key() || options.hidden() || !options.enabled()) return;
          // Shared deadline is a hint, never an entitlement/content cache. A bad
          // or obsolete timestamp cannot suppress discovery beyond two minutes.
          // An explicit return ignores it: this tab's own view must refresh.
          if(name){
            try{
              if(!explicit){
                var shared=Number(env.localStorage.getItem(name));
                if(Number.isFinite(shared) && shared>clock() && shared<=clock()+120000) return;
              }
              env.localStorage.setItem(name,String(clock()+15000));
            }catch(_err){ /* private storage: per-tab budget remains active */ }
          }
          lastRunAt=clock();
          var result;
          try{ result=await options.run(); }catch(_err){ result=null; }
          if(key!==options.key()) return;
          failures=result?0:failures+1;
          due=clock()+delay();
          if(name){try{env.localStorage.setItem(name,String(clock()+sharedDelay()));}catch(_err){}}
        }
        if(!explicit && name && env.navigator?.locks){
          await env.navigator.locks.request(name,{ifAvailable:true},async function(lock){if(lock) await run();});
        }else{
          // Without Web Locks, do not claim cross-tab atomicity. Reads remain
          // bounded by this tab's own visibility/cadence/backoff rules. An
          // explicit demand is a single user-driven read for this tab only.
          if(!explicit) name=null;
          await run();
        }
      }finally{busy=false;}
    }
    function tick(){ return attempt(false); }
    function demand(){ return attempt(true); }
    function reset(){ due=0; failures=0; scope=null; scopeKey=null; lastRunAt=null; }
    return {tick:tick,demand:demand,reset:reset};
  }
  root.ClassbusterKrispPollBudget={create:create};
})(typeof window==='undefined'?globalThis:window);
