// GET/POST /api/radar-van-session (served through the /api/feedback dispatcher).
//
// Authenticated by the browser's x-app-key like the other account routes. The
// device token is returned exactly once by action 'connect' and is never part
// of any read. Mutations that cannot take their lock fail closed with an
// explicit 409 - a revoke or rotate is never reported as done unless it was.
import {
  radarVanEnabled, accountEntitlement, issueRadarToken, revokeRadarToken, setRadarArmed,
  readRadarSession, radarInboxAction, serializedBodyBytes, RadarBusyError, peekRadarVersion, enableRadarAutomatic,
  bindRadarTokenHash, setRadarTeacherName
} from './radar-van.js';

const MAX_BODY_BYTES = 4096;
const SINCE = /^\d{1,15}$/;
const MEETING_ID = /^rv:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function reply(res, status, body, headers = {}){
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('X-Content-Type-Options', 'nosniff');
  for(const [name, value] of Object.entries(headers)) res.setHeader?.(name, value);
  return res.status(status).json(body);
}

export default async function handleRadarSession(req, res){
  if(!radarVanEnabled()) return reply(res, 404, { enabled: false, error: 'RADAR VAN is disabled.' });
  if(req.method !== 'GET' && req.method !== 'POST') return reply(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
  const identity = req.headers['x-app-key'];
  if(!identity || typeof identity !== 'string') return reply(res, 401, { error: 'An access key is required.' });

  try{
    // Idle poll: the browser sends the version of the view it already shows.
    // Entitlement + version cost one MGET; only a change pays for a full read.
    const since = req.method === 'GET' ? req.headers['x-radar-since'] : undefined;
    if(typeof since === 'string' && SINCE.test(since)){
      const peek = await peekRadarVersion(identity);
      if(!peek.allowed) return reply(res, 403, { error: 'An active Pathfinder account is required.' });
      if(peek.version === since) return reply(res, 200, { enabled: true, unchanged: true, version: peek.version });
    }else if(!(await accountEntitlement(identity)).allowed) return reply(res, 403, { error: 'An active Pathfinder account is required.' });

    if(req.method === 'GET'){
      return reply(res, 200, await readRadarSession(identity, { lease: req.headers['x-radar-lease'] === '1' }));
    }

    if(String(req.headers['content-type'] || '').trim().toLowerCase() !== 'application/json') return reply(res, 400, { error: 'Content-Type must be application/json.' });
    if(serializedBodyBytes(req.body) > MAX_BODY_BYTES) return reply(res, 413, { error: 'Payload too large.' });
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const action = body.action;

    if(action === 'connect'){
      const token = await issueRadarToken(identity, { automatic: body.automatic === true });
      // The token already exists; a failed status read must not lose it.
      const state = await readRadarSession(identity).catch(() => ({ enabled: true }));
      return reply(res, 200, { ...state, connected: true, token, tokenShownOnce: true });
    }
    if(action === 'pair-approve'){
      const out = await bindRadarTokenHash(identity, body.tokenHash, body.teacherDisplayName);
      if(out.invalid) return reply(res, 400, { error: 'This Scout connection link is invalid. Click Connect in Scout again.' });
      if(out.invalidName) return reply(res, 400, { error: 'The teacher display name is invalid.' });
      if(out.taken) return reply(res, 409, { error: 'This Scout connection link was already used. Click Connect in Scout again.', reason: 'taken' });
      return reply(res, 200, { ...(await readRadarSession(identity)), paired: true, unchanged: !!out.unchanged });
    }
    if(action === 'set-teacher-name'){
      const out = await setRadarTeacherName(identity, body.teacherDisplayName);
      if(out.invalid) return reply(res, 400, { error: 'Teacher name must be plain text of at most 80 characters.' });
      if(out.notConnected) return reply(res, 409, { error: 'Connect Scout first.' });
      return reply(res, 200, { updated: true, teacherDisplayName: out.teacherDisplayName });
    }
    if(action === 'disconnect'){
      await revokeRadarToken(identity);
      return reply(res, 200, { ...(await readRadarSession(identity)), disconnected: true, serverCredentialRevoked: true });
    }
    if(action === 'arm' || action === 'disarm'){
      const out = await setRadarArmed(identity, action === 'arm');
      if(out.automatic) return reply(res, 409, { error: 'Scout imports automatically. Use Disconnect Scout to stop the integration.', reason: 'automatic' });
      if(out.notConnected) return reply(res, 409, { error: 'Connect RADAR VAN before arming it.', reason: 'not_connected' });
      return reply(res, 200, { ...(await readRadarSession(identity)), updated: true });
    }
    if(action === 'enable-automatic'){
      const out = await enableRadarAutomatic(identity);
      if(out.notConnected) return reply(res, 409, { error: 'Connect Scout first.', reason: 'not_connected' });
      return reply(res, 200, { ...(await readRadarSession(identity)), updated: true });
    }
    if(action === 'claim' || action === 'dismiss' || action === 'ack-matched'){
      if(typeof body.meetingId !== 'string' || !MEETING_ID.test(body.meetingId)) return reply(res, 400, { error: 'A valid meetingId is required.' });
      const out = await radarInboxAction(identity, action, body.meetingId);
      if(out.missing) return reply(res, 404, { error: 'That lesson is no longer available.' });
      if(out.conflict) return reply(res, 409, { error: 'That lesson is already being imported.', reason: 'claimed' });
      const state = await readRadarSession(identity);
      if(out.claimed) return reply(res, 200, { ...state, claimed: out.claimed, updated: true });
      return reply(res, 200, { ...state, updated: true, dismissed: out.dismissed, acked: out.acked });
    }
    return reply(res, 400, { error: 'Unknown action.' });
  }catch(err){
    if(err instanceof RadarBusyError) return reply(res, 409, { error: 'RADAR VAN is busy. Nothing was changed; retry shortly.', reason: 'busy' }, { 'Retry-After': '1' });
    console.error('radar-van session unavailable:', (err && err.name) || 'error');
    return reply(res, 503, { error: 'RADAR VAN temporarily unavailable.', reason: 'unavailable' }, { 'Retry-After': '5' });
  }
}
