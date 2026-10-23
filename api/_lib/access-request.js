import { getLicense, getLicenseKeyByEmail, normalizeEmail } from './licensing.js';
import {
  createVerificationToken, enforceVerificationRateLimit, getRequestIp,
  isValidEmail, revokeVerificationToken
} from './account-verification.js';
import { sendAccessVerificationEmail } from './email-service.js';

export const GENERIC_ACCESS_RESPONSE = 'If that email can be used for this request, a secure link is on its way. Check your inbox and spam folder.';

export async function requestVerifiedAccess(req, res, { intent }){
  const email = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  if(!email || !isValidEmail(email)){
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  const allowed = await enforceVerificationRateLimit({ email, ip: getRequestIp(req) });
  if(!allowed){
    return res.status(429).json({ error: 'Too many requests for this email address or network. If you already asked for a secure link, check your inbox and spam folder: it stays valid for 15 minutes. Otherwise please wait 15 minutes and try again.' });
  }

  // Only a REAL existing account turns Start Free into recovery. An index left
  // pointing at a missing record keeps the requested intent, so signup can
  // still repair it instead of trapping the teacher in a failing recovery.
  const existingKey = await getLicenseKeyByEmail(email);
  const effectiveIntent = existingKey && await getLicense(existingKey) ? 'recover' : intent;
  const { token } = await createVerificationToken({ email, intent: effectiveIntent });
  try{
    await sendAccessVerificationEmail({ email, token, intent: effectiveIntent });
  }catch(err){
    await revokeVerificationToken(token);
    console.error('access verification email error:', err);
    return res.status(503).json({ error: 'Secure email delivery is unavailable right now. Please try again later.' });
  }
  return res.status(202).json({ message: GENERIC_ACCESS_RESPONSE });
}
