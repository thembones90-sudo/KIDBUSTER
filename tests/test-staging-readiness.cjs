'use strict';
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-staging-readiness.cjs ===');
 const audit=await import('../tools/staging/check-staging-readiness.mjs');
 const current=audit.evaluateStagingReadiness({
  projectId:'prj_8AQEDibYCzspPx67Wc0F7EpCFQGY',ssoProtection:'all_deployments',deploymentCount:0,
  environmentVariables:[
   {name:'KV_REST_API_URL',targets:['preview']},{name:'KV_REST_API_TOKEN',targets:['preview']},
   {name:'OWNER_LICENSE_KEYS',targets:['preview']},{name:'FREE_MONTHLY_LIMIT',targets:['preview']}
  ],upstashOwnershipConfirmed:false,webhookAutomationBypassApproved:false,testEmailDeliveryConfirmed:false
 });
 check('known staging shell is not falsely marked ready',current.ready===false);
 check('missing Lemon, URL, and email variable NAMES are reported without values',
  ['LEMONSQUEEZY_API_KEY','LEMONSQUEEZY_WEBHOOK_SECRET','SITE_URL','RESEND_API_KEY']
   .every(name=>current.missingEnvironmentNames.includes(name)));
 check('unverified Redis ownership, SSO webhook path and email are explicit blockers',
  ['upstash_ownership_unverified','webhook_sso_path_unapproved','test_email_delivery_unverified']
   .every(reason=>current.blockers.includes(reason)));
 const complete=audit.evaluateStagingReadiness({
  projectId:'prj_8AQEDibYCzspPx67Wc0F7EpCFQGY',ssoProtection:'all_deployments',deploymentCount:0,
  environmentVariables:audit.REQUIRED_PREVIEW_ENV.map(name=>({name,targets:['preview']})),
  upstashOwnershipConfirmed:true,webhookAutomationBypassApproved:true,testEmailDeliveryConfirmed:true
 });
 check('sanitized complete metadata can pass without reading secret values',complete.ready===true);
 let refused=false;
 try{audit.evaluateStagingReadiness({environmentVariables:[{name:'SECRET',targets:['preview'],value:'must-not-read'}]});}catch{refused=true;}
 check('checker refuses metadata containing values',refused);
 const wrong=audit.evaluateStagingReadiness({
  projectId:'prj_8AQEDibYCzspPx67Wc0F7EpCFQGY',ssoProtection:'all_deployments',deploymentCount:0,
  environmentVariables:audit.REQUIRED_PREVIEW_ENV.map(name=>({name,targets:name==='SITE_URL'?['production']:['preview']})),
  upstashOwnershipConfirmed:true,webhookAutomationBypassApproved:true,testEmailDeliveryConfirmed:true
 });
 check('non-Preview environment target blocks readiness',wrong.wrongTargetNames.includes('SITE_URL')&&!wrong.ready);
 const base={projectId:'prj_8AQEDibYCzspPx67Wc0F7EpCFQGY',deploymentCount:0,
  environmentVariables:audit.REQUIRED_PREVIEW_ENV.map(name=>({name,targets:['preview']})),
  upstashOwnershipConfirmed:true,testEmailDeliveryConfirmed:true};
 const silentlyOff=audit.evaluateStagingReadiness({...base,ssoProtection:null});
 check('SSO off WITHOUT a recorded owner decision still blocks',
  !silentlyOff.ready&&silentlyOff.blockers.includes('sso_all_deployments_unverified')&&silentlyOff.access==='unverified');
 const publicOk=audit.evaluateStagingReadiness({...base,ssoProtection:null,publicAccessApprovedOn:'2026-10-16'});
 check('owner-approved public staging is not flagged as an SSO failure',
  publicOk.ready&&publicOk.access==='public_owner_approved');
 check('a malformed approval record does not count',
  !audit.evaluateStagingReadiness({...base,ssoProtection:null,publicAccessApprovedOn:'yes'}).ready);
 check('an unknown SSO mode never counts as approved public access',
  !audit.evaluateStagingReadiness({...base,ssoProtection:'preview',publicAccessApprovedOn:'2026-10-16'}).ready);
 check('with SSO on, the webhook bypass approval is still required',
  audit.evaluateStagingReadiness({...base,ssoProtection:'all_deployments'}).blockers.includes('webhook_sso_path_unapproved'));
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
