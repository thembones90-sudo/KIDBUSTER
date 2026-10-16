// Read-only Pathfinder V2 staging readiness audit.
// Accepts sanitized metadata only; never reads or prints secret values.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
export const REQUIRED_PREVIEW_ENV=[
  'KV_REST_API_URL','KV_REST_API_TOKEN','OWNER_LICENSE_KEYS','FREE_MONTHLY_LIMIT',
  'PAYMENT_PROVIDER','LEMONSQUEEZY_API_KEY','LEMONSQUEEZY_STORE_ID',
  'LEMONSQUEEZY_PRO_VARIANT_ID','LEMONSQUEEZY_WEBHOOK_SECRET','SITE_URL',
  'PATHFINDER_APP_URL','EMAIL_PROVIDER','RESEND_API_KEY','PATHFINDER_EMAIL_FROM'
];

function uniqueNames(items){
  return [...new Set((items||[]).map(item=>typeof item==='string'?item:item?.name).filter(Boolean))].sort();
}

export function evaluateStagingReadiness(metadata={}){
  if('values' in metadata || (metadata.environmentVariables||[]).some(item=>item && typeof item==='object' && 'value' in item)){
    throw new Error('Refusing metadata containing environment-variable values');
  }
  const names=uniqueNames(metadata.environmentVariables);
  const missing=REQUIRED_PREVIEW_ENV.filter(name=>!names.includes(name));
  const wrongTarget=(metadata.environmentVariables||[])
    .filter(item=>item && typeof item==='object' && item.name &&
      !(Array.isArray(item.targets)&&item.targets.length===1&&item.targets[0]==='preview'))
    .map(item=>item.name).sort();
  const blockers=[];
  if(metadata.projectId!=='prj_8AQEDibYCzspPx67Wc0F7EpCFQGY') blockers.push('unexpected_project_identity');
  // SSO on for all deployments, or deliberately off by a recorded owner
  // decision (2026-10-16 public staging; V2-PUBLIC-ACCESS-AND-APP-SECURITY.md).
  // Off without a dated record still blocks.
  const ssoOn=metadata.ssoProtection==='all_deployments';
  const publicApproved=!ssoOn&&[null,undefined,'none','disabled'].includes(metadata.ssoProtection)&&
    typeof metadata.publicAccessApprovedOn==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(metadata.publicAccessApprovedOn);
  if(!ssoOn&&!publicApproved) blockers.push('sso_all_deployments_unverified');
  if(Number(metadata.deploymentCount||0)!==0) blockers.push('deployment_state_requires_review');
  if(missing.length) blockers.push('missing_preview_environment_names');
  if(wrongTarget.length) blockers.push('environment_target_not_preview_only');
  if(metadata.upstashOwnershipConfirmed!==true) blockers.push('upstash_ownership_unverified');
  if(ssoOn&&metadata.webhookAutomationBypassApproved!==true) blockers.push('webhook_sso_path_unapproved');
  if(metadata.testEmailDeliveryConfirmed!==true) blockers.push('test_email_delivery_unverified');
  return {ready:blockers.length===0,blockers,access:ssoOn?'sso_all_deployments':publicApproved?'public_owner_approved':'unverified',missingEnvironmentNames:missing,wrongTargetNames:wrongTarget};
}

function localLayout(){
  const handlers=fs.readdirSync(path.join(root,'api')).filter(name=>name.endsWith('.js')&&name!=='ping.js');
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  return {
    deployableHandlerCount:handlers.length,
    staticPingRewrite:vercel.rewrites?.some(rule=>rule.source==='/api/ping'&&rule.destination==='/ping.json')===true
  };
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const metadataPath=process.argv[2];
  if(!metadataPath){
    console.log(JSON.stringify({ready:false,blockers:['sanitized_metadata_file_required'],...localLayout()},null,2));
    process.exitCode=2;
  }else{
    const metadata=JSON.parse(fs.readFileSync(path.resolve(metadataPath),'utf8'));
    console.log(JSON.stringify({...evaluateStagingReadiness(metadata),...localLayout()},null,2));
  }
}
