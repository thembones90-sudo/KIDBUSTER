'use strict';
const { createChecker } = require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-checkout-ownership.cjs ===');
  const envNames=['KIDBUSTER_TEST_KV','KIDBUSTER_TEST_EMAIL','PAYMENT_PROVIDER','LEMONSQUEEZY_API_KEY',
    'LEMONSQUEEZY_STORE_ID','LEMONSQUEEZY_PRO_VARIANT_ID','GOOGLE_SHEET_WEBHOOK_URL','OWNER_LICENSE_KEYS'];
  const before=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
  const previousFetch=global.fetch;
  process.env.KIDBUSTER_TEST_KV='1';
  process.env.KIDBUSTER_TEST_EMAIL='1';
  process.env.PAYMENT_PROVIDER='lemonsqueezy';
  process.env.LEMONSQUEEZY_API_KEY='synthetic-not-real';
  process.env.LEMONSQUEEZY_STORE_ID='synthetic-store';
  process.env.LEMONSQUEEZY_PRO_VARIANT_ID='synthetic-variant';
  process.env.OWNER_LICENSE_KEYS='test_owner_payment_gate';
  delete process.env.GOOGLE_SHEET_WEBHOOK_URL;

  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const licensing=await import('../api/_lib/licensing.js');
  const svc=await import('../api/_lib/license-service.js');
  const email=await import('../api/_lib/email-service.js');
  const checkout=(await import('../api/create-checkout-session.js')).default;
  const verify=(await import('../api/license-verify.js')).default;
  let providerCalls=0;
  global.fetch=async(url,options)=>{
    if(String(url)==='https://api.lemonsqueezy.com/v1/checkouts'){
      providerCalls++;
      return {ok:true,json:async()=>({data:{attributes:{url:'https://example.invalid/checkout'}}})};
    }
    if(String(url)==='https://api.lemonsqueezy.com/v1/subscriptions/1234'){
      providerCalls++;
      return {ok:true,json:async()=>({data:{type:'subscriptions',id:'1234',attributes:{
        customer_id:42,urls:{customer_portal:'https://store.lemonsqueezy.com/billing?signature=synthetic'}
      }}})};
    }
    throw new Error('Unexpected external API request in synthetic test');
  };
  async function request(handler,{headers={},body={}}={}){
    const req={method:'POST',headers,body};
    let code=null,output=null;
    const res={status(n){code=n;return this;},json(x){output=x;return this;}};
    await handler(req,res);
    return {code,output};
  }
  try{
    __resetForTests();
    email.__resetTestMessages();
    const protectedKey=await svc.getOrCreateFreeLicense('someoneelse@example.invalid');
    const anonymous=await request(checkout,{body:{email:'someoneelse@example.invalid'}});
    check('anonymous existing email cannot retrieve a license key',anonymous.code===202 && !anonymous.output.licenseKey);
    check('anonymous existing email cannot receive an immediate checkout URL',!anonymous.output.url && providerCalls===0);
    check('anonymous checkout requests are forced through verified mailbox flow',email.__getTestMessages().length===1);
    check('an anonymous provided license key without matching auth is rejected',
      (await request(checkout,{body:{licenseKey:protectedKey}})).code===401);
    check('unknown header key is rejected before provider call',
      (await request(checkout,{headers:{'x-app-key':'not-a-real-key'},body:{email:'someoneelse@example.invalid'}})).code===401);
    const another=await svc.getOrCreateFreeLicense('different@example.invalid');
    const otherAccount=await request(checkout,{
      headers:{'x-app-key':another},body:{licenseKey:protectedKey,email:'someoneelse@example.invalid'}
    });
    check('a signed-in customer cannot initiate checkout for someone else\'s key',
      otherAccount.code===403 && providerCalls===0);
    const mismatch=await request(checkout,{
      headers:{'x-app-key':protectedKey},body:{email:'notthatcustomer@example.invalid'}
    });
    check('a signed-in key cannot silently change verified billing email',
      mismatch.code===403 && providerCalls===0);
    const founder=await request(checkout,{headers:{'x-app-key':'test_owner_payment_gate'},body:{email:'owner@example.invalid'}});
    check('owner master account is not handed a paid customer checkout',founder.code===403);
    const normal=await request(checkout,{headers:{'x-app-key':protectedKey},body:{email:'someoneelse@example.invalid'}});
    check('verified existing owner can initiate checkout',normal.code===200 &&
      normal.output.url==='https://example.invalid/checkout' && providerCalls===1);
    check('successful checkout does not echo bearer license key',!normal.output.licenseKey);
    const noSubscriptionPortal=await request(checkout,{headers:{'x-app-key':protectedKey},body:{action:'manage-billing'}});
    check('free accounts cannot request a billing portal URL',noSubscriptionPortal.code===409&&providerCalls===1);
    await svc.activateOrRenewPro({licenseKey:protectedKey,email:'someoneelse@example.invalid',
      paymentCustomerId:'42',paymentSubscriptionId:'1234'});
    const anonymousPortal=await request(checkout,{body:{action:'manage-billing'}});
    check('billing portal requires the account bearer key',anonymousPortal.code===400||anonymousPortal.code===401);
    const portal=await request(checkout,{headers:{'x-app-key':protectedKey},body:{action:'manage-billing'}});
    check('signed-in subscription owner receives a fresh provider portal URL',portal.code===200&&portal.output.url.startsWith('https://store.lemonsqueezy.com/billing?')&&providerCalls===2);
    const active=await request(checkout,{headers:{'x-app-key':protectedKey},body:{email:'someoneelse@example.invalid'}});
    check('already subscribed accounts cannot accidentally start duplicate subscriptions',
      active.code===409 && providerCalls===2);
    const subscribed=await licensing.getLicense(protectedKey);
    const tomorrow=new Date(Date.now()+86400000).toISOString();
    const yesterday=new Date(Date.now()-86400000).toISOString();
    await licensing.saveLicense(protectedKey,{
      ...subscribed,subscriptionStatus:'cancelled',subscriptionEndsAt:tomorrow
    });
    const withinGrace=await request(checkout,{
      headers:{'x-app-key':protectedKey},body:{email:'someoneelse@example.invalid'}
    });
    check('a cancelled but still paid-through subscription blocks accidental double checkout',
      withinGrace.code===409 && providerCalls===2);
    await licensing.saveLicense(protectedKey,{
      ...subscribed,subscriptionStatus:'cancelled',subscriptionEndsAt:yesterday
    });
    const afterGrace=await request(checkout,{
      headers:{'x-app-key':protectedKey},body:{email:'someoneelse@example.invalid'}
    });
    check('an expired paid-through subscription can start a fresh verified checkout',
      afterGrace.code===200 && providerCalls===3);

    __resetForTests();
    email.__resetTestMessages();
    const start=await request(checkout,{body:{email:'newcustomer@example.invalid'}});
    check('brand new direct-to-Pro visitor receives 202, not a secret',start.code===202 &&
      !start.output.licenseKey && !start.output.url);
    check('checkout does not create a user before mailbox ownership is proven',
      await licensing.getLicenseKeyByEmail('newcustomer@example.invalid')===null);
    const lastEmail=email.__getTestMessages().at(-1);
    const token=new URL(lastEmail.verificationUrl).searchParams.get('access_token');
    const verification=await request(verify,{body:{token}});
    check('email verification returns an authenticated license',verification.code===200 &&
      typeof verification.output.licenseKey==='string');
    const newlyVerified=await request(checkout,{headers:{'x-app-key':verification.output.licenseKey},
      body:{email:'newcustomer@example.invalid'}});
    check('new customer can proceed to checkout only AFTER verification',newlyVerified.code===200 &&
      !!newlyVerified.output.url && providerCalls===4);

  }finally{
    global.fetch=previousFetch;
    for(const name of envNames){
      if(before[name]===undefined)delete process.env[name];
      else process.env[name]=before[name];
    }
  }
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1)});
