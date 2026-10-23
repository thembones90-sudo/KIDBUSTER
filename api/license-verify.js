import { consumeVerificationToken } from './_lib/account-verification.js';
import { getOrCreateFreeLicense } from './_lib/license-service.js';
import { getLicense, getLicenseKeyByEmail } from './_lib/licensing.js';
import { notifyAccessEvent } from './_lib/access-notifications.js';
import { recordEvent } from './_lib/event-log.js';
import { issueLegacyTransfer, redeemLegacyTransfer } from './_lib/legacy-transfer.js';

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try{
    if(req.body?.action === 'issue_legacy_transfer'){
      const result = await issueLegacyTransfer({
        licenseKey: req.headers['x-app-key'],
        installationId: req.headers['x-installation-id'],
        origin: req.headers.origin
      });
      if(!result.ok) return res.status(400).json({ error: 'This old-site session cannot be transferred. Use your existing access key or request a new sign-in link.' });
      return res.status(200).json({ ticket: result.ticket });
    }
    if(req.body?.action === 'redeem_legacy_transfer'){
      const record = await redeemLegacyTransfer({ ticket: req.body.ticket, origin: req.headers.origin });
      if(!record) return res.status(400).json({ error: 'This transfer link is invalid, expired, or has already been used. Use your existing access key or request a new sign-in link.' });
      const license = await getLicense(record.licenseKey);
      await recordEvent('sign_in', { via: 'old_address_transfer', plan: license?.plan || 'free' });
      return res.status(200).json({ licenseKey: record.licenseKey, installationId: record.installationId, plan: license?.plan || 'free' });
    }
    const record = await consumeVerificationToken(req.body?.token);
    if(!record){
      return res.status(400).json({ error: 'This secure link is invalid or has expired. Request a new one.' });
    }
    let licenseKey;
    if(record.intent === 'recover' || record.intent === 'recovery'){
      licenseKey = await getLicenseKeyByEmail(record.email);
      const existing = licenseKey ? await getLicense(licenseKey) : null;
      if(!licenseKey || !existing){
        return res.status(409).json({ error: 'We verified your email, but could not find the old account. Use Transfer my account from the old site, enter your existing access key, or contact support.' });
      }
    }else{
      licenseKey = await getOrCreateFreeLicense(record.email);
    }
    const license = await getLicense(licenseKey);
    await notifyAccessEvent({
      type: record.intent === 'signup' ? 'verified_signup' : 'verified_recovery',
      title: record.intent === 'signup' ? 'Email verified and Free access started.' : 'Existing access recovered after email verification.',
      email: record.email,
      licenseKey,
      details: ['Source: verified email link']
    });
    await recordEvent('sign_in', { via: 'email_link', intent: String(record.intent || ''), plan: license?.plan || 'free' });
    return res.status(200).json({ licenseKey, plan: license?.plan || 'free' });
  }catch(err){
    console.error('license-verify error:', err);
    return res.status(500).json({ error: 'Could not verify access right now. Please try again shortly.' });
  }
}
