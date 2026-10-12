'use strict';
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-activation-inventory.cjs ===');
  process.env.KIDBUSTER_TEST_KV='1';
  const oldOwner=process.env.OWNER_LICENSE_KEYS;
  const oldNotify=process.env.GOOGLE_SHEET_WEBHOOK_URL;
  process.env.OWNER_LICENSE_KEYS='test-activation-owner';
  delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const svc=await import('../api/_lib/license-service.js');
  const lic=await import('../api/_lib/licensing.js');
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const status=(await import('../api/license-status.js')).default;
  const krisp=(await import('../api/krisp-session.js')).default;
  const batch=(await import('../api/admin-license-lookup.js')).default;
  const krispTokens=await import('../api/_lib/krisp-token.js');
  async function runHandler(handler,{key,installationId,body,method}={}){
    let statusCode=0,json;
    const req={method:method||'POST',headers:{'x-app-key':key||'','x-installation-id':installationId||''},body:body||{}};
    const res={status(code){statusCode=code;return this;},json(obj){json=obj;return this;}};
    await handler(req,res);
    return {statusCode,json};
  }
  try{
    __resetForTests();
    const start=Date.now();
    const entry=await svc.createManualProLicense({email:'inventor@example.test'});
    let record=await lic.getLicense(entry.licenseKey);
    check('fresh stock has no expiry, has pending flag, has no claim',entry.expiresAt===null &&
      record.expiresAt===null && record.activationPending===true &&
      record.activatedAt===null && !record.claimedInstallationId);
    check('owner viewing unused code does not activate it',
      (await runHandler(await import('../api/admin-license-lookup.js').then(m=>m.default),
        {key:'test-activation-owner',body:{licenseKey:entry.licenseKey}})).json.license.activationPending===true);
    check('Krisp cannot access unclaimed stock', (await runHandler(krisp,{method:'GET',key:entry.licenseKey})).statusCode===403);
    const missingId=await runHandler(status,{method:'GET',key:entry.licenseKey});
    check('missing installation cannot activate a pending stock key',missingId.statusCode===403 && missingId.json.reason==='missing_installation');
    check('no timer was started by failed activation', (await lic.getLicense(entry.licenseKey)).expiresAt===null);
    const first=await runHandler(status,{method:'GET',key:entry.licenseKey,installationId:'browser-1'});
    record=await lic.getLicense(entry.licenseKey);
    const firstExpiry=record.expiresAt;
    check('first activation starts precisely the 30-day countdown', first.statusCode===200 &&
      record.activationPending===false && !!record.activatedAt &&
      Date.parse(firstExpiry) >= start+30*864e5 && Date.parse(firstExpiry) <= Date.now()+30*864e5+1000);
    const second=await runHandler(status,{method:'GET',key:entry.licenseKey,installationId:'browser-1'});
    check('repeated status fetch never resets expiry', second.statusCode===200 &&
      (await lic.getLicense(entry.licenseKey)).expiresAt===firstExpiry);
    check('Krisp works only once activated', (await runHandler(krisp,{method:'GET',key:entry.licenseKey})).statusCode===200);
    check('different browser cannot steal claimed license',
      (await runHandler(status,{method:'GET',key:entry.licenseKey,installationId:'browser-2'})).statusCode===403);
    await svc.resetManualLicenseClaim(entry.licenseKey);
    const resetRecord=await lic.getLicense(entry.licenseKey);
    check('resetting browser claim does NOT restart 30-day timer', resetRecord.expiresAt===firstExpiry &&
      resetRecord.activatedAt===record.activatedAt && resetRecord.activationPending===false);
    await runHandler(status,{method:'GET',key:entry.licenseKey,installationId:'browser-2'});
    check('reclaim on another browser preserves the original expiry',
      (await lic.getLicense(entry.licenseKey)).expiresAt===firstExpiry);

    __resetForTests();
    const oldKeys=[];
    for(let i=0;i<3;i++){
      const obj=await svc.createManualProLicense({});
      oldKeys.push(obj.licenseKey);
      await lic.saveLicense(obj.licenseKey,{
        ...(await lic.getLicense(obj.licenseKey)),
        createdAt:'2026-09-11T12:00:00.000Z',
        activationPending:false,
        activatedAt:'2026-09-12T12:00:00.000Z',
        claimedInstallationId:i===0?'customer-browser':null,
        expiresAt:i===1?'2026-11-11T12:00:00.000Z':'2026-10-11T12:00:00.000Z'
      });
    }
    const input=oldKeys.map((key,i)=>(i+1)+'. '+key).join('\n');
    const unauth=await runHandler(batch,{key:'wrong-owner',body:{action:'retire-expired',keys:input}});
    check('retirement is inaccessible to nonowners',unauth.statusCode===403);
    const preview=await runHandler(batch,{key:'test-activation-owner',body:{action:'preview-retirement',keys:input}});
    check('preview recognizes Claude-numbered key text and finds exact expired 2',preview.statusCode===200 &&
      preview.json.summary.retire_eligible===2 && preview.json.summary.protected===1);
    check('preview never returns bearer credentials',preview.json.items.every(x=>!oldKeys.includes(x.key)));
    const before=await lic.getLicense(oldKeys[0]);
    check('preview is strictly read only',before.status==='active');
    const priorWebhookToken=await krispTokens.getOrCreateKrispToken(oldKeys[0]);
    const retired=await runHandler(batch,{key:'test-activation-owner',body:{action:'retire-expired',keys:input}});
    check('retire disables only the expired September 11 records',retired.json.summary.retired===2 &&
      (await lic.getLicense(oldKeys[0])).status==='revoked' &&
      (await lic.getLicense(oldKeys[2])).status==='revoked' &&
      (await lic.getLicense(oldKeys[1])).status==='active');
    check("soft retirement retains claimed customer's metadata, no deletion", (await lic.getLicense(oldKeys[0])).claimedInstallationId==='customer-browser');
    check('retiring inventory invalidates old Krisp webhook authorization',
      (await krispTokens.resolveKrispToken(priorWebhookToken))===null);
    check('retired key is forbidden generation and Krisp',
      (await svc.checkEntitlement(oldKeys[0],'OF','customer-browser')).allowed===false &&
      (await runHandler(krisp,{method:'GET',key:oldKeys[0]})).statusCode===403);
    check('ordinary manual renewal cannot resurrect a deliberately retired code',
      (await svc.renewManualProLicense(oldKeys[0])).reason === 'revoked');
    const again=await runHandler(batch,{key:'test-activation-owner',body:{action:'retire-expired',keys:input}});
    check('retirement is idempotent',again.json.summary.already_retired===2 && again.json.summary.protected===1);
    const made=await runHandler(batch,{key:'test-activation-owner',body:{action:'create-batch',count:3}});
    check('owner creates independent replacement stock',made.statusCode===200 && made.json.created===3 &&
      new Set(made.json.codes).size===3 && made.json.activationPending===true);
    check('all generated batch stock keys await activation',
      (await Promise.all(made.json.codes.map(k=>lic.getLicense(k)))).every(x=>x.activationPending && x.expiresAt===null));
    check('ordinary user cannot mint stock',
      (await runHandler(batch,{key:made.json.codes[0],body:{action:'create-batch',count:1}})).statusCode===403);
    check('bulk creation caps 20 keys',
      (await runHandler(batch,{key:'test-activation-owner',body:{action:'create-batch',count:21}})).statusCode===400);
  }finally{
    if(oldOwner===undefined)delete process.env.OWNER_LICENSE_KEYS;
    else process.env.OWNER_LICENSE_KEYS=oldOwner;
    if(oldNotify===undefined)delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
    else process.env.GOOGLE_SHEET_WEBHOOK_URL=oldNotify;
  }
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1)});
