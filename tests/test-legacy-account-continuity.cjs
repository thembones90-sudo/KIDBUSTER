'use strict';
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-legacy-account-continuity.cjs ===');
  const save={kv:process.env.KIDBUSTER_TEST_KV,owner:process.env.OWNER_LICENSE_KEYS};
  process.env.KIDBUSTER_TEST_KV='1';
  process.env.OWNER_LICENSE_KEYS='test_founder_no_transfer';
  try{
    const {__resetForTests}=await import('../api/_lib/kv-client.js');
    const svc=await import('../api/_lib/license-service.js');
    const lic=await import('../api/_lib/licensing.js');
    const {createVerificationToken}=await import('../api/_lib/account-verification.js');
    const {default:handler}=await import('../api/license-verify.js');
    const {default:statusHandler}=await import('../api/license-status.js');
    const {LEGACY_HOST,NEW_HOST}=await import('../api/_lib/legacy-transfer.js');
    __resetForTests();
    async function call(api,{body={},headers={},method='POST'}={}){
      let status=200,payload;
      const response={status(n){status=n;return this;},json(x){payload=x;return this;},setHeader(){}};
      await api({body,headers,method,query:{}},response);
      return {status,payload};
    }
    const keyHeaders=(key,id='old-browser')=>({'x-app-key':key,'x-installation-id':id,origin:LEGACY_HOST});
    const issue=(key,id='old-browser',origin=LEGACY_HOST)=>call(handler,{body:{action:'issue_legacy_transfer'},headers:keyHeaders(key,id) && {...keyHeaders(key,id),origin}});
    const redeem=(ticket,origin=NEW_HOST)=>call(handler,{body:{action:'redeem_legacy_transfer',ticket},headers:{origin}});
    const email=(address,intent)=>createVerificationToken({email:address,intent}).then(({token})=>call(handler,{body:{token}}));
    const ALPHA='original-manual-account@example.test';
    const {licenseKey:manual}=await svc.createManualProLicense({note:'legacy key no email'});
    const oldStatus=await call(statusHandler,{method:'GET',headers:keyHeaders(manual)});
    check('old unindexed manual key is legitimate Pro',oldStatus.status===200&&oldStatus.payload.plan==='pro');
    const originalRecord=JSON.stringify(await lic.getLicense(manual));
    check('manual license has no email index',await lic.getLicenseKeyByEmail(ALPHA)===null);
    const lost=await email(ALPHA,'recover');
    check('unmatched email recovery does NOT create a fake Free identity',lost.status===409&&!lost.payload?.licenseKey&&await lic.getLicenseKeyByEmail(ALPHA)===null);
    const lostAgain=await email(ALPHA,'recover');
    check('repeated unknown recovery still does not create Free',lostAgain.status===409&&await lic.getLicenseKeyByEmail(ALPHA)===null);
    check('unknown recovery never mutates old Pro record',JSON.stringify(await lic.getLicense(manual))===originalRecord);
    const badOrigin=await issue(manual,'old-browser','https://attacker.example');
    check('ticket issue demands exact legacy origin',badOrigin.status===400);
    const otherDevice=await issue(manual,'another-device');
    check('manual key claimed on old browser cannot be stolen by another device',otherDevice.status===400);
    const founder=await issue('test_founder_no_transfer');
    check('founder key cannot be transferred through public origin bridge',founder.status===400);
    const begun=await issue(manual);
    check('original browser gets opaque one-time ticket, not access key in URL',begun.status===200&&typeof begun.payload?.ticket==='string'&&begun.payload.ticket.length>=40&&!begun.payload.ticket.includes('kb_live_'));
    const ticket=begun.payload?.ticket;
    check('redeem demands new Classbuster host',(await redeem(ticket,'https://attacker.example')).status===400);
    const arrived=await redeem(ticket);
    check('redeem returns same original Pro key and claimed installation',arrived.status===200&&arrived.payload.licenseKey===manual&&arrived.payload.installationId==='old-browser'&&arrived.payload.plan==='pro');
    check('transfer ticket cannot be reused',(await redeem(ticket)).status===400);
    const afterStatus=await call(statusHandler,{method:'GET',headers:{'x-app-key':arrived.payload.licenseKey,'x-installation-id':arrived.payload.installationId}});
    check('arrived account retains Pro and the same device claim',afterStatus.status===200&&afterStatus.payload.plan==='pro');
    check('transfer never changes paid record or other entitlements',JSON.stringify(await lic.getLicense(manual))===originalRecord);
    const newFree=await svc.getOrCreateFreeLicense('existing-free@example.test');
    const freeBefore=JSON.stringify(await lic.getLicense(newFree));
    const freeTicket=await issue(newFree,'free-browser');
    const restoredFree=await redeem(freeTicket.payload.ticket);
    check('Free customers migrate with same key, not a new plan',restoredFree.status===200&&restoredFree.payload.plan==='free'&&restoredFree.payload.licenseKey===newFree);
    check('Free record stays untouched',JSON.stringify(await lic.getLicense(newFree))===freeBefore);
    const indexed=await svc.createManualProLicense({email:'indexed-paid@example.test'});
    const linked=await email('indexed-paid@example.test','recover');
    check('email-linked manual Pro recovers original key',linked.status===200&&linked.payload.licenseKey===indexed.licenseKey&&linked.payload.plan==='pro');
    const paid=await svc.activateOrRenewPro({email:'subscriber@example.test',paymentCustomerId:'test_cust',paymentSubscriptionId:'test_sub'});
    const paidRecovery=await email('subscriber@example.test','recover');
    check('existing subscriber recovers EXACT paid key',paidRecovery.status===200&&paidRecovery.payload.licenseKey===paid&&paidRecovery.payload.plan==='pro');
    const signup=await email('brand-new@example.test','signup');
    check('genuinely new signup still creates Free',signup.status===200&&signup.payload.plan==='free');
    await lic.saveEmailIndex('stale@example.test','kb_live_missing_abcdef');
    const stale=await email('stale@example.test','recover');
    check('stale email index does not mint replacement Free',stale.status===409&&!stale.payload?.licenseKey);
    const parallel=await Promise.all(Array.from({length:8},()=>svc.getOrCreateFreeLicense('parallel@example.test')));
    check('simultaneous Free signup converges to one key',new Set(parallel).size===1);
  }catch(error){
    console.log('  FAIL  unexpected error: '+(error?.stack||error));
    check('legacy account integration completed',false);
  }finally{
    for(const [k,v] of [['KIDBUSTER_TEST_KV',save.kv],['OWNER_LICENSE_KEYS',save.owner]]){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exitCode=n?1:0);
