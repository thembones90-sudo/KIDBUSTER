'use strict';
// Slice 7: Krisp webhook-token lifecycle is serialized per account.
// Overlapping regenerate / first-visit / disconnect calls used to orphan
// webhook tokens: the teacher's page showed one URL while an older, unknown
// URL kept working, so "regenerate" did not reliably revoke a leaked link.
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-krisp-token-lock.cjs ===');
  const tokens=await import('../api/_lib/krisp-token.js');
  const svc=await import('../api/_lib/license-service.js');
  const session=(await import('../api/krisp-session.js')).default;
  const kvc=await import('../api/_lib/kv-client.js');
  const {__resetForTests}=kvc;

  async function liveAmong(list){
    const out=[];
    for(const t of new Set(list))if(await tokens.resolveKrispToken(t))out.push(t);
    return out;
  }
  async function call(key,method,body){
    let statusCode=200,jsonBody=null;
    const res={status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    await session({method,headers:{'x-app-key':key,host:'t.example.test'},body:body||{}},res);
    return {statusCode,jsonBody};
  }

  console.log('\n1) simultaneous first visits create exactly one token');
  __resetForTests();
  const key1='LICENSE-LOCK-1';
  const firsts=await Promise.all(Array.from({length:12},()=>tokens.getOrCreateKrispToken(key1)));
  check('all 12 concurrent first visits return the same token',new Set(firsts).size===1);
  check('and that token resolves to the account',await tokens.resolveKrispToken(firsts[0])===key1);

  console.log('\n2) simultaneous regenerates leave exactly one working token');
  __resetForTests();
  const key2='LICENSE-LOCK-2';
  const original=await tokens.getOrCreateKrispToken(key2);
  const regenerated=await Promise.all(Array.from({length:12},()=>tokens.regenerateKrispToken(key2)));
  const live=await liveAmong([original,...regenerated]);
  const current=await tokens.getOrCreateKrispToken(key2);
  check('exactly one of the 13 tokens ever issued still works',live.length===1);
  check('the working token is the one the account now shows',live[0]===current);
  check('the original (possibly leaked) URL is dead',!(await tokens.resolveKrispToken(original)));

  console.log('\n3) regenerate racing disconnect never leaves an unknown live token');
  for(let round=0;round<5;round++){
    __resetForTests();
    const k='LICENSE-LOCK-3-'+round;
    const first=await tokens.getOrCreateKrispToken(k);
    const [regenA,,regenB]=await Promise.all([tokens.regenerateKrispToken(k),tokens.disconnectKrisp(k),tokens.regenerateKrispToken(k)]);
    const alive=await liveAmong([first,regenA,regenB]);
    const mapping=await kvc.kv.get('krisp:user:'+k);
    check('round '+(round+1)+': live tokens are exactly what the account record points at',
      alive.length===(mapping&&mapping.token?1:0)&&(alive.length===0||alive[0]===mapping.token));
  }

  console.log('\n4) lock is released after normal work and after a failure');
  __resetForTests();
  const key4='LICENSE-LOCK-4';
  await tokens.regenerateKrispToken(key4);
  check('lock key is gone after a successful call',(await kvc.kv.get('krisp:tokenLock:'+key4))===null);
  const origSet=kvc.kv.set;
  kvc.kv.set=async function(k,...rest){ if(String(k).startsWith('krisp:token:')&&rest[0]&&rest[0].userIdentity)throw new Error('simulated write failure'); return origSet.call(this,k,...rest); };
  let failed=false;try{await tokens.regenerateKrispToken(key4);}catch(e){failed=true;}
  kvc.kv.set=origSet;
  check('a failing write surfaces the error',failed);
  check('and still releases the lock',(await kvc.kv.get('krisp:tokenLock:'+key4))===null);

  console.log('\n5) a stuck lock yields a clean 503 busy, not a hang or crash');
  __resetForTests();
  const proKey=await svc.getOrCreateFreeLicense('lock-busy@example.com');
  await svc.activateOrRenewPro({licenseKey:proKey,paymentCustomerId:'lock_cust',paymentSubscriptionId:'lock_sub'});
  const before=await call(proKey,'GET');
  check('GET works normally first',before.statusCode===200&&!!before.jsonBody.webhookUrl);
  await kvc.acquirePaymentLock('krisp:tokenLock:'+proKey,'someone-else',60);
  const started=Date.now();
  const busy=await call(proKey,'POST',{action:'regenerate'});
  const waited=Date.now()-started;
  check('regenerate against a held lock returns 503 reason=busy',busy.statusCode===503&&busy.jsonBody.reason==='busy');
  check('it waited a bounded time (2.5-6 s) instead of failing instantly or hanging',waited>=2500&&waited<=6000);
  const disc=await call(proKey,'POST',{action:'disconnect'});
  check('disconnect is also a clean 503 while the lock is held',disc.statusCode===503&&disc.jsonBody.reason==='busy');
  await kvc.releasePaymentLock('krisp:tokenLock:'+proKey,'someone-else');
  const after=await call(proKey,'POST',{action:'regenerate'});
  check('once the lock clears regenerate succeeds again',after.statusCode===200&&/token=[a-f0-9]{64}$/.test(after.jsonBody.webhookUrl));
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
