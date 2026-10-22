// Returns the current license/account status for the key saved in the
// browser. This is deliberately read-only: it never creates, upgrades, or
// downgrades anything.
//
// Reports trial usage for every protocol in TRIAL_ELIGIBLE_PROTOCOLS (an
// explicit, hand-maintained business-rule list in licensing.js — not
// derived from which protocols happen to have a display label) in one
// response, keyed by protocol — deliberately not a single "?protocol=X"
// lookup, since the account panel wants to show every protocol's status
// at once for real transparency ("users understand exactly what they're
// paying for"), and one call with a few extra cheap KV reads beats N
// round-trips.

import {
  FREE_MONTHLY_LIMIT,
  TRIAL_GENERATIONS_PER_PROTOCOL,
  TRIAL_ELIGIBLE_PROTOCOLS,
  currentUsagePeriod,
  getLicense,
  getUsageCount,
  getTrialUsageCount,
  isFounderLicenseKey,
  isLicenseExpired, effectiveSubscriptionLicense
} from './_lib/licensing.js';
import { claimManualLicenseForInstallation } from './_lib/license-service.js';
import { kv } from './_lib/kv-client.js';
import crypto from 'node:crypto';

const ONBOARDING_KEY_PREFIX = 'classbuster:onboarding:v1:';
const ONBOARDING_STATES = new Set(['completed', 'skipped']);

function onboardingKey(licenseKey){
  return ONBOARDING_KEY_PREFIX + crypto.createHash('sha256').update(licenseKey).digest('hex');
}

async function readOnboardingState(licenseKey){
  const value = await kv.get(onboardingKey(licenseKey));
  return value && typeof value === 'object' ? value : null;
}

async function buildTrialsObject(licenseKey, isFree){
  const entries = await Promise.all(TRIAL_ELIGIBLE_PROTOCOLS.map(async (protocol) => {
    const trialUsageCount = isFree ? await getTrialUsageCount(licenseKey, protocol) : 0;
    return [protocol, {
      trialLimit: TRIAL_GENERATIONS_PER_PROTOCOL,
      trialUsageCount,
      // null (not a number) once on Pro/founder — "remaining" isn't a
      // meaningful concept anymore, distinct from 0 which means
      // genuinely exhausted.
      remainingTrialGenerations: isFree ? Math.max(0, TRIAL_GENERATIONS_PER_PROTOCOL - trialUsageCount) : null
    }];
  }));
  return Object.fromEntries(entries);
}

export default async function handler(req, res){
  if(req.method === 'POST'){
    const licenseKey = req.headers['x-app-key'];
    const installationId = req.headers['x-installation-id'] || '';
    if(!licenseKey || !installationId) return res.status(401).json({ error: 'A validated account is required.' });
    try{
      if(isFounderLicenseKey(licenseKey)) return res.status(403).json({ error: 'Onboarding state is not available for owner access.' });
      const license = await getLicense(licenseKey);
      if(!license) return res.status(401).json({ error: 'Invalid license key.' });
      const claim = await claimManualLicenseForInstallation(licenseKey, license, installationId);
      if(!claim.allowed) return res.status(403).json({ error: claim.message, reason: claim.reason });
      const body = req.body || {};
      if(!ONBOARDING_STATES.has(body.state)) return res.status(400).json({ error: 'Invalid onboarding state.' });
      const current = await readOnboardingState(licenseKey);
      if(current?.state === 'completed') return res.status(200).json({ onboarding: current });
      const record = { state: body.state, updatedAt: new Date().toISOString() };
      await kv.set(onboardingKey(licenseKey), record);
      return res.status(200).json({ onboarding: record });
    }catch(err){
      console.error('license-status onboarding error:', err);
      return res.status(503).json({ error: 'Onboarding state is temporarily unavailable.' });
    }
  }
  if(req.method !== 'GET'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const licenseKey = req.headers['x-app-key'];
  if(!licenseKey){
    return res.status(401).json({ error: 'A license key is required.' });
  }
  const installationId = req.headers['x-installation-id'] || '';

  try{
    const period = currentUsagePeriod();

    if(isFounderLicenseKey(licenseKey)){
      return res.status(200).json({
        plan: 'pro',
        status: 'active',
        founder: true,
        email: '',
        usagePeriod: period,
        usageCount: 0,
        freeMonthlyLimit: FREE_MONTHLY_LIMIT,
        remainingFreeReports: null,
        trials: await buildTrialsObject(licenseKey, false)
      });
    }

    let license = await getLicense(licenseKey);
    if(!license){
      return res.status(401).json({ error: 'Invalid license key.' });
    }

    const claim = await claimManualLicenseForInstallation(licenseKey, license, installationId);
    if(!claim.allowed){
      return res.status(403).json({ error: claim.message, reason: claim.reason });
    }
    license = effectiveSubscriptionLicense(claim.license);

    const usageCount = await getUsageCount(licenseKey, period);
    const expired = isLicenseExpired(license);
    const isFree = license.plan !== 'pro';
    const response = {
      plan: license.plan || 'free',
      status: expired ? 'expired' : (license.status || 'inactive'),
      founder: false,
      manual: license.manual === true,
      activationPending: license.activationPending === true,
      onboardingEligible: license.onboardingEligible === true,
      activatedAt: license.activatedAt || null,
      email: license.email || '',
      expiresAt: license.expiresAt || null,
      subscriptionStatus: license.subscriptionStatus || null,
      subscriptionEndsAt: license.subscriptionEndsAt || null,
      subscriptionBillingStatus: license.subscriptionBillingStatus || null,
      providerManagedSubscription: !!(license.paymentSubscriptionId && license.paymentCustomerId),
      refundReviewPending: !!license.subscriptionRefundReview,
      expired,
      usagePeriod: period,
      usageCount,
      freeMonthlyLimit: FREE_MONTHLY_LIMIT,
      remainingFreeReports: isFree ? Math.max(0, FREE_MONTHLY_LIMIT - usageCount) : null,
      trials: await buildTrialsObject(licenseKey, isFree)
    };

    try { response.onboarding = await readOnboardingState(licenseKey); response.onboardingState = response.onboarding ? 'known' : 'never'; }
    catch { response.onboarding = null; response.onboardingState = 'unknown'; }

    return res.status(200).json(response);
  }catch(err){
    console.error('license-status error:', err);
    return res.status(500).json({ error: 'Could not check license status right now.' });
  }
}
