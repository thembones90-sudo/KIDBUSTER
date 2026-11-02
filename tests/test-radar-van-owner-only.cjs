'use strict';
// Scout entitlement after the public release (owner approval 2026-11-02):
// the master account and active Pro accounts (the Krisp import rule) may use
// Scout; Free, expired, inactive and malformed keys may not, and malformed
// keys are refused before any Redis read. (File name kept from the owner-only
// pilot it replaces.)
const {createChecker}=require('./helpers/assert.cjs');
const key=c=>'kb_live_'+c.repeat(48);
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 const before={owner:process.env.OWNER_LICENSE_KEYS,enabled:process.env.RADAR_VAN_ENABLED,hash:process.env.RADAR_VAN_OWNER_SHA256};
 console.log('\n=== test-radar-van-owner-only.cjs ===');
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.OWNER_LICENSE_KEYS='radar-private-owner-test';
 process.env.RADAR_VAN_ENABLED='true';
 process.env.RADAR_VAN_OWNER_SHA256=require('node:crypto').createHash('sha256').update('radar-private-owner-test').digest('hex');
 try{
  const rv=await import('../api/_lib/radar-van.js');
  const kvMod=await import('../api/_lib/kv-client.js');
  const lic=await import('../api/_lib/licensing.js');
  const handler=(await import('../api/_lib/radar-van-session-handler.js')).default;
  kvMod.__resetForTests();
  const owner='radar-private-owner-test';
  const pro=key('a'),free=key('b'),expired=key('c'),inactive=key('d'),stock=key('e'),unknown=key('f');
  await lic.saveLicense(pro,{plan:'pro',status:'active',source:'subscription',subscriptionStatus:'active'});
  await lic.saveLicense(free,{plan:'free',status:'active'});
  await lic.saveLicense(expired,{plan:'pro',status:'active',expiresAt:new Date(Date.now()-60000).toISOString()});
  await lic.saveLicense(inactive,{plan:'pro',status:'revoked'});
  await lic.saveLicense(stock,{plan:'pro',status:'active',manual:true,activationPending:true});

  check('owner entitled',(await rv.accountEntitlement(owner)).allowed===true&&(await rv.accountEntitlement(owner)).founder===true);
  check('active Pro entitled (not as founder)',(await rv.accountEntitlement(pro)).allowed===true&&(await rv.accountEntitlement(pro)).founder===false);
  for(const [label,k] of [['Free',free],['expired Pro',expired],['inactive Pro',inactive],['stock key before activation',stock],['unknown key',unknown]])
   check(label+' denied',!(await rv.accountEntitlement(k)).allowed&&!(await rv.peekRadarVersion(k)).allowed);
  check('Pro idle poll allowed',(await rv.peekRadarVersion(pro)).allowed===true);
  check('owner still can read idle poll version',(await rv.peekRadarVersion(owner)).allowed===true);

  // Malformed keys never reach Redis; a Pro idle poll is ONE command (MGET).
  const counts={n:0,ops:[]};const wrap=name=>{const real=kvMod.kv[name];kvMod.kv[name]=async(...a)=>{counts.n++;counts.ops.push(name);return real.apply(kvMod.kv,a);};return()=>{kvMod.kv[name]=real;};};
  const undo=['get','mget','set'].map(wrap);
  try{
   counts.n=0;await rv.accountEntitlement('kb_pro');await rv.peekRadarVersion('kb_pro');await rv.peekRadarVersion('junk-key');
   check('malformed keys refused before any Redis read',counts.n===0);
   counts.n=0;counts.ops=[];await rv.peekRadarVersion(pro);
   check('Pro idle poll costs one MGET',counts.n===1&&counts.ops[0]==='mget');
  }finally{undo.forEach(f=>f());}

  const request=async (k, since)=>{
   const req={method:'GET',headers:{'x-app-key':k,...(since?{'x-radar-since':since}:{})},query:{radar:'session'}};
   const res={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
   await handler(req,res);return res;
  };
  check('Pro reads its session and optimized version',(await request(pro)).code===200&&(await request(pro,'0')).code===200);
  check('Free cannot read session or optimized version',(await request(free)).code===403&&(await request(free,'0')).code===403);
  check('owner session accessible without a stored paid license',(await request(owner)).code===200);

  // A device token belonging to an account without Scout is refused on ingest.
  const ingest=(await import('../api/_lib/radar-van-ingest-handler.js')).default;
  const token=await rv.issueRadarToken(free);
  const denied={code:200,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
  await ingest({method:'POST',url:'/api/feedback?radar=ingest',query:{radar:'ingest'},socket:{remoteAddress:'127.0.0.1'},
    headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:{}},denied);
  check('a Free account device token is rejected on ingest',denied.code===403);

  // The private Blob installer stays master-only (Pro uses the public release).
  const download=(await import('../api/_lib/radar-van-download-handler.js')).default;
  const dl=async k=>{const res={code:200,setHeader(){},status(n){this.code=n;return this},json(b){this.body=b;return this}};await download({method:'GET',headers:{'x-app-key':k}},res);return res.code;};
  check('Pro cannot mint a private installer link',await dl(pro)===403);
  check('Free cannot mint a private installer link',await dl(free)===403);
 }finally{
  if(before.owner===undefined)delete process.env.OWNER_LICENSE_KEYS;else process.env.OWNER_LICENSE_KEYS=before.owner;
  if(before.enabled===undefined)delete process.env.RADAR_VAN_ENABLED;else process.env.RADAR_VAN_ENABLED=before.enabled;
  if(before.hash===undefined)delete process.env.RADAR_VAN_OWNER_SHA256;else process.env.RADAR_VAN_OWNER_SHA256=before.hash;
 }
 return getFailures();
};
