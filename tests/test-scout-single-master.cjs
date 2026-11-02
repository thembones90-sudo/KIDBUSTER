'use strict';
module.exports=async()=>{
 const assert=require('node:assert/strict'),crypto=require('node:crypto');
 const saved={owner:process.env.OWNER_LICENSE_KEYS,hash:process.env.RADAR_VAN_OWNER_SHA256};
 process.env.KIDBUSTER_TEST_KV='1';
 process.env.OWNER_LICENSE_KEYS='scout-owner-a,scout-owner-b';
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 try{
  const rv=await import('../api/_lib/radar-van.js');
  // Since the public release (2026-11-02) other owner keys and Pro accounts
  // may USE Scout, but MASTER status (founder:true, which alone unlocks the
  // private installer) still needs the fingerprint and still fails closed.
  const master=async id=>(await rv.accountEntitlement(id)).founder===true;
  process.env.RADAR_VAN_OWNER_SHA256=hash('scout-owner-a');
  assert.equal(await master('scout-owner-a'),true);
  assert.equal(await master('scout-owner-b'),false,'another owner key is not the master');
  assert.equal((await rv.accountEntitlement('scout-owner-b')).allowed,true,'another owner key keeps lifetime access');
  for(const identity of ['regular-pro','regular-free','',null]){
   assert.equal((await rv.accountEntitlement(identity)).allowed,false,'malformed or unknown keys are refused');
   assert.equal((await rv.peekRadarVersion(identity)).allowed,false);
  }
  process.env.RADAR_VAN_OWNER_SHA256=hash('regular-pro');
  assert.equal(await master('regular-pro'),false,'hash does not grant master privileges');
  for(const malformed of ['', 'not-a-hash',hash('scout-owner-a')+',']){
   process.env.RADAR_VAN_OWNER_SHA256=malformed;
   assert.equal(await master('scout-owner-a'),false,'malformed configuration fails closed');
  }
  delete process.env.RADAR_VAN_OWNER_SHA256;
  for(const identity of ['scout-owner-a','scout-owner-b'])
   assert.equal(await master(identity),false,'a missing fingerprint denies master status to every key');
  console.log('PASS Scout single-master: master status needs the fingerprint, other owners are not master, unknown keys denied, missing or malformed configuration closed');
  return 0;
 }finally{
  for(const [name,value] of [['OWNER_LICENSE_KEYS',saved.owner],['RADAR_VAN_OWNER_SHA256',saved.hash]]){
   if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
 }
};
