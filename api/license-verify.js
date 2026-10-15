import { consumeVerificationToken } from './_lib/account-verification.js';
import { getOrCreateFreeLicense } from './_lib/license-service.js';
import { getLicense } from './_lib/licensing.js';
import { notifyAccessEvent } from './_lib/access-notifications.js';

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try{
    const record = await consumeVerificationToken(req.body?.token);
    if(!record){
      return res.status(400).json({ error: 'This secure link is invalid or has expired. Request a new one.' });
    }
    const licenseKey = await getOrCreateFreeLicense(record.email);
    const license = await getLicense(licenseKey);
    await notifyAccessEvent({
      type: record.intent === 'signup' ? 'verified_signup' : 'verified_recovery',
      title: record.intent === 'signup' ? 'Email verified and Free access started.' : 'Existing access recovered after email verification.',
      email: record.email,
      licenseKey,
      details: ['Source: verified email link']
    });
    return res.status(200).json({ licenseKey, plan: license?.plan || 'free' });
  }catch(err){
    console.error('license-verify error:', err);
    return res.status(500).json({ error: 'Could not verify access right now. Please try again shortly.' });
  }
}
