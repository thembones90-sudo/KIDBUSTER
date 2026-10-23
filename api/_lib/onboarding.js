import crypto from 'node:crypto';
import { kv } from './kv-client.js';

// Explicitly stamped only when a NEW account is created by this release.
// Missing metadata never means "new": existing customers remain untouched.
export const ONBOARDING_VERSION = 1;
export function onboardingAccountId(key){
  return crypto.createHash('sha256').update('classbuster:onboarding:v1:' + key).digest('hex');
}
const storageKey = key => 'onboarding:v1:' + onboardingAccountId(key);
export async function readOnboarding(key, license){
  const accountId = onboardingAccountId(key);
  if(license?.onboardingVersion !== ONBOARDING_VERSION || license.status !== 'active' || license.activationPending){
    return { accountId, eligible:false, state:'not_required' };
  }
  try{
    const record = await kv.get(storageKey(key));
    return { accountId, eligible:true, state:record?.state || 'pending' };
  }catch{
    // Onboarding must never make licensing or report generation unavailable.
    return { accountId, eligible:true, state:'unavailable' };
  }
}
export async function finishOnboarding(key, license, state){
  if(!['completed','skipped'].includes(state)) return { status:400, error:'Invalid guide action.' };
  const current = await readOnboarding(key, license);
  if(!current.eligible) return { status:403, error:'No introduction is pending for this account.' };
  try{
    // Separate immutable completion marker: never overwrite a license snapshot
    // while a payment webhook or activation is updating it. No expiry.
    await kv.set(storageKey(key), { state, finishedAt:new Date().toISOString() }, { nx:true });
    return { status:200, onboarding:await readOnboarding(key, license) };
  }catch{
    return { status:503, error:'Your guide choice could not be saved yet. You can keep using Classbuster.' };
  }
}
