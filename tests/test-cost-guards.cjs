'use strict';
// 2026-10-29 cost guards: Pro daily report ceiling (owner set 35) and an owner
// alert on every refund. Neither changes stored licences or paid access.
const crypto=require('node:crypto');
const {createChecker}=require('./helpers/assert.cjs');
const {validReportForProviderBody}=require('./helpers/valid-reports.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-cost-guards.cjs ===');
  const vars=['KIDBUSTER_TEST_KV','LEMONSQUEEZY_WEBHOOK_SECRET','PAYMENT_PROVIDER','GOOGLE_SHEET_WEBHOOK_URL','OWNER_LICENSE_KEYS',
    'ANTHROPIC_API_KEY','GENERATE_RATE_LIMIT_PER_MINUTE','GENERATE_MAX_CONCURRENT','PRO_DAILY_REPORT_LIMIT','OWNER_ALERT_EMAIL'];
  const previous=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
  process.env.KIDBUSTER_TEST_KV='1';
  process.env.LEMONSQUEEZY_WEBHOOK_SECRET='cost-guard-fixtures-only';
  process.env.PAYMENT_PROVIDER='lemonsqueezy';
  process.env.OWNER_LICENSE_KEYS='synthetic-owner-cost-guard';
  process.env.ANTHROPIC_API_KEY='isolated_test_key';
  process.env.GENERATE_RATE_LIMIT_PER_MINUTE='1000';
  process.env.GENERATE_MAX_CONCURRENT='50';
  process.env.GOOGLE_SHEET_WEBHOOK_URL='https://sheet.example.test/hook';delete process.env.PRO_DAILY_REPORT_LIMIT;delete process.env.OWNER_ALERT_EMAIL;
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const svc=await import('../api/_lib/license-service.js');
  const licensing=await import('../api/_lib/licensing.js');
  const {readEvents}=await import('../api/_lib/event-log.js');
  const generate=(await import('../api/generate.js')).default;
  const webhook=(await import('../api/payment-webhook.js')).default;
  const priorFetch=global.fetch,originalNow=Date.now;
  let now=Date.parse('2026-11-02T08:00:00Z');
  let providerCalls=0,providerOk=true;const sheet=[];
  global.fetch=async(url,options)=>{
    if(String(url).startsWith('https://sheet.example.test/')){sheet.push(JSON.parse(options.body));return {ok:true,json:async()=>({})};}
    providerCalls++;
    return providerOk?{ok:true,json:async()=>({content:[{type:'text',text:validReportForProviderBody(options.body)}],usage:{output_tokens:4}})}
      :{ok:false,status:529,json:async()=>({error:{type:'overloaded_error'}})};};
  function report(key){
    const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'cost-guard-browser'},body:{generation:{
      teacherName:'Layne',studentName:'Test Student',notes:'Practised reading and answered questions.',rating:'4',protocol:'MA'}}};
    let statusCode=200,jsonBody=null;
    const res={headers:{},setHeader(n,v){this.headers[n]=v;},status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    return generate(req,res).then(()=>({statusCode,jsonBody,headers:res.headers}));
  }
  const alerts=async type=>(await readEvents({days:2,limit:500})).filter(e=>e.type==='alert'&&e.alert===type);
  const sent=type=>sheet.filter(row=>row.ratingTier===type).map(row=>row.comment);
  async function proKey(email){
    const key=await svc.getOrCreateFreeLicense(email);
    await svc.activateOrRenewPro({licenseKey:key,paymentCustomerId:'c_'+email,paymentSubscriptionId:'s_'+email});
    return key;
  }
  try{
    Date.now=()=>now;
    __resetForTests();

    console.log('\n1) configuration');
    check('the owner-set default is 35 reports per day',licensing.proDailyReportLimit()===35);
    process.env.PRO_DAILY_REPORT_LIMIT='0';
    check('an invalid override falls back to 35',licensing.proDailyReportLimit()===35);
    process.env.PRO_DAILY_REPORT_LIMIT='40';
    check('a valid override is honoured',licensing.proDailyReportLimit()===40);
    delete process.env.PRO_DAILY_REPORT_LIMIT;

    console.log('\n2) a Pro key stops at 35 delivered reports');
    const a=await proKey('cap-a@example.com');
    let ok=0;for(let i=0;i<35;i++)if((await report(a)).statusCode===200)ok++;
    check('35 reports in one day are all delivered',ok===35);
    const calls=providerCalls;
    const refused=await report(a);
    check('report 36 is refused with 429 daily_limit_reached',refused.statusCode===429&&refused.jsonBody.reason==='daily_limit_reached');
    check('the refusal is friendly, names the limit and keeps the notes safe',/35 reports/.test(refused.jsonBody.error)&&/lesson notes are safe/.test(refused.jsonBody.error));
    check('Retry-After points at UTC midnight',refused.headers['Retry-After']===String(16*3600));
    check('no AI call is made for a refused report',providerCalls===calls);
    await report(a);await report(a);
    const capAlerts=await alerts('pro_daily_limit');
    check('the owner is alerted exactly once for that key that day',capAlerts.length===1);
    check('the sent alert names a key reference but never the raw key',sent('pro_daily_limit').length===1&&
      /Key ref: k_[0-9a-f]{12}/.test(sent('pro_daily_limit')[0])&&!sent('pro_daily_limit')[0].includes(a));

    console.log('\n3) other keys, the owner key and Free accounts are unaffected');
    const b=await proKey('cap-b@example.com');
    check('another Pro key still generates',(await report(b)).statusCode===200);
    let owner=0;for(let i=0;i<40;i++)if((await report('synthetic-owner-cost-guard')).statusCode===200)owner++;
    check('owner keys are never capped',owner===40);
    const free=await svc.getOrCreateFreeLicense('cap-free@example.com');
    check('Free accounts keep their own allowance path',(await report(free)).statusCode===200&&(await licensing.getUsageCount(free))===1);

    console.log('\n4) failed reports do not count');
    const c=await proKey('cap-c@example.com');
    providerOk=false;
    for(let i=0;i<10;i++)await report(c);
    providerOk=true;
    let delivered=0;for(let i=0;i<36;i++)if((await report(c)).statusCode===200)delivered++;
    check('ten failed reports leave the full 35 available',delivered===35);

    console.log('\n5) the limit resets the next UTC day');
    now=Date.parse('2026-11-03T00:00:05Z');
    check('the capped key generates again after midnight UTC',(await report(a)).statusCode===200);

    console.log('\n6) refunds alert the owner and leave access alone');
    __resetForTests();
    const r=await svc.getOrCreateFreeLicense('refund@example.test');
    let seq=0;
    const fixture=(eventName,minutes,options={})=>{
      const invoice=eventName.startsWith('subscription_payment_');
      const at=new Date(now+minutes*60000).toISOString();
      const attributes={customer_id:'customer-refund',user_email:'refund@example.test',created_at:at,updated_at:at,
        status:invoice?(options.refunded?'refunded':'paid'):'active',
        ...(invoice?{subscription_id:'sub-refund',refunded:!!options.refunded,refunded_amount:options.amount??null,total:1200}:{order_id:'order-refund'})};
      return {meta:{event_name:eventName,custom_data:{license_key:r}},
        data:{type:invoice?'subscription-invoices':'subscriptions',id:invoice?(options.invoiceId||'inv-'+(++seq)):'sub-refund',attributes}};
    };
    const send=async payload=>{
      const bytes=Buffer.from(JSON.stringify(payload));
      const signature=crypto.createHmac('sha256',process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(bytes).digest('hex');
      const req={method:'POST',headers:{'x-signature':signature},on(name,cb){if(name==='data')cb(bytes);if(name==='end')cb();return this;}};
      const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
      await webhook(req,res);return res.code;
    };
    check('subscription is set up',(await send(fixture('subscription_created',-30)))===200);
    check('no refund alert without a refund',(await alerts('refund')).length===0);
    const partial=fixture('subscription_payment_refunded',-20,{invoiceId:'inv-partial',amount:200});
    check('partial refund webhook is accepted',(await send(partial))===200);
    let refundAlerts=await alerts('refund');
    check('a partial refund alerts the owner once',refundAlerts.length===1&&/Partial refund/.test(refundAlerts[0].title));
    check('the replayed webhook does not alert again',(await send(partial))===200&&(await alerts('refund')).length===1);
    await send(fixture('subscription_payment_refunded',-10,{invoiceId:'inv-full',amount:1200,refunded:true}));
    refundAlerts=await alerts('refund');
    check('a full refund alerts the owner separately',refundAlerts.length===2&&refundAlerts.some(e=>/Full refund/.test(e.title)));
    const stored=await licensing.getLicense(r);
    check('Pro access is unchanged after refunds',stored.plan==='pro'&&stored.status==='active');
    const refundMessages=sent('refund');
    check('the sent refund alerts show the amounts',refundMessages.length===2&&refundMessages.some(m=>m.includes('Refunded: 2.00 of 12.00'))&&refundMessages.some(m=>m.includes('Refunded: 12.00 of 12.00')));
    check('refund alerts never contain the raw key or full email',refundMessages.every(m=>!m.includes(r)&&!m.includes('refund@example.test')&&/Customer: .*\*/.test(m)));

    console.log('\n7) impossible keys are refused before Redis, with unchanged answers');
    const kvc=await import('../api/_lib/kv-client.js');
    const status=(await import('../api/license-status.js')).default;
    const krisp=(await import('../api/krisp-session.js')).default;
    const COUNTED=['get','set','del','getdel','mget','incr','expire','scan','eval'];
    const originals={};let commands=0;
    for(const n of COUNTED)if(kvc.kv[n]){originals[n]=kvc.kv[n];kvc.kv[n]=function(...x){commands++;return originals[n].apply(this,x);};}
    const call=async(handler,req)=>{let code=200,body=null;const res={headers:{},setHeader(){},status(c){code=c;return res;},json(b){body=b;return res;}};await handler(req,res);return {code,body};};
    try{
      const junk=['PROBE-NOT-A-REAL-KEY','kb_live_short','kb_live_'+'g'.repeat(48),' kb_live_'+'a'.repeat(48),'x'.repeat(5000)];
      for(const key of junk){
        commands=0;
        const g=await report(key);
        const st=await call(status,{method:'GET',headers:{'x-app-key':key}});
        const kr=await call(krisp,{method:'GET',query:{},headers:{'x-app-key':key,host:'t.example'}});
        check('junk key '+JSON.stringify(key.slice(0,24))+': same refusals, zero Redis commands',
          g.statusCode===401&&g.jsonBody.error==='Invalid license key.'&&st.code===401&&st.body.error==='Invalid license key.'&&kr.code===403&&commands===0);
      }
      const unknown='kb_live_'+'0'.repeat(48);
      commands=0;
      check('a well-formed but unknown key is still looked up and refused',(await call(status,{method:'GET',headers:{'x-app-key':unknown}})).code===401&&commands>0);
      const real=await proKey('format-real@example.com');
      check('a real key keeps working on every route',(await report(real)).statusCode===200&&
        (await call(status,{method:'GET',headers:{'x-app-key':real}})).code===200&&
        (await call(krisp,{method:'GET',query:{},headers:{'x-app-key':real,host:'t.example'}})).code===200);
      check('owner keys in any format keep working',(await report('synthetic-owner-cost-guard')).statusCode===200&&
        (await call(status,{method:'GET',headers:{'x-app-key':'synthetic-owner-cost-guard'}})).code===200);
    }finally{for(const n of Object.keys(originals))kvc.kv[n]=originals[n];}
  }finally{
    Date.now=originalNow;global.fetch=priorFetch;
    for(const k of vars){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
