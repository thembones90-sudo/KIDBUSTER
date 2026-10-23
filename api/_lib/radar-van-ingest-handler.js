// POST /api/radar-van-ingest (served through the /api/feedback dispatcher so
// the deployment keeps its 12 serverless functions; see vercel.json).
//
// Device credential only: Authorization: Bearer rv1_<secret>. Never a query
// parameter, never a license key. Nothing here touches Krisp state, usage
// counters or the generation pipeline. Logs carry no transcript text, token
// or identity, and error bodies are fixed strings.
import {
  radarVanEnabled, resolveRadarToken, hashRadarToken, accountEntitlement, parseLesson, ingestRadarLesson,
  serializedBodyBytes, RadarBusyError, RADAR_VAN_MAX_BODY_BYTES, radarRateExceeded, radarRatePeek
} from './radar-van.js';
import { getRequestIp } from './account-verification.js';
import { recordEvent } from './event-log.js';

const BEARER = /^Bearer (rv1_[A-Za-z0-9_-]{43})$/;
const IDENTITY_RATE = { limit: 60, windowSeconds: 60 };
const AUTH_FAILURE_RATE = { limit: 30, windowSeconds: 300 };

function reply(res, status, body, headers = {}){
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('X-Content-Type-Options', 'nosniff');
  for(const [name, value] of Object.entries(headers)) res.setHeader?.(name, value);
  return res.status(status).json(body);
}

function queryKeys(req){
  if(req.query && typeof req.query === 'object') return Object.keys(req.query);
  try{ return [...new URL(req.url || '/', 'http://x').searchParams.keys()]; }catch(_err){ return []; }
}

export default async function handleRadarIngest(req, res){
  if(!radarVanEnabled()) return reply(res, 404, { error: 'RADAR VAN is disabled.' });
  if(req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' }, { Allow: 'POST' });
  // The dispatcher adds exactly one parameter (radar=ingest). Anything else in
  // the URL - notably a bearer token - is refused before it is looked at.
  if(queryKeys(req).some(key => key !== 'radar')) return reply(res, 400, { error: 'Credentials and data must not be sent in the URL.' });
  if(String(req.headers['content-type'] || '').trim().toLowerCase() !== 'application/json') return reply(res, 400, { error: 'Content-Type must be application/json.' });
  if(Number(req.headers['content-length']) > RADAR_VAN_MAX_BODY_BYTES) return reply(res, 413, { error: 'Payload too large.' });

  try{
    const ip = getRequestIp(req);
    if(await radarRatePeek('authfail', ip) > AUTH_FAILURE_RATE.limit) return reply(res, 429, { error: 'Too many attempts.' }, { 'Retry-After': '300' });
    const match = BEARER.exec(String(req.headers.authorization || ''));
    const tokenHash = match ? hashRadarToken(match[1]) : null;
    const identity = match ? await resolveRadarToken(match[1]) : null;
    if(!identity){
      const limited = await radarRateExceeded('authfail', ip, AUTH_FAILURE_RATE.limit, AUTH_FAILURE_RATE.windowSeconds);
      return limited
        ? reply(res, 429, { error: 'Too many attempts.' }, { 'Retry-After': '300' })
        : reply(res, 401, { error: 'Invalid or revoked RADAR VAN token.' });
    }
    if(!(await accountEntitlement(identity)).allowed) return reply(res, 403, { error: 'RADAR VAN is not available for this account.' });
    if(await radarRateExceeded('ingest', identity, IDENTITY_RATE.limit, IDENTITY_RATE.windowSeconds)) return reply(res, 429, { error: 'Too many lessons. Retry shortly.' }, { 'Retry-After': '60' });

    // Desktop pairing: "is my credential approved yet?" Answered only after
    // the bearer check above, so it reveals nothing to an unpaired caller.
    if(req.body && typeof req.body === 'object' && !Array.isArray(req.body) && req.body.action === 'credential-check'){
      return reply(res, 200, { connected: true });
    }
    // Measure what was actually received (serialized UTF-8), not what the
    // client claimed in Content-Length.
    if(serializedBodyBytes(req.body) > RADAR_VAN_MAX_BODY_BYTES) return reply(res, 413, { error: 'Payload too large.' });
    let body = req.body;
    if(typeof body === 'string' || Buffer.isBuffer(body)){
      try{ body = JSON.parse(String(body)); }catch(_err){ return reply(res, 400, { error: 'Invalid JSON.' }); }
    }
    const parsed = parseLesson(body);
    if(parsed.error) return reply(res, parsed.status, { error: 'Invalid lesson payload.', field: parsed.error });

    const result = await ingestRadarLesson(identity, parsed.lesson, tokenHash);
    const meetingId = 'rv:' + parsed.lesson.lessonId;
    if(result.revoked) return reply(res, 401, { error: 'Invalid or revoked RADAR VAN token.' });
    if(result.full) return reply(res, 503, { error: 'RADAR VAN inbox is full. Retry later.', reason: 'inbox_full' }, { 'Retry-After': '60' });
    await recordEvent('scout_delivery', { duplicate: !!result.duplicate });
    return reply(res, result.duplicate ? 200 : 201, { stored: true, duplicate: result.duplicate, matched: result.matched, meetingId });
  }catch(err){
    console.error('radar-van ingest unavailable:', err instanceof RadarBusyError ? 'busy' : (err && err.name) || 'error');
    return reply(res, 503, { error: 'RADAR VAN temporarily unavailable.', reason: err instanceof RadarBusyError ? 'busy' : 'unavailable' }, { 'Retry-After': '5' });
  }
}
