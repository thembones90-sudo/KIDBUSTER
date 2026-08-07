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
import { kv } from './kv-client.js';

export function generateKrispToken(){
  return crypto.randomBytes(32).toString('hex');
}

export function isWellFormedKrispToken(token){
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
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
  const existing = await kv.get(userMappingKey(licenseKey));
  if(existing && existing.token){
    return existing.token;
  }
  const token = generateKrispToken();
  const createdAt = new Date().toISOString();
  await kv.set(tokenMappingKey(token), { userIdentity: licenseKey, createdAt });
  await kv.set(userMappingKey(licenseKey), { token, createdAt });
  return token;
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
}

// Revokes the user's current token (if any) and clears their user
// mapping. Only ever touches krisp:user:<licenseKey> and
// krisp:token:<token> -- never license:<licenseKey> or any other
// account data. A subsequent panel visit behaves exactly like a first
// visit and issues a fresh token.
export async function disconnectKrisp(licenseKey){
  const existing = await kv.get(userMappingKey(licenseKey));
  const token = existing && existing.token;
  if(token){
    await kv.set(tokenMappingKey(token), null);
  }
  await kv.set(userMappingKey(licenseKey), null);
}
