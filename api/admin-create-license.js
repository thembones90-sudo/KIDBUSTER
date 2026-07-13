import { createManualProLicense } from './_lib/license-service.js';
import { isFounderLicenseKey, normalizeEmail } from './_lib/licensing.js';

function isValidEmail(email){
  if(!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ownerKey = req.headers['x-app-key'];
  if(!isFounderLicenseKey(ownerKey)){
    return res.status(403).json({ error: 'Owner access is required to create 30-day keys.' });
  }

  const email = normalizeEmail(req.body?.email || '');
  if(!isValidEmail(email)){
    return res.status(400).json({ error: 'Please enter a valid buyer email, or leave it blank.' });
  }

  try{
    const result = await createManualProLicense({
      email,
      days: 30,
      note: req.body?.note || ''
    });
    return res.status(200).json({
      ...result,
      email,
      plan: 'pro',
      status: 'active',
      manual: true
    });
  }catch(err){
    console.error('admin-create-license error:', err);
    return res.status(500).json({ error: 'Could not create a 30-day key right now.' });
  }
}
