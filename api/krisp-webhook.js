// Receives completed-transcript payloads from Krisp's own Webhook API
// (configured in Krisp's Settings -> Integrations -> Webhook, pointed at
// this endpoint's URL). This is a one-way inbound integration only -- we
// never call out to Krisp. Deliberately does NOT implement Krisp's OAuth
// Platform API; that's a separate, heavier product meant for building
// full third-party integrations, and nothing here needs it.
//
// Auth: Krisp lets you attach custom request headers when you configure
// a webhook, so we just check a shared secret header -- no signature
// verification scheme is documented for the simple Webhook API, so this
// matches what's actually available rather than inventing a stronger
// check Krisp can't produce.
//
// Idempotency: Krisp's own docs note webhooks are retried with
// exponential backoff on failure, so every event may arrive more than
// once. We dedupe on the meeting ID (falling back to the event ID if a
// meeting ID isn't present) before doing anything else.
import { kv } from './_lib/kv-client.js';

const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 7; // one week is far more than enough to catch retries
const PENDING_LIST_MAX = 20; // cap so this never grows unbounded if imports go unclaimed

// --- Temporary diagnostics -------------------------------------------
// Krisp documents its webhook payload fields narratively (meeting ID,
// title, link/URL, start/end time, duration, transcript/notes/outline
// content, a unique event ID) rather than as a fixed JSON schema, so
// normalizeKrispPayload() below is currently a best guess at real key
// names. This flag exists ONLY to capture one real payload so that
// guess can be corrected against Krisp's actual schema -- it is not
// meant to run permanently.
//
// To use: set KRISP_DEBUG_LOG=1 in Vercel, redeploy, trigger one real
// Krisp webhook, read the logged payload in Vercel's function logs,
// fix normalizeKrispPayload() if needed, then remove the env var (or
// set it to anything other than '1') and redeploy again. There is
// nothing to "clean up" in code -- unsetting the env var fully disables
// this path.
const DEBUG_LOG_RAW_PAYLOAD = process.env.KRISP_DEBUG_LOG === '1';

function redactHeaders(headers){
  const redacted = {};
  for(const key of Object.keys(headers || {})){
    redacted[key] = /secret|authorization|cookie|token/i.test(key) ? '[REDACTED]' : headers[key];
  }
  return redacted;
}

