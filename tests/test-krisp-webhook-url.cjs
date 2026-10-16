'use strict';
// The Krisp webhook URL shown to a teacher must target the deployment they are
// using (staging vs production), never a hard-coded production host.
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-krisp-webhook-url.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const session=(await import('../api/krisp-session.js')).default;
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const saved={app:process.env.PATHFINDER_APP_URL,site:process.env.SITE_URL};
  function restore(){
    if(saved.app===undefined)delete process.env.PATHFINDER_APP_URL;else process.env.PATHFINDER_APP_URL=saved.app;
    if(saved.site===undefined)delete process.env.SITE_URL;else process.env.SITE_URL=saved.site;
  }
  async function call(key,method,body,headers={}){
    let statusCode=200,jsonBody=null;
    const res={status(c){statusCode=c;return res;},json(b){jsonBody=b;return res;}};
    await session({method,headers:{'x-app-key':key,...headers},body:body||{}},res);
    return {statusCode,jsonBody};
  }
  try{
    __resetForTests();
    const key=await svc.getOrCreateFreeLicense('krisp-url@example.com');
    await svc.activateOrRenewPro({licenseKey:key,paymentCustomerId:'url_customer',paymentSubscriptionId:'url_subscription'});

    delete process.env.PATHFINDER_APP_URL;delete process.env.SITE_URL;
    const fallback=await call(key,'GET');
    check('with no configuration and no host the production origin is the last-resort default',
      fallback.jsonBody.webhookUrl.startsWith('https://kidbuster.vercel.app/api/krisp-webhook?token='));
    const token=new URL(fallback.jsonBody.webhookUrl).searchParams.get('token');
    check('token is a 64-hex credential',/^[a-f0-9]{64}$/.test(token));

    const hosted=await call(key,'GET',null,{host:'pathfinder-v2-staging.vercel.app'});
    check('without configuration the request host is used (never production)',
      hosted.jsonBody.webhookUrl==='https://pathfinder-v2-staging.vercel.app/api/krisp-webhook?token='+token);
    const forwarded=await call(key,'GET',null,{'x-forwarded-host':'staging.example.test, other.example','host':'ignored.example'});
    check('x-forwarded-host takes precedence and only its first value is used',
      forwarded.jsonBody.webhookUrl.startsWith('https://staging.example.test/api/krisp-webhook?token='));
    const injected=await call(key,'GET',null,{host:'evil.example/path?x=1'});
    check('a malformed host header is ignored rather than trusted',
      injected.jsonBody.webhookUrl.startsWith('https://kidbuster.vercel.app/'));

    process.env.SITE_URL='https://site.example.test/';
    const site=await call(key,'GET',null,{host:'ignored.example'});
    check('SITE_URL configures the origin and a trailing slash is normalised',
      site.jsonBody.webhookUrl==='https://site.example.test/api/krisp-webhook?token='+token);

    process.env.PATHFINDER_APP_URL='https://app.example.test/some/path/';
    const app=await call(key,'GET',null,{host:'ignored.example'});
    check('PATHFINDER_APP_URL wins and only its origin is used',
      app.jsonBody.webhookUrl==='https://app.example.test/api/krisp-webhook?token='+token);

    process.env.PATHFINDER_APP_URL='not a url';
    const bad=await call(key,'GET');
    check('an invalid configured URL is skipped in favour of the next source',
      bad.jsonBody.webhookUrl.startsWith('https://site.example.test/'));

    process.env.PATHFINDER_APP_URL='http://insecure.example.test';
    const insecure=await call(key,'GET');
    check('plain http is refused for a non-local configured origin',
      insecure.jsonBody.webhookUrl.startsWith('https://site.example.test/'));

    process.env.PATHFINDER_APP_URL='http://localhost:3000';
    const local=await call(key,'GET');
    check('plain http is allowed for localhost development',
      local.jsonBody.webhookUrl.startsWith('http://localhost:3000/api/krisp-webhook?token='));

    process.env.PATHFINDER_APP_URL='https://app.example.test';
    const regenerated=await call(key,'POST',{action:'regenerate'});
    check('regenerating a token also returns the configured origin',
      regenerated.statusCode===200&&regenerated.jsonBody.webhookUrl.startsWith('https://app.example.test/api/krisp-webhook?token=')&&
      !regenerated.jsonBody.webhookUrl.endsWith(token));
  }finally{restore();}
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
