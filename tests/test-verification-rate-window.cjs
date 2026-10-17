'use strict';
// Slice 6: email-verification rate limiting must be atomic and self-healing.
//  - the window is anchored at the first hit and never extended by later hits
//  - a counter orphaned without an expiry (old INCR-then-EXPIRE crash gap) is repaired
//  - the window actually resets after 15 minutes
//  - the 429 message tells a real teacher their earlier link is still usable
const crypto=require('crypto');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-verification-rate-window.cjs ===');
  const kvc=await import('../api/_lib/kv-client.js');
  const verification=await import('../api/_lib/account-verification.js');
  const accessRequest=await import('../api/_lib/access-request.js');
  const emailService=await import('../api/_lib/email-service.js');
  const {__resetForTests,kv}=kvc;
  const originalNow=Date.now;
  let now=originalNow();
  const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
  const WINDOW=verification.VERIFICATION_TTL_SECONDS;
  const LIMIT=verification.VERIFICATION_REQUEST_LIMIT;
  const emailKey=e=>'emailVerificationRate:email:'+sha(e);

  function send(email,ip='192.0.2.55'){
    const req={method:'POST',headers:{'x-forwarded-for':ip},body:{email}};
    let statusCode=200,jsonBody=null;
    const res={status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    return accessRequest.requestVerifiedAccess(req,res,{intent:'recover'}).then(()=>({statusCode,jsonBody}));
  }

  try{
    console.log('\n1) fixed window semantics');
    __resetForTests();Date.now=()=>now;
    const k='windowtest:a';
    check('first hit returns 1',await kvc.incrementWindowCounter(k,60)===1);
    now+=40*1000;
    check('second hit returns 2',await kvc.incrementWindowCounter(k,60)===2);
    now+=30*1000; // 70s after the FIRST hit
    check('later hits do not extend the window: it has expired 60s after the first hit',await kvc.incrementWindowCounter(k,60)===1);
    let threw=false;try{await kvc.incrementWindowCounter(k,0);}catch(e){threw=true;}
    check('a non-positive TTL is rejected',threw);

    console.log('\n2) an orphaned counter without expiry is repaired');
    __resetForTests();now=originalNow();Date.now=()=>now;
    const orphan='windowtest:orphan';
    await kv.incr(orphan);await kv.incr(orphan);await kv.incr(orphan); // old code died before EXPIRE
    check('orphan counter keeps counting',await kvc.incrementWindowCounter(orphan,60)===4);
    now+=61*1000;
    check('and now expires instead of living forever',await kvc.incrementWindowCounter(orphan,60)===1);

    console.log('\n3) end to end through the access-request route');
    __resetForTests();emailService.__resetTestMessages();now=originalNow();Date.now=()=>now;
    const results=[];
    for(let i=0;i<LIMIT+2;i++)results.push(await send('Window.User@Example.com'));
    check('the first '+LIMIT+' requests are accepted',results.slice(0,LIMIT).every(r=>r.statusCode===202));
    check('requests over the limit are 429',results.slice(LIMIT).every(r=>r.statusCode===429));
    check('refused requests send no extra email',emailService.__getTestMessages().length===LIMIT);
    const overLimitText=results[LIMIT].jsonBody.error;

    console.log('\n3b) teachers sharing one network are not locked out by each other');
    __resetForTests();emailService.__resetTestMessages();
    const shared=[];
    for(let i=0;i<12;i++)shared.push(await send('teacher'+i+'@school.example','198.51.100.7'));
    check('12 different teachers on one IP can all request links',shared.every(r=>r.statusCode===202));
    for(let i=12;i<verification.VERIFICATION_IP_REQUEST_LIMIT;i++)await send('teacher'+i+'@school.example','198.51.100.7');
    check('the per-network ceiling still stops mass requests from one IP',(await send('flood@school.example','198.51.100.7')).statusCode===429);
    check('the per-mailbox limit stays the strict one',LIMIT<=5&&verification.VERIFICATION_IP_REQUEST_LIMIT>LIMIT);
    results[LIMIT].jsonBody.error=overLimitText;
    check('429 text says an earlier link is still valid for 15 minutes',
      /already asked/i.test(results[LIMIT].jsonBody.error)&&/15 minutes/.test(results[LIMIT].jsonBody.error));
    now+=(WINDOW+5)*1000;
    const afterWindow=await send('window.user@example.com');
    check('after the 15-minute window the same address can request again',afterWindow.statusCode===202);

    console.log('\n4) a crash-orphaned email counter no longer locks an address out forever');
    __resetForTests();emailService.__resetTestMessages();now=originalNow();Date.now=()=>now;
    for(let i=0;i<LIMIT;i++)await kv.incr(emailKey('stuck@example.com')); // limit reached, no expiry (old bug state)
    const blocked=await send('stuck@example.com');
    check('the orphaned counter is still over the limit right now',blocked.statusCode===429);
    now+=(WINDOW+5)*1000;
    const healed=await send('stuck@example.com');
    check('but it heals itself and the address works again after one window',healed.statusCode===202);
  }finally{
    Date.now=originalNow;
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';process.env.KIDBUSTER_TEST_EMAIL='1';module.exports().then(n=>process.exit(n?1:0));}