// --- Normalization layer ----------------------------------------------
// Everything downstream of this function deals only with Pathfinder's
// own internal shape. If Krisp changes or adds field names later, this
// is the one place that needs updating -- nothing else in this file (or
// krisp-session.js, which just stores/returns whatever this produces)
// needs to know or care what Krisp's raw payload actually looks like.
//
// Returns null for a payload that isn't even a usable object at all
// (the malformed-request case); every other field is optional and
// simply defaults to an empty/null value rather than failing.
function normalizeKrispPayload(body){
  if(!body || typeof body !== 'object' || Array.isArray(body)) return null;

  // A real captured Krisp delivery (via webhook.site, 2026-08-06) confirmed
  // the actual shape: everything meeting-related sits under body.data.meeting,
  // the event id is the top-level body.id, and there's no field literally
  // called "transcript" -- the closest equivalent is body.data.raw_content
  // (a bulleted key-points summary). The field-name guesses this function
  // started with never matched that real shape, which is why real
  // deliveries were reaching this endpoint and returning 200 (no error) but
  // never actually storing anything -- normalized.transcript was always
  // empty under the old guesses, so the "no transcript content" branch
  // correctly (if unhelpfully) fired every time.
  //
  // Real shape checked first; every original guess kept as a fallback in
  // case Krisp changes shapes again or delivers a different event type.
  const data = (body.data && typeof body.data === 'object') ? body.data : {};
  const meeting = (data.meeting && typeof data.meeting === 'object') ? data.meeting
    : (body.meeting && typeof body.meeting === 'object') ? body.meeting
    : {};

  const meetingId = meeting.id || body.meeting_id || body.meetingId || null;
  const eventId = body.id || body.event_id || body.eventId || null;
  const title = meeting.title || body.title || '';
  const url = meeting.url || body.url || body.link || '';
  const startTime = meeting.start_date || body.start_time || body.startTime || null;
  const endTime = meeting.end_date || body.end_time || body.endTime || null;
  const durationSeconds = meeting.duration ?? body.duration_seconds ?? body.duration ?? null;
  const transcript = data.raw_content || body.transcript || body.transcript_text || body.transcriptText || '';

  return { meetingId, eventId, title, url, startTime, endTime, durationSeconds, transcript };
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providedSecret = req.headers['x-krisp-secret'];
  const expectedSecret = process.env.KRISP_WEBHOOK_SECRET;
  if(!expectedSecret){
    // Fail closed: if the secret was never configured in Vercel, refuse
    // everything rather than silently accepting unauthenticated payloads.
    return res.status(500).json({ error: 'Krisp webhook is not configured on this server yet.' });
  }
  if(!providedSecret || providedSecret !== expectedSecret){
    return res.status(401).json({ error: 'Invalid or missing webhook secret.' });
  }

  console.log('[krisp-webhook] received');

  if(DEBUG_LOG_RAW_PAYLOAD){
    console.log('[KRISP WEBHOOK DEBUG] raw body:', JSON.stringify(req.body));
    console.log('[KRISP WEBHOOK DEBUG] headers:', JSON.stringify(redactHeaders(req.headers)));
  }

  const normalized = normalizeKrispPayload(req.body);
  if(!normalized){
    return res.status(400).json({ error: 'Malformed payload: request body is not a usable JSON object.' });
  }

  const dedupeKey = normalized.meetingId || normalized.eventId;
  if(!dedupeKey){
    return res.status(400).json({ error: 'Payload has neither a meeting ID nor an event ID -- nothing to dedupe or store on.' });
  }

  try{
    if(!normalized.transcript){
      // Notes/outline-only events aren't useful here -- Pathfinder's
      // whole point is the transcript. Acknowledge with 200 so Krisp
      // doesn't retry something that will never have transcript
      // content, but do nothing further. Missing/optional fields are
      // not an error condition.
      console.log('[krisp-webhook] no transcript content, ignored (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: false, reason: 'No transcript content in this event.' });
    }

    const dedupeMarkerKey = 'krisp:seen:' + dedupeKey;
    const alreadySeen = await kv.get(dedupeMarkerKey);
    if(alreadySeen){
      console.log('[krisp-webhook] duplicate ignored (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: false, reason: 'Duplicate delivery (already processed).' });
    }
    await kv.set(dedupeMarkerKey, true, { ex: DEDUPE_TTL_SECONDS });

    console.log('[krisp-webhook] accepted (id=' + dedupeKey + ')');

    const record = {
      meetingId: normalized.meetingId,
      eventId: normalized.eventId,
      title: normalized.title,
      url: normalized.url,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      durationSeconds: normalized.durationSeconds,
      transcript: normalized.transcript,
      receivedAt: new Date().toISOString(),
      assigned: false
    };

    const waitingSince = await kv.get('krisp:waitingSince');
    if(waitingSince){
      // A teacher has Pathfinder open and is actively waiting for the
      // next transcript -- attach directly rather than queueing it.
      record.assigned = true;
      await kv.set('krisp:matched', record);
      await kv.set('krisp:waitingSince', null);
      console.log('[krisp-webhook] waiting session matched (id=' + dedupeKey + ')');
      console.log('[krisp-webhook] transcript assigned (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: true, matched: true });
    }

    // No one was waiting -- file it in the pending-import inbox instead
    // so nothing is lost; the teacher can insert it manually later.
    const pending = (await kv.get('krisp:pending')) || [];
    pending.unshift(record);
    if(pending.length > PENDING_LIST_MAX){
      pending.length = PENDING_LIST_MAX;
    }
    await kv.set('krisp:pending', pending);
    console.log('[krisp-webhook] pending import created (id=' + dedupeKey + ')');

    return res.status(200).json({ stored: true, matched: false });
  }catch(err){
    // Unexpected failure (a KV outage, etc.) -- log the real error
    // server-side for our own debugging, but never leak internals
    // (stack traces, error messages) into the response body.
    console.error('[krisp-webhook] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
