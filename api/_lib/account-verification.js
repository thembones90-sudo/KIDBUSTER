import crypto from 'node:crypto';
import { kv, incrementWindowCounter } from './kv-client.js';
import { normalizeEmail } from './licensing.js';

export const VERIFICATION_TTL_SECONDS = 15 * 60;
export const VERIFICATION_REQUEST_LIMIT = 5;
// Schools, agencies and mobile carriers put many teachers behind one public
// IP, so the network limit is looser than the per-mailbox limit.
export const VERIFICATION_IP_REQUEST_LIMIT = 30;

const tokenKey = hash => 'emailVerification:' + hash;
const rateKey = (scope, value) => 'emailVerificationRate:' + scope + ':' + sha256(value);

function sha256(value){
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getRequestIp(req){
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.socket?.remoteAddress || 'unknown').slice(0, 100);
}

export async function enforceVerificationRateLimit({ email, ip }){
  for(const [scope, value, limit] of [
    ['email', normalizeEmail(email), VERIFICATION_REQUEST_LIMIT],
    ['ip', ip || 'unknown', VERIFICATION_IP_REQUEST_LIMIT]
  ]){
    const key = rateKey(scope, value);
    const count = await incrementWindowCounter(key, VERIFICATION_TTL_SECONDS);
    if(count > limit) return false;
  }
  return true;
}

export async function createVerificationToken({ email, intent }){
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + VERIFICATION_TTL_SECONDS * 1000;
  await kv.set(tokenKey(sha256(token)), {
    email: normalizeEmail(email),
    intent,
    expiresAt
  });
  await kv.expire(tokenKey(sha256(token)), VERIFICATION_TTL_SECONDS);
  return { token, expiresAt };
}

export async function revokeVerificationToken(token){
  await kv.del(tokenKey(sha256(token)));
}

export async function consumeVerificationToken(token){
  if(typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const record = await kv.getdel(tokenKey(sha256(token)));
  if(!record || !record.email || record.expiresAt <= Date.now()) return null;
  return record;
}
