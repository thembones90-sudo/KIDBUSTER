// Returns the current license/account status for the key saved in the
// browser. This is deliberately read-only: it never creates, upgrades, or
// downgrades anything.
//
// Reports trial usage for EVERY trial-eligible protocol (everything
// except ALWAYS_FREE_PROTOCOLS) in one response, keyed by protocol —
// deliberately not a single "?protocol=X" lookup, since the account
// panel wants to show every protocol's status at once for real
// transparency ("users understand exactly what they're paying for"),
// and one call with a few extra cheap KV reads beats N round-trips.
// The trial-eligible list is derived from PROTOCOL_LABELS itself, so
// there's exactly one place (that map) to update when a new protocol
// is added, not a second parallel list to keep in sync with it.

import {
  FREE_MONTHLY_LIMIT,
  TRIAL_GENERATIONS_PER_PROTOCOL,
  ALWAYS_FREE_PROTOCOLS,
  PROTOCOL_LABELS,
  currentUsagePeriod,
  getLicense,
  getUsageCount,
  getTrialUsageCount,
  isFounderLicenseKey
} from './_lib/licensing.js';

const TRIAL_ELIGIBLE_PROTOCOLS = Object.keys(PROTOCOL_LABELS).filter(p => !ALWAYS_FREE_PROTOCOLS.includes(p));

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
  if(req.method !== 'GET'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const licenseKey = req.headers['x-app-key'];
  if(!licenseKey){
    return res.status(401).json({ error: 'A license key is required.' });
  }

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

    const license = await getLicense(licenseKey);
    if(!license){
      return res.status(401).json({ error: 'Invalid license key.' });
    }

    const usageCount = await getUsageCount(licenseKey, period);
    const isFree = license.plan !== 'pro';
    const response = {
      plan: license.plan || 'free',
      status: license.status || 'inactive',
      founder: false,
      email: license.email || '',
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
