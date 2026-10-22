'use strict';
// Emergency hotfix regression tests. Synthetic keys only: no production calls.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createChecker } = require('./helpers/assert.cjs');
module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-hotfix-licensing.cjs ===');
  process.env.KIDBUSTER_TEST_KV = '1';
  const originalNotifications = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const svc = await import('../api/_lib/license-service.js');
  const licensing = await import('../api/_lib/licensing.js');
  const { __resetForTests } = await import('../api/_lib/kv-client.js');
  const status = (await import('../api/license-status.js')).default;
  const krisp = (await import('../api/krisp-session.js')).default;
  const ownerLookup = (await import('../api/admin-license-lookup.js')).default;
  async function send(handler, key, installation = 'anon-original'){
    let code = null, body = null;
    const req = {method:'GET', headers:{'x-app-key':key,'x-installation-id':installation},body:{}};
    const res = {status(n){code=n;return this;},json(v){body=v;return this;}};
    await handler(req,res);
    return {code,body};
  }
  try{
    __resetForTests();
    const t0 = Date.now();
    const first = await svc.createManualProLicense({email:'same-person@example.test'});
    const second = await svc.createManualProLicense({email:'same-person@example.test'});
    const third = await svc.createManualProLicense({email:'same-person@example.test'});
    const all = [first,second,third];
    check('three issued codes are three different keys',new Set(all.map(x=>x.licenseKey)).size===3);
    check('each newly issued code has NO expiry before activation',all.every(x=>x.expiresAt===null && (x.days||30)===30));
    check('email lookup points to newest code, but each older code still independently exists',
      (await licensing.getLicenseKeyByEmail('same-person@example.test'))===third.licenseKey &&
      (await licensing.getLicense(first.licenseKey)).expiresAt===first.expiresAt);
    const allStatuses = await Promise.all(all.map(x=>send(status,x.licenseKey,'anon-same-browser')));
    check('every distinct fresh code independently reports active Pro',allStatuses.every(r=>r.code===200 && r.body.plan==='pro' && r.body.status==='active' && !r.body.expired));
    await licensing.saveLicense(first.licenseKey,{...(await licensing.getLicense(first.licenseKey)),expiresAt:'2000-01-01T00:00:00.000Z'});
    check('expiring one key never expires other separate keys',(await send(status,first.licenseKey,'anon-same-browser')).body.expired === true &&
      (await send(status,second.licenseKey,'anon-same-browser')).body.expired === false);
    const oldOwner = process.env.OWNER_LICENSE_KEYS;
    process.env.OWNER_LICENSE_KEYS = 'hotfix-owner-test';
    let lookupBody = null;
    const ownerResponse = {status(n){this.code=n;return this;},json(x){lookupBody=x;return this;}};
    await ownerLookup({method:'POST',headers:{'x-app-key':'hotfix-owner-test'},body:{licenseKey:first.licenseKey}},ownerResponse);
    check('owner-only lookup reports the effective expiry and issue timestamp',
      ownerResponse.code===200 && lookupBody.license.expired===true &&
      !!lookupBody.license.createdAt && lookupBody.license.expiresAt==='2000-01-01T00:00:00.000Z');
    let refusedStatus = null, refusedBody = null;
    const refusedRes = {status(x){refusedStatus=x;return this;},json(x){refusedBody=x;return this;}};
    await ownerLookup({method:'POST',headers:{'x-app-key':'not-owner'},body:{licenseKey:first.licenseKey,action:'renew-manual'}},refusedRes);
    check('manual renewal endpoint rejects requests without owner credentials',refusedStatus===403);
    const beforeRenew = await licensing.getLicense(first.licenseKey);
    let renewalStatus=null, renewalResponse=null;
    const renewalRes={status(x){renewalStatus=x;return this;},json(x){renewalResponse=x;return this;}};
    await ownerLookup({method:'POST',headers:{'x-app-key':'hotfix-owner-test'},body:{licenseKey:first.licenseKey,action:'renew-manual'}},renewalRes);
    const afterRenew=await licensing.getLicense(first.licenseKey);
    check('owner can renew an expired manual license on the same key for 30 days',
      renewalStatus===200 && renewalResponse.renewed===true &&
      renewalResponse.license.expired===false && Date.parse(afterRenew.expiresAt)>Date.now()+29*864e5);
    check('renewing existing license preserves Krisp identity and browser claim',
      afterRenew.claimedInstallationId===beforeRenew.claimedInstallationId &&
      afterRenew.createdAt===beforeRenew.createdAt &&
      (await send(krisp,first.licenseKey)).code===200);
    check('renewed license remains bound to original browser',
      (await send(status,first.licenseKey,'anon-another-browser')).code===403);
    const secondBefore=await licensing.getLicense(second.licenseKey);
    const secondRenewal=await svc.renewManualProLicense(second.licenseKey);
    check('renewing before expiry adds 30 days without discarding remaining time',
      secondRenewal.ok===true &&
      Math.abs(Date.parse(secondRenewal.license.expiresAt)-Date.parse(secondBefore.expiresAt)-30*864e5)<2000);
    const freeForTest=await svc.getOrCreateFreeLicense('notmanual@example.test');
    const freeRenewal=await svc.renewManualProLicense(freeForTest);
    check('manual renewal refuses Free or nonmanual license',freeRenewal.ok===false && freeRenewal.reason==='not_manual');
    if(oldOwner===undefined) delete process.env.OWNER_LICENSE_KEYS;
    else process.env.OWNER_LICENSE_KEYS=oldOwner;
    const wrongBrowser = await send(status,second.licenseKey,'anon-another-browser');
    check('single-device claim remains enforced for manual Pro',wrongBrowser.code===403 && wrongBrowser.body.reason==='key_already_claimed');

    __resetForTests();
    const oldManual = await svc.createManualProLicense({email:'upgrade@example.test'});
    let rec = await licensing.getLicense(oldManual.licenseKey);
    await licensing.saveLicense(oldManual.licenseKey,{...rec,expiresAt:'2000-01-01T00:00:00.000Z',claimedInstallationId:'anon-first',claimedAt:'2025-01-01T00:00:00Z'});
    check('expired manual Pro is denied Krisp before paid upgrade',(await send(krisp,oldManual.licenseKey)).code===403);
    const upgradedKey=await svc.activateOrRenewPro({licenseKey:oldManual.licenseKey,paymentCustomerId:'hotfix-cust',paymentSubscriptionId:'hotfix-sub'});
    rec=await licensing.getLicense(oldManual.licenseKey);
    check('paid upgrade keeps the same key and clears stale manual expiry/device binding',upgradedKey===oldManual.licenseKey &&
      rec.plan==='pro' && rec.status==='active' && rec.manual===false && rec.expiresAt===null && rec.claimedInstallationId===null);
    check('previously expired upgraded Pro regains entitlement on another browser',(await svc.checkEntitlement(upgradedKey,'OF','anon-other')).allowed===true);
    check('previously expired upgraded Pro regains Krisp',(await send(krisp,upgradedKey)).code===200);
    await svc.downgradeToFree({licenseKey:upgradedKey});
    const down=await licensing.getLicense(upgradedKey);
    check('downgrade removes expired timestamp and keeps ongoing Free access',down.plan==='free' && down.status==='active' && down.expiresAt===null &&
      (await svc.checkEntitlement(upgradedKey,'MA')).allowed===true);
    check('downgrade correctly removes Krisp entitlement',(await send(krisp,upgradedKey)).code===403);
    const disabledKey = await svc.getOrCreateFreeLicense('disabled@example.test');
    await licensing.saveLicense(disabledKey,{...(await licensing.getLicense(disabledKey)),plan:'pro',status:'inactive',expiresAt:'2000-01-01T00:00:00.000Z'});
    await svc.downgradeToFree({licenseKey:disabledKey});
    const disabledAfter = await licensing.getLicense(disabledKey);
    check('downgrade cannot reactivate an independently inactive account',
      disabledAfter.status==='inactive' && disabledAfter.expiresAt===null &&
      (await svc.checkEntitlement(disabledKey,'MA')).allowed===false);

    const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
    const i=html.indexOf('let accountStatusRequestId = 0;');
    const j=html.indexOf('async function lookupLicenseForReset(){',i);
    check('browser code contains refresh request version guard',i!==-1 && j>i);
    if(i>=0 && j>i){
      let key='old-code';
      const snapshots=[], pending={};
      const context={
        window:{},
        getStoredAccessKey:()=>key,
        getAccessInstallationId:()=> 'anon-test',
        fetch:(_url,options)=>new Promise(resolve=>{pending[options.headers['x-app-key']]=resolve;}),
        updateAccountSnapshot:(...args)=>snapshots.push(args),
        renderAccountTrials:()=>{},
        maskAccessKey:k=>k,
        formatAccountStatus:s=>s,
        formatExpiryDate:s=>s,
      };
      vm.createContext(context);
      vm.runInContext(html.slice(i,j)+'\nthis.hotfixRefresh=refreshAccountPanel;',context);
      const oldRequest=context.hotfixRefresh();
      key='new-code';
      const newRequest=context.hotfixRefresh();
      pending['new-code']({ok:true,json:async()=>({plan:'pro',status:'active',expired:false,founder:false,usageCount:0,expiresAt:null})});
      await newRequest;
      pending['old-code']({ok:true,json:async()=>({plan:'pro',status:'expired',expired:true,expiresAt:'2000-01-01T00:00:00.000Z'})});
      await oldRequest;
      const last=snapshots.at(-1);
      check('late expired response from OLD code cannot overwrite the NEW active code',
        last[1]==='Pro' && last[4]==='new-code' && last[0].includes('active'));
      check('different key is actually sent to API after code switch',Object.keys(pending).includes('old-code') && Object.keys(pending).includes('new-code'));
    }
  }finally{
    if(originalNotifications===undefined)delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
    else process.env.GOOGLE_SHEET_WEBHOOK_URL=originalNotifications;
  }
  return getFailures();
};
if(require.main===module){module.exports().then(f=>process.exit(f?1:0)).catch(e=>{console.error(e);process.exit(1)});}
