// Manages the mapping between a Pathfinder account (identified by its
// license key -- the same stable identity used everywhere else in this
// app; there's no separate user-ID system) and a random, opaque Krisp
// webhook token.
//
// Deliberately NOT deterministic (e.g. not an HMAC of the license key).
// A webhook URL is a credential a teacher pastes into a third-party
// product's settings and could leak; it needs to be independently
// revocable and regenerable without touching the license key itself or
// invalidating every other user's token at once. Two KV mappings make
// that possible:
//
//   krisp:user:<licenseKey>  -> { token, createdAt }   (forward: who has which token)
//   krisp:token:<token>      -> { userIdentity, createdAt }  (reverse: whose is this token)
//
// The reverse mapping is what an incoming webhook resolves against --
// deleting it (regenerate or disconnect) makes the old URL stop working
// immediately, with no dependency on any secret changing.
import crypto from 'crypto';
import { kv, acquirePaymentLock, releasePaymentLock } from './kv-client.js';

export function generateKrispToken(){
  return crypto.randomBytes(32).toString('hex');
}

export function isWellFormedKrispToken(token){
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
}

// All token-lifecycle writes for one account run one at a time. Without this,
// two overlapping "regenerate" clicks both read the same old token, both mint
// a new one and both delete the old one -- leaving the first new token's
// reverse mapping alive but unknown to the teacher, so a leaked URL survives a
// regenerate. Two simultaneous first visits had the same orphaning problem.
export class KrispTokenBusyError extends Error{
  constructor(){ super('Krisp token settings are busy'); this.name = 'KrispTokenBusyError'; }
}
const TOKEN_LOCK_TTL_SECONDS = 15;
const TOKEN_LOCK_WAIT_MS = 3000;
const TOKEN_LOCK_POLL_MS = 40;
async function withTokenLock(licenseKey, work){
  const lockKey = 'krisp:tokenLock:' + licenseKey;
  const lockToken = crypto.randomBytes(16).toString('hex');
  const deadline = Date.now() + TOKEN_LOCK_WAIT_MS;
  while(!await acquirePaymentLock(lockKey, lockToken, TOKEN_LOCK_TTL_SECONDS)){
    if(Date.now() >= deadline) throw new KrispTokenBusyError();
    await new Promise(resolve => setTimeout(resolve, TOKEN_LOCK_POLL_MS));
  }
  try{
    return await work();
  }finally{
    await releasePaymentLock(lockKey, lockToken).catch(() => {});
  }
}

function userMappingKey(licenseKey){
  return 'krisp:user:' + licenseKey;
}

function tokenMappingKey(token){
  return 'krisp:token:' + token;
}

// First Pro-panel visit (or any later visit once a token already
// exists): returns the caller's existing token, creating and storing a
// new one if this is the first time. licenseKey must already have been
// validated by the caller (checkEntitlement/isFounderLicenseKey) --
// this function does no validation of its own, by design, so it can't
// be called with an unvalidated identity from anywhere in this file.
export async function getOrCreateKrispToken(licenseKey){
  // Fast path: an existing token needs no lock.
  const existing = await kv.get(userMappingKey(licenseKey));
  if(existing && existing.token){
    return existing.token;
  }
  return withTokenLock(licenseKey, async () => {
    // Re-check under the lock: another request may have created it meanwhile.
    const again = await kv.get(userMappingKey(licenseKey));
    if(again && again.token) return again.token;
    const token = generateKrispToken();
    const createdAt = new Date().toISOString();
    await kv.set(tokenMappingKey(token), { userIdentity: licenseKey, createdAt });
    await kv.set(userMappingKey(licenseKey), { token, createdAt });
    return token;
  });
}

// Resolves an incoming webhook request's token to the owning license
// key, or null if the token is missing, malformed, unknown, or has
// been revoked (via regenerate or disconnect). This is the only path
// by which a webhook request's identity is ever established -- there
// is no fallback to trusting a caller-supplied identity directly.
export async function resolveKrispToken(token){
  if(!isWellFormedKrispToken(token)) return null;
  const record = await kv.get(tokenMappingKey(token));
  if(!record || !record.userIdentity) return null;
  return record.userIdentity;
}

// Creates a new token and points the user's mapping at it BEFORE
// revoking the old one, so there's never a moment where the user has
// zero working token. The old token's reverse mapping is deleted last,
// making the old URL stop working immediately once this returns.
export async function regenerateKrispToken(licenseKey){
  return withTokenLock(licenseKey, async () => {
    const existing = await kv.get(userMappingKey(licenseKey));
    const oldToken = existing && existing.token;

    const newToken = generateKrispToken();
    const createdAt = new Date().toISOString();
    await kv.set(tokenMappingKey(newToken), { userIdentity: licenseKey, createdAt });
    await kv.set(userMappingKey(licenseKey), { token: newToken, createdAt });

    if(oldToken){
      await kv.set(tokenMappingKey(oldToken), null);
    }

    return newToken;
  });
}

// Revokes the user's current token (if any) and clears their user
// mapping. Only ever touches krisp:user:<licenseKey> and
// krisp:token:<token> -- never license:<licenseKey> or any other
// account data. A subsequent panel visit behaves exactly like a first
// visit and issues a fresh token.
export async function disconnectKrisp(licenseKey){
  return withTokenLock(licenseKey, async () => {
    const existing = await kv.get(userMappingKey(licenseKey));
    const token = existing && existing.token;
    if(token){
      await kv.set(tokenMappingKey(token), null);
    }
    await kv.set(userMappingKey(licenseKey), null);
  });
}
