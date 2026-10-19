'use strict';
const { createChecker } = require('./helpers/assert.cjs');
module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-staging-payment-safety.cjs ===');
  const prior=process.env.VERCEL_ENV;
  try{
    const handler=(await import('../api/create-checkout-session.js')).default;
    const invoke=async (method,body={})=>{
      let statusCode=0,jsonBody=null,cache=null;
      const res={setHeader(n,v){if(n==='Cache-Control')cache=v;return res;},status(c){statusCode=c;return res;},json(v){jsonBody=v;return res;}};
      await handler({method,headers:{},body},res);
      return {statusCode,jsonBody,cache};
    };
    process.env.VERCEL_ENV='preview';
    const blocked=await invoke('POST',{action:'checkout',email:'example@test.invalid'});
    check('preview checkout blocked before account/email verification',blocked.statusCode===409);
    check('preview response does not contain any checkout URL',!blocked.jsonBody.url);
    check('preview message points only to the legitimate live site',blocked.jsonBody.error.includes('https://kidbuster.vercel.app'));
    check('preview response cannot be cached',blocked.cache==='no-store');
    check('preview GET retains method boundary',(await invoke('GET')).statusCode===405);
    process.env.VERCEL_ENV='production';
    const prod=await invoke('POST',{action:'checkout',email:'not-an-email'});
    check('production is NOT blocked by preview guard',prod.statusCode===400);
  }finally{
    if(prior===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=prior;
  }
  return getFailures();
};
