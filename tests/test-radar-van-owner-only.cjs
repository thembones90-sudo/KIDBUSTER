'use strict';
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 const before={owner:process.env.OWNER_LICENSE_KEYS,enabled:process.env.RADAR_VAN_ENABLED,hash:process.env.RADAR_VAN_OWNER_SHA256};
 console.log('\n=== test-radar-van-owner-only.cjs ===');
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.OWNER_LICENSE_KEYS='radar-private-owner-test';
 process.env.RADAR_VAN_ENABLED='true';
 // The owner fingerprint is mandatory (fail closed); configure it explicitly.
 process.env.RADAR_VAN_OWNER_SHA256=require('node:crypto').createHash('sha256').update('radar-private-owner-test').digest('hex');
 try{
  const rv=await import('../api/_lib/radar-van.js');
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const handler=(await import('../api/_lib/radar-van-session-handler.js')).default;
  __resetForTests();
  const owner='radar-private-owner-test';
  check('owner entitled during private development',(await rv.accountEntitlement(owner)).allowed===true);
  check('Free and paid Pro keys denied, regardless of plan',!(await rv.accountEntitlement('kb_free')).allowed&&!(await rv.accountEntitlement('kb_pro')).allowed);
  check('free/pro idle polling denied before database lookup',!(await rv.peekRadarVersion('kb_free')).allowed&&!(await rv.peekRadarVersion('kb_pro')).allowed);
  check('owner still can read idle poll version',(await rv.peekRadarVersion(owner)).allowed===true);
  const request=async (key, since)=>{
   const req={method:'GET',headers:{'x-app-key':key,...(since?{'x-radar-since':since}:{})},query:{radar:'session'}};
   const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
   await handler(req,res);return res;
  };
  const r1=await request('kb_pro');
  const r2=await request('kb_pro','0');
  const r3=await request(owner);
  check('paid Pro cannot read session or optimized version',r1.code===403&&r2.code===403);
  check('owner session accessible without a stored paid license',r3.code===200&&r3.body.enabled===true);
  // A token created by an earlier development version must not grant a
  // regular Pro account a back door into lesson ingestion.
  const priorToken=await rv.issueRadarToken('kb_pro');
  const ingest=(await import('../api/_lib/radar-van-ingest-handler.js')).default;
  const denied={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
  await ingest({method:'POST',url:'/api/feedback?radar=ingest',query:{radar:'ingest'},socket:{remoteAddress:'127.0.0.1'},
    headers:{authorization:'Bearer '+priorToken,'content-type':'application/json'},body:{}},denied);
  check('preexisting paid-Pro device token is rejected on ingest',denied.code===403);
 }finally{
  if(before.owner===undefined)delete process.env.OWNER_LICENSE_KEYS;else process.env.OWNER_LICENSE_KEYS=before.owner;
  if(before.enabled===undefined)delete process.env.RADAR_VAN_ENABLED;else process.env.RADAR_VAN_ENABLED=before.enabled;
  if(before.hash===undefined)delete process.env.RADAR_VAN_OWNER_SHA256;else process.env.RADAR_VAN_OWNER_SHA256=before.hash;
 }
 return getFailures();
};
