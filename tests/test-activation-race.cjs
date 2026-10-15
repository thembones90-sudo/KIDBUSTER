'use strict';
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-activation-race.cjs ===');
  const priorMode=process.env.KIDBUSTER_TEST_KV;
  process.env.KIDBUSTER_TEST_KV='1';
  const oldNotify=process.env.GOOGLE_SHEET_WEBHOOK_URL;
  delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const svc=await import('../api/_lib/license-service.js');
  const lic=await import('../api/_lib/licensing.js');
  const {kv,__resetForTests}=await import('../api/_lib/kv-client.js');
  const status=(await import('../api/license-status.js')).default;
  const DAY_MS=86400000;

  async function statusOn(key,id){
    const req={method:'GET',headers:{'x-app-key':key,'x-installation-id':id||''}};
    const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
    await status(req,res);
    return {code:res.code,body:res.body,id};
  }

  try{
    __resetForTests();
    const entries=await svc.createManualProLicense({email:'race@example.invalid'});
    const key=entries.licenseKey;
    const beginning=Date.now();
    const contenders=Array.from({length:64},(_,i)=>'race-browser-'+i);
    const results=await Promise.all(contenders.map(id=>statusOn(key,id)));
    const granted=results.filter(x=>x.code===200);
    const denied=results.filter(x=>x.code===403 && x.body?.reason==='key_already_claimed');
    const record=await lic.getLicense(key);
    const marker=await lic.getManualClaim(key);

    check('64 simultaneous distinct browsers produce exactly ONE 200',granted.length===1);
    check('other 63 simultaneous browsers cannot claim the same license',denied.length===63);
    check('persisted license and atomic winner marker name the same browser',
      granted.length===1 && marker.installationId===granted[0].id &&
      record.claimedInstallationId===marker.installationId);
    check('expiry derived once from winning marker, exactly 30 days from first claim',
      record.expiresAt===marker.expiresAt &&
      Date.parse(record.expiresAt)>=beginning+DAY_MS*30 &&
      Date.parse(record.expiresAt)<=Date.now()+DAY_MS*30+1000);

    const repeated=await Promise.all(Array.from({length:48},()=>statusOn(key,granted[0].id)));
    const afterRepeat=await lic.getLicense(key);
    check('48 concurrent refreshes by the winning browser all pass',
      repeated.every(x=>x.code===200));
    check('repeated same-browser requests never restart 30-day clock',
      afterRepeat.expiresAt===marker.expiresAt);

    // Simulate the real failure window: Redis SET NX succeeds but the
    // subsequent license-record write fails (e.g. temporary KV outage).
    __resetForTests();
    const interrupted=(await svc.createManualProLicense({})).licenseKey;
    const actualSet=kv.set.bind(kv);
    let failNextWrite=true;
    kv.set=async (name,...args)=>{
      if(failNextWrite && name==='license:'+interrupted){
        failNextWrite=false;
        throw new Error('Synthetic post-claim license-write outage');
      }
      return actualSet(name,...args);
    };
    const failed=await statusOn(interrupted,'original-browser');
    kv.set=actualSet;
    const interruptedMarker=await lic.getManualClaim(interrupted);
    const pending=await lic.getLicense(interrupted);
    check('simulated outage returns 500 without granting a different browser',
      failed.code===500 && interruptedMarker?.installationId==='original-browser' &&
      pending.activationPending===true);
    const intruder=await statusOn(interrupted,'intruder-browser');
    check('second browser cannot steal claim while record is still pending',
      intruder.code===403 && intruder.body?.reason==='key_already_claimed');
    const repaired=await statusOn(interrupted,'original-browser');
    const final=await lic.getLicense(interrupted);
    check('owner retries interrupted activation and repairs the stored license',
      repaired.code===200 && final.activationPending===false &&
      final.claimedInstallationId==='original-browser');
    check('recovery preserves original activation time and expiry',
      final.expiresAt===interruptedMarker.expiresAt &&
      final.activatedAt===interruptedMarker.activatedAt);

    // The owner can reset the browser binding without extending access,
    // and the next 64 simultaneous requests still elect ONE browser.
    __resetForTests();
    const resetKey=(await svc.createManualProLicense({})).licenseKey;
    await statusOn(resetKey,'first-browser');
    const preResetRecord=await lic.getLicense(resetKey);
    const originalExpiry=preResetRecord.expiresAt;
    const reset=await svc.resetManualLicenseClaim(resetKey);
    check('reset succeeds and clears atomic browser claim',
      reset.ok===true && (await lic.getManualClaim(resetKey))===null);
    const staleAccess=await svc.claimManualLicenseForInstallation(resetKey,preResetRecord,'first-browser');
    check('stale pre-reset request cannot bypass a missing atomic marker',
      staleAccess.allowed===false && staleAccess.reason==='claim_conflict');
    const newRace=await Promise.all(Array.from({length:64},(_,i)=>statusOn(resetKey,'new-browser-'+i)));
    const newWinner=newRace.filter(x=>x.code===200);
    const afterReset=await lic.getLicense(resetKey);
    check('rebind race elects exactly one new browser',newWinner.length===1 &&
      newRace.filter(x=>x.code===403).length===63);
    check('rebind never extends the original 30-day period',
      afterReset.expiresAt===originalExpiry && afterReset.activatedAt!==null);

    // Previously activated licenses predate manualClaim:... markers.
    __resetForTests();
    const legacy=(await svc.createManualProLicense({})).licenseKey;
    await lic.saveLicense(legacy,{...(await lic.getLicense(legacy)),
      activationPending:false,claimedInstallationId:'original-legacy-browser',
      claimedAt:'2026-10-01T12:00:00.000Z',activatedAt:'2026-10-01T12:00:00.000Z',
      expiresAt:'2026-11-01T12:00:00.000Z'});
    check('already-claimed pre-migration legacy code remains usable by its owner',
      (await statusOn(legacy,'original-legacy-browser')).code===200);
    check('legacy code still refuses a different browser',
      (await statusOn(legacy,'unauthorized-browser')).code===403);
    const legacyReset=await svc.resetManualLicenseClaim(legacy);
    const moved=await statusOn(legacy,'replacement-browser');
    const movedRecord=await lic.getLicense(legacy);
    check('legacy owner reset migrates to atomic claim with original expiry',
      legacyReset.ok && moved.code===200 &&
      movedRecord.expiresAt==='2026-11-01T12:00:00.000Z' &&
      (await lic.getManualClaim(legacy)).installationId==='replacement-browser');

    // Paid subscription is not bound to a specific manual-license browser.
    __resetForTests();
    const paid=(await svc.createManualProLicense({email:'buyer@example.invalid'})).licenseKey;
    await statusOn(paid,'first-paid-browser');
    await svc.activateOrRenewPro({
      licenseKey:paid,email:'buyer@example.invalid',
      paymentCustomerId:'synthetic-payment-customer',
      paymentSubscriptionId:'synthetic-paid-subscription'
    });
    check('paid upgrade clears the atomic manual claim marker',
      (await lic.getManualClaim(paid))===null);
    check('paid upgraded account works on another browser',
      (await statusOn(paid,'second-paid-browser')).code===200);

  }finally{
    if(priorMode===undefined)delete process.env.KIDBUSTER_TEST_KV;
    else process.env.KIDBUSTER_TEST_KV=priorMode;
    if(oldNotify===undefined)delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
    else process.env.GOOGLE_SHEET_WEBHOOK_URL=oldNotify;
  }
  return getFailures();
};

if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{
  console.error(e);process.exit(1);
});
