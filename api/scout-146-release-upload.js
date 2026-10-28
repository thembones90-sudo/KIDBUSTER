// EPHEMERAL exact-path release upload route. Remove immediately after verification.
import { handleUpload } from '@vercel/blob/client';
import { createHash, timingSafeEqual } from 'node:crypto';

const PATH = 'releases/scout-1.4.6-receipts-20261028/ScoutSetup.exe';
const KEY_HASH = '80c53d67db1a607c532b075d442832801534a0a3395aa7e804e7ab38455e3451';
const EXPIRES_AT = 1793189714606;
function allowedNonce(value) {
  if (typeof value !== 'string' || value.length > 128) return false;
  const got = createHash('sha256').update(value).digest('hex');
  return timingSafeEqual(Buffer.from(got), Buffer.from(KEY_HASH));
}
export default async function releaseUpload(request, response) {
  response.setHeader('Cache-Control','no-store');
  if (request.method !== 'POST') return response.status(405).json({error:'Not permitted'});
  try {
    const result = await handleUpload({
      request, body: request.body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (Date.now() >= EXPIRES_AT || pathname !== PATH || !allowedNonce(clientPayload)) {
          throw new Error('Release authorization failed');
        }
        return {
          allowedContentTypes: ['application/octet-stream'],
          maximumSizeInBytes: 120000000,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({release:'1.4.6'}),
        };
      },
      onUploadCompleted: async () => {},
    });
    return response.status(200).json(result);
  } catch (error) {
    return response.status(403).json({error:'Release upload unavailable'});
  }
}
