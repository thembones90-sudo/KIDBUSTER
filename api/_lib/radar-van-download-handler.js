// Master-account-only Scout Windows installer. No public release entitlement.
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { accountEntitlement, radarVanEnabled } from './radar-van.js';

// Owner-approved compact widget waveforms, 2026-10-29. Private, unsigned 1.4.10.
const PATHNAME = 'releases/scout-1.4.10-owner-20261029/ScoutSetup.exe';
const SHA256 = 'cfe0e8e8d342d9d0319e1b58fd07d48334b6809d227879871c99714798228b12';

function reply(res, status, body) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

export default async function handleScoutDownload(req, res) {
  if (!radarVanEnabled()) return reply(res, 404, { error: 'Scout is unavailable.' });
  if (req.method !== 'GET') return reply(res, 405, { error: 'Method not allowed.' });
  const identity = req.headers?.['x-app-key'];
  if (typeof identity !== 'string' || !identity) return reply(res, 401, { error: 'Access key required.' });
  // A valid paid subscription, another founder, or APP_ACCESS_KEY never qualifies.
  if (!(await accountEntitlement(identity)).allowed)
    return reply(res, 403, { error: 'Only the authorized master account can download Scout.' });
  if (!process.env.BLOB_STORE_ID) return reply(res, 503, { error: 'Private Scout storage unavailable.' });
  try {
    const expiresAt = Date.now() + 5 * 60_000;
    const scoped = await issueSignedToken({
      pathname: PATHNAME, operations: ['get'], validUntil: expiresAt
    });
    const { presignedUrl } = await presignUrl(scoped, {
      pathname: PATHNAME, operation: 'get', access: 'private', validUntil: expiresAt
    });
    if (typeof presignedUrl !== 'string' ||
        !/^https:\/\/[a-z0-9]+\.private\.blob\.vercel-storage\.com\//i.test(presignedUrl))
      throw new Error('Bad private Blob URL');
    return reply(res, 200, {
      version: '1.4.10', filename: 'ScoutSetup.exe',
      sha256: SHA256, downloadUrl: presignedUrl, expiresAt
    });
  } catch (err) {
    console.error('private Scout release URL unavailable:', err?.name || 'error');
    return reply(res, 503, { error: 'Private Scout download temporarily unavailable.' });
  }
}
