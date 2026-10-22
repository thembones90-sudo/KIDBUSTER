'use strict';
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 process.env.KIDBUSTER_TEST_KV='1';
 const [{default:handler},lic,svc,kvlib]=await Promise.all([
  import('../api/license-status.js'),import('../api/_lib/licensing.js'),
  import('../api/_lib/license-service.js'),import('../api/_lib/kv-client.js')
 ]);
 const unique=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 async function call(method,key,body,installation='TEST-DEVICE-1'){
  let code=200,response;
  const req={method,headers:{...(key?{'x-app-key':key}:{}),'x-installation-id':installation},body};
  const res={status(x){code=x;return this;},json(x){response=x;return this;}};
  await handler(req,res);
  return {code,body:response};
 }
 const a=await svc.getOrCreateFreeLicense('onboarding-first-'+unique+'@example.test');
 const b=await svc.getOrCreateFreeLicense('onboarding-second-'+unique+'@example.test');
 const initial=await call('GET',a);
 check('genuinely new Free account is onboarding-eligible',initial.code===200&&initial.body.onboardingEligible===true&&initial.body.onboardingState==='never');
 const repeated=await svc.getOrCreateFreeLicense('onboarding-first-'+unique+'@example.test');
 check('re-register/recover same address reuses original key',repeated===a);
 const anonymous=await call('POST','',{state:'completed'});
 check('missing key cannot persist onboarding',anonymous.code===401);
 const invalid=await call('POST','invalid-access-key',{state:'completed'});
 check('invalid key cannot persist onboarding',invalid.code===401);
 const invalidState=await call('POST',a,{state:'invented'});
 check('invalid state rejected',invalidState.code===400);
 const saved=await call('POST',a,{state:'completed'});
 check('validated account can complete onboarding',saved.code===200&&saved.body.onboarding.state==='completed');
 const read=await call('GET',a);
 check('onboarding state survives another API read',read.body.onboardingState==='known'&&read.body.onboarding.state==='completed');
 const second=await call('GET',b);
 check('second account does not inherit first account state',second.body.onboardingState==='never'&&second.body.onboarding===null);
 const skipAttempt=await call('POST',a,{state:'skipped'});
 check('completed state cannot downgrade to skipped',skipAttempt.body.onboarding.state==='completed');
 const secondSkip=await call('POST',b,{state:'skipped'},'TEST-DEVICE-2');
 check('separate device and account can skip independently',secondSkip.code===200&&(await call('GET',b)).body.onboarding.state==='skipped');
 const raw=await kvlib.kv.get('classbuster:onboarding:v1:'+a);
 check('raw access code does not appear in onboarding KV key',raw===null);
 const legacyKey=lic.generateLicenseKey();
 await lic.saveLicense(legacyKey,{email:'legacy-'+unique+'@example.test',plan:'free',status:'active',createdAt:'2025-01-01T00:00:00.000Z'});
 const legacy=await call('GET',legacyKey);
 check('existing/legacy license not shown first-time tour',legacy.code===200&&legacy.body.onboardingEligible===false);
 const manual=await svc.createManualProLicense({email:'manual-'+unique+'@example.test',days:30});
 let manualStatus=await lic.getLicense(manual.licenseKey);
 check('owner-created unactivated key is not marked as onboarded',manualStatus.activationPending===true&&manualStatus.onboardingEligible!==true);
 const activated=await svc.claimManualLicenseForInstallation(manual.licenseKey,manualStatus,'FIRST-INSTALL');
 manualStatus=await lic.getLicense(manual.licenseKey);
 check('new manual Pro key becomes eligible on first real activation',activated.allowed===true&&manualStatus.onboardingEligible===true);
 const direct=await svc.activateOrRenewPro({email:'newpaid-'+unique+'@example.test',paymentCustomerId:'test-customer-'+unique,paymentSubscriptionId:'test-sub-'+unique});
 const paidKey=direct.licenseKey||direct.key||direct;
 const p=await lic.getLicense(paidKey);
 check('direct paid first purchase marks newly created license for tour',p?.plan==='pro'&&p.onboardingEligible===true);
 return getFailures();
};
