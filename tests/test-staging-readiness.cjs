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
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
