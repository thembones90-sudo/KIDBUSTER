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
import { readOnboarding, finishOnboarding } from './_lib/onboarding.js';

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
  res.setHeader?.('Cache-Control', 'no-store');
  if(req.method !== 'GET' && req.method !== 'POST'){
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
      if(req.method === 'POST') return res.status(403).json({error:'No introduction is pending for this account.'});
      return res.status(200).json({
        onboarding: await readOnboarding(licenseKey, null),
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

    if(req.method === 'POST'){
      if(req.body?.action !== 'onboarding') return res.status(400).json({error:'Invalid account action.'});
      if(isLicenseExpired(license)) return res.status(403).json({error:'Active access is required.'});
      const result = await finishOnboarding(licenseKey, license, req.body?.state);
      return res.status(result.status).json(result.error ? {error:result.error} : {onboarding:result.onboarding});
    }

    const usageCount = await getUsageCount(licenseKey, period);
    const expired = isLicenseExpired(license);
    const isFree = license.plan !== 'pro';
    const response = {
      onboarding: await readOnboarding(licenseKey, license),
      plan: license.plan || 'free',
      status: expired ? 'expired' : (license.status || 'inactive'),
      founder: false,
      manual: license.manual === true,
      activationPending: license.activationPending === true,
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

    return res.status(200).json(response);
  }catch(err){
    console.error('license-status error:', err);
    return res.status(500).json({ error: 'Could not check license status right now.' });
  }
}
