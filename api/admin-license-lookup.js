import { getLicense, isFounderLicenseKey } from './_lib/licensing.js';
import { resetManualLicenseClaim } from './_lib/license-service.js';

function publicLicenseStatus(license){
  if(!license) return null;
  return {
    plan: license.plan || 'free',
    status: license.status || 'inactive',
    manual: license.manual === true,
    source: license.source || null,
    email: license.email || '',
    createdAt: license.createdAt || null,
    expiresAt: license.expiresAt || null,
    claimedAt: license.claimedAt || null,
    claimed: Boolean(license.claimedInstallationId),
    claimedInstallationId: license.claimedInstallationId || null
  };
}

const RESET_FAILURE_MESSAGES = {
  invalid_key: 'That license key was not found.',
  not_a_manual_key: 'Only manually-issued 30-day keys have a device binding to reset.',
  not_claimed: 'This key has not been claimed by any browser yet -- there is nothing to reset.'
};

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ownerKey = req.headers['x-app-key'];
  if(!isFounderLicenseKey(ownerKey)){
    return res.status(403).json({ error: 'Owner access is required to inspect keys.' });
  }

  const licenseKey = String(req.body?.licenseKey || '').trim();
  if(!licenseKey){
    return res.status(400).json({ error: 'A license key is required.' });
  }

  // 'lookup' (default, backward compatible) just reports status.
  // 'reset-claim' clears a manual key's device binding so it can be
  // activated again from a different browser -- for a legitimate
  // customer who switched devices or cleared cookies, not a way around
  // the single-claim restriction for anyone else.
  const action = String(req.body?.action || 'lookup').trim();

  try{
    if(action === 'reset-claim'){
      const result = await resetManualLicenseClaim(licenseKey);
      if(!result.ok){
        return res.status(400).json({
          error: RESET_FAILURE_MESSAGES[result.reason] || 'Could not reset this key.',
          license: publicLicenseStatus(result.license)
        });
      }
      return res.status(200).json({
        reset: true,
        license: publicLicenseStatus(result.license)
      });
    }

    const license = await getLicense(licenseKey);
    return res.status(200).json({
      exists: Boolean(license),
      license: publicLicenseStatus(license)
    });
  }catch(err){
    console.error('admin-license-lookup error:', err);
    return res.status(500).json({ error: 'Could not inspect this key right now.' });
  }
}
