import crypto from 'node:crypto';
import { kv } from './kv-client.js';
import { getLicense, isFounderLicenseKey } from './licensing.js';
import { claimManualLicenseForInstallation } from './license-service.js';

export const LEGACY_HOST = 'https://kidbuster.vercel.app';
export const NEW_HOST = 'https://classbuster.com';
export const LEGACY_TRANSFER_TTL_SECONDS = 5 * 60;

const ticketKey = hash => 'legacyTransfer:' + hash;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');

export function isExactOrigin(origin, expected){
  return String(origin || '').replace(/\/$/, '') === expected;
}

export async function issueLegacyTransfer({ licenseKey, installationId, origin }){
  if(!isExactOrigin(origin, LEGACY_HOST)) return { ok:false, reason:'origin' };
  if(!licenseKey || !installationId || installationId === 'anon-unavailable') return { ok:false, reason:'invalid' };
  if(isFounderLicenseKey(licenseKey)) return { ok:false, reason:'invalid' };
  const license = await getLicense(licenseKey);
  if(!license || license.status !== 'active' || (license.expiresAt && Date.parse(license.expiresAt) <= Date.now())) return { ok:false, reason:'invalid' };
  const claim = await claimManualLicenseForInstallation(licenseKey, license, installationId);
  if(!claim.allowed) return { ok:false, reason:'invalid' };
  const ticket = crypto.randomBytes(32).toString('base64url');
  await kv.set(ticketKey(hash(ticket)), { licenseKey, installationId }, { ex: LEGACY_TRANSFER_TTL_SECONDS });
  return { ok:true, ticket };
}

export async function redeemLegacyTransfer({ ticket, origin }){
  if(!isExactOrigin(origin, NEW_HOST) || typeof ticket !== 'string' || ticket.length < 40) return null;
  const record = await kv.getdel(ticketKey(hash(ticket)));
  if(!record || !record.licenseKey || !record.installationId || isFounderLicenseKey(record.licenseKey)) return null;
  const license = await getLicense(record.licenseKey);
  if(!license || license.status !== 'active' || (license.expiresAt && Date.parse(license.expiresAt) <= Date.now())) return null;
  const claim = await claimManualLicenseForInstallation(record.licenseKey, license, record.installationId);
  if(!claim.allowed) return null;
  return record;
}

