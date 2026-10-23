// Master-account-only 10ZU ZIP download. Shares /api/feedback so no new function.
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { accountEntitlement, radarVanEnabled } from './radar-van.js';

const PATHNAME = 'releases/Classbuster-Scout-10ZU-Windows.zip';
const SHA256 = 'ebce02307209eebe2750b714f20000f35d719295067d942da25d04f5d546fdc6';

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
      version: '10ZU', filename: 'Classbuster-Scout-10ZU-Windows.zip',
      sha256: SHA256, downloadUrl: presignedUrl, expiresAt
    });
  } catch (err) {
    console.error('private Scout release URL unavailable:', err?.name || 'error');
    return reply(res, 503, { error: 'Private Scout download temporarily unavailable.' });
  }
}
