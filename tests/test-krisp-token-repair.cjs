'use strict';
const assert=require('node:assert/strict');

module.exports=async function(){
  const {__resetForTests,kv}=await import('../api/_lib/kv-client.js');
  const {resolveKrispToken}=await import('../api/_lib/krisp-token.js');
  const svc=await import('../api/_lib/license-service.js');
  const session=(await import('../api/krisp-session.js')).default;
  __resetForTests();
  const licenseKey=await svc.getOrCreateFreeLicense('krisp-repair-test@example.test');
  await svc.activateOrRenewPro({licenseKey,paymentCustomerId:'repair_customer',paymentSubscriptionId:'repair_subscription'});
  async function get(verify){
    let status=200,response;
    const res={status(code){status=code;return res;},json(data){response=data;return res;}};
    await session({method:'GET',query:verify?{verify:'1'}:{},headers:{'x-app-key':licenseKey}},res);
    assert.equal(status,200);
    return response;
  }
  const original=await get(true);
  assert.equal(original.webhookLinkRepaired,false);
  const firstToken=new URL(original.webhookUrl).searchParams.get('token');
  assert.equal(await resolveKrispToken(firstToken),licenseKey);

  // Simulate a partial KV migration losing reverse index only.
  await kv.del('krisp:token:'+firstToken);
  assert.equal(await resolveKrispToken(firstToken),null);
  const repaired=await get(true);
  assert.equal(repaired.webhookLinkRepaired,true);
  const repairedToken=new URL(repaired.webhookUrl).searchParams.get('token');
  assert.notEqual(repairedToken,firstToken);
  assert.equal(await resolveKrispToken(repairedToken),licenseKey);
  assert.equal(await resolveKrispToken(firstToken),null);
  const again=await get(true);
  assert.equal(again.webhookLinkRepaired,false);
  assert.equal(again.webhookUrl,repaired.webhookUrl);

  // Never claim another account's reverse mapping if a forward index
  // is corrupted: issue a fresh token without deleting the foreign key.
  await kv.set('krisp:token:'+firstToken,{userIdentity:'other-user'});
  await kv.set('krisp:user:'+licenseKey,{token:firstToken,createdAt:new Date().toISOString()});
  const safe=await get(true);
  assert.equal(safe.webhookLinkRepaired,true);
  assert.equal(await resolveKrispToken(firstToken),'other-user');
  assert.equal(await resolveKrispToken(new URL(safe.webhookUrl).searchParams.get('token')),licenseKey);
  console.log('PASS Krisp integration repairs lost/mismatched reverse tokens without reviving revoked URLs or touching other identities');
  return 0;
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});}
