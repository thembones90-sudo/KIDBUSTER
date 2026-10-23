import { createManualProLicense } from './_lib/license-service.js';
import { isFounderLicenseKey, normalizeEmail } from './_lib/licensing.js';

// The customer's email is required: a key issued without one cannot be
// recovered by email sign-in later (the 2026-10-23 Christopher case).
function isValidEmail(email){
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
    return res.status(400).json({ error: "Enter the customer's email. Every 30-day key is linked to an email so the customer can always sign back in." });
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
      manual: true,
      activationPending: true
    });
  }catch(err){
    console.error('admin-create-license error:', err);
    return res.status(500).json({ error: 'Could not create a 30-day key right now.' });
  }
}
