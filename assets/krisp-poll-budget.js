/* Background discovery only. Explicit inbox actions bypass this budget. */
(function(root){
  'use strict';
  function create(options){
    var busy=false, due=0, failures=0, scope=null, scopeKey=null;
    var clock=options.now || Date.now;
    var env=options.env || root;
    function delay(){ return Math.min(120000,(options.armed()?15000:60000)*Math.pow(2,Math.min(failures,3))); }
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
    async function tick(){
      var key=options.key();
      if(busy || !key || !options.enabled() || options.hidden() || clock()<due) return;
      busy=true;
      try{
        var name=await accountScope(key);
        async function run(){
          if(key!==options.key() || options.hidden() || !options.enabled()) return;
          // Shared deadline is a hint, never an entitlement/content cache. A bad
          // or obsolete timestamp cannot suppress discovery beyond two minutes.
          if(name){
            try{
              var shared=Number(env.localStorage.getItem(name));
              if(Number.isFinite(shared) && shared>clock() && shared<=clock()+120000) return;
              env.localStorage.setItem(name,String(clock()+15000));
            }catch(_err){ /* private storage: per-tab budget remains active */ }
          }
          var result;
          try{ result=await options.run(); }catch(_err){ result=null; }
          if(key!==options.key()) return;
          failures=result?0:failures+1;
          due=clock()+delay();
          if(name){try{env.localStorage.setItem(name,String(due));}catch(_err){}}
        }
        if(name && env.navigator?.locks){
          await env.navigator.locks.request(name,{ifAvailable:true},async function(lock){if(lock) await run();});
        }else{
          // Without Web Locks, do not claim cross-tab atomicity. Reads remain
          // bounded by this tab's own visibility/cadence/backoff rules.
          name=null;
          await run();
        }
      }finally{busy=false;}
    }
    function reset(){ due=0; failures=0; scope=null; scopeKey=null; }
    return {tick:tick,reset:reset};
  }
  root.ClassbusterKrispPollBudget={create:create};
})(typeof window==='undefined'?globalThis:window);
