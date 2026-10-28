// Master-account-only Scout Windows installer. No public release entitlement.
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { accountEntitlement, radarVanEnabled } from './radar-van.js';

// Owner-authorized display repair, 2026-10-27. Private, unsigned 1.4.2.
const PATHNAME = 'releases/scout-1.4.2-owner-20261027/ScoutSetup.exe';
const SHA256 = '4af74d957ce2ac83055001c50211788f3956c8323e31ca62afd1a9a7dbdf4b05';

function reply(res, status, body) {
  res.setHeader?.('Cache-Control', 'private, no-store');
  res.setHeader?.('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

export default async function handleScoutDownload(req, res) {
  if (!radarVanEnabled()) return reply(res, 404, { error: 'Scout is unavailable.' });
  // Temporary SHA-protected release upload: reuses this function (Hobby 12-function cap).
  if (req.method === 'POST') {
    const { default: uploadRelease } = await import('./scout-146-release-upload.js');
    return uploadRelease(req, res);
  }
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
      version: '1.4.2', filename: 'ScoutSetup.exe',
      sha256: SHA256, downloadUrl: presignedUrl, expiresAt
    });
  } catch (err) {
    console.error('private Scout release URL unavailable:', err?.name || 'error');
    return reply(res, 503, { error: 'Private Scout download temporarily unavailable.' });
  }
}
