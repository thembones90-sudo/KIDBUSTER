import { getLicense, isFounderLicenseKey } from './_lib/licensing.js';

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

  try{
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
