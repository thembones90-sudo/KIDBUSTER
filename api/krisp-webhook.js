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

  const body = req.body || {};

  // Krisp's documented payload fields are described narratively (meeting
  // ID, title, link/URL, start/end time, duration, transcript/notes/
  // outline content, a unique event ID) rather than as a fixed JSON
  // schema we've seen directly, so this reads a few plausible key-name
  // variants defensively instead of assuming one exact shape. This is the
  // one part of this file most likely to need a small adjustment once a
  // real webhook delivery is seen.
  const meetingId = body.meeting_id || body.meetingId || (body.meeting && body.meeting.id) || null;
  const eventId = body.event_id || body.eventId || body.id || null;
  const dedupeKey = meetingId || eventId;
  if(!dedupeKey){
    return res.status(400).json({ error: 'Payload has neither a meeting ID nor an event ID -- nothing to dedupe or store on.' });
  }

  const title = body.title || (body.meeting && body.meeting.title) || '';
  const url = body.url || body.link || (body.meeting && body.meeting.url) || '';
  const startTime = body.start_time || body.startTime || null;
  const endTime = body.end_time || body.endTime || null;
  const durationSeconds = body.duration_seconds ?? body.duration ?? null;
  const transcript = body.transcript || body.transcript_text || body.transcriptText || '';

  if(!transcript){
    // Notes/outline-only events aren't useful here -- Pathfinder's whole
    // point is the transcript. Acknowledge with 200 so Krisp doesn't
    // retry something that will never have transcript content, but do
    // nothing further.
    return res.status(200).json({ stored: false, reason: 'No transcript content in this event.' });
  }

  const dedupeMarkerKey = 'krisp:seen:' + dedupeKey;
  const alreadySeen = await kv.get(dedupeMarkerKey).catch(() => null);
  if(alreadySeen){
    return res.status(200).json({ stored: false, reason: 'Duplicate delivery (already processed).' });
  }
  await kv.set(dedupeMarkerKey, true, { ex: DEDUPE_TTL_SECONDS }).catch(() => {});

  const record = {
    meetingId,
    eventId,
    title,
    url,
    startTime,
    endTime,
    durationSeconds,
    transcript,
    receivedAt: new Date().toISOString(),
    assigned: false
  };

  const waitingSince = await kv.get('krisp:waitingSince').catch(() => null);
  if(waitingSince){
    // A teacher has Pathfinder open and is actively waiting for the next
    // transcript -- attach directly rather than queueing it.
    record.assigned = true;
    await kv.set('krisp:matched', record).catch(() => {});
    await kv.set('krisp:waitingSince', null).catch(() => {});
    return res.status(200).json({ stored: true, matched: true });
  }

  // No one was waiting -- file it in the pending-import inbox instead so
  // nothing is lost; the teacher can insert it manually later.
  const pending = (await kv.get('krisp:pending').catch(() => null)) || [];
  pending.unshift(record);
  if(pending.length > PENDING_LIST_MAX){
    pending.length = PENDING_LIST_MAX;
  }
  await kv.set('krisp:pending', pending).catch(() => {});

  return res.status(200).json({ stored: true, matched: false });
}
