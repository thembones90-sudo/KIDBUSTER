'use strict';
module.exports=async()=>{
 const assert=require('node:assert/strict'),crypto=require('node:crypto');
 const saved={owner:process.env.OWNER_LICENSE_KEYS,hash:process.env.RADAR_VAN_OWNER_SHA256};
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.OWNER_LICENSE_KEYS='scout-owner-a,scout-owner-b';
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 try{
  const rv=await import('../api/_lib/radar-van.js');
  process.env.RADAR_VAN_OWNER_SHA256=hash('scout-owner-a');
  assert.equal((await rv.accountEntitlement('scout-owner-a')).allowed,true);
  for(const identity of ['scout-owner-b','regular-pro','regular-free','',null]){
   assert.equal((await rv.accountEntitlement(identity)).allowed,false);
   assert.equal((await rv.peekRadarVersion(identity)).allowed,false);
  }
  process.env.RADAR_VAN_OWNER_SHA256=hash('regular-pro');
  assert.equal((await rv.accountEntitlement('regular-pro')).allowed,false,'hash does not grant master privileges');
  for(const malformed of ['', 'not-a-hash',hash('scout-owner-a')+',']){
   process.env.RADAR_VAN_OWNER_SHA256=malformed;
   assert.equal((await rv.accountEntitlement('scout-owner-a')).allowed,false,'malformed configuration fails closed');
  }
  delete process.env.RADAR_VAN_OWNER_SHA256;
  for(const identity of ['scout-owner-a','scout-owner-b']){
   assert.equal((await rv.accountEntitlement(identity)).allowed,false,'a missing fingerprint denies every master key');
   assert.equal((await rv.peekRadarVersion(identity)).allowed,false,'a missing fingerprint denies idle polling too');
  }
  console.log('PASS Scout single-master: fingerprint mandatory, other owners/customers denied, missing or malformed configuration closed');
  return 0;
 }finally{
  for(const [name,value] of [['OWNER_LICENSE_KEYS',saved.owner],['RADAR_VAN_OWNER_SHA256',saved.hash]]){
   if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
 }
};
