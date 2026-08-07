// Receives completed-transcript payloads from Krisp's own Webhook API.
// Each Pro user configures their OWN unique URL in their OWN Krisp
// account:
//
//   https://kidbuster.vercel.app/api/krisp-webhook?token=<their-token>
//
// The token (see _lib/krisp-token.js) is both identity and authentication
// -- there's no separate shared secret. Krisp has no field for "which
// Pathfinder user is this," so the URL itself carries that information,
// the same way Slack/Stripe incoming-webhook URLs work per-account.
//
// Every piece of storage this file touches is namespaced under that
// token (krisp:<token>:pending, krisp:<token>:matched, etc.) -- there is
// no code path anywhere that reads or writes a key shared between two
// users' data. This is the actual privacy boundary, not an
// access-control check layered on top of shared storage.
//
// This is a one-way inbound integration only -- we never call out to
// Krisp. Deliberately does NOT implement Krisp's OAuth Platform API;
// that's a separate, heavier product meant for building full third-party
// integrations, and nothing here needs it.
import { kv } from './_lib/kv-client.js';
import { resolveKrispToken } from './_lib/krisp-token.js';

const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 7; // one week is far more than enough to catch retries
const PENDING_LIST_MAX = 20; // cap so this never grows unbounded if imports go unclaimed

// --- Student name detection (deterministic, no AI) ----------------------
// Applied to the Krisp meeting title. Deliberately conservative: it's
// far better to leave the Student field blank than to fill it with
// something wrong, since a wrong auto-fill is a silent error a teacher
// might not notice before generating a report. Every rejection path
// here is intentional, not a gap to be "improved" without evidence a
// real title needs it.
const GENERIC_TITLE_MARKERS = /\b(meeting|chrome|zoom|call|broadcast|getting started|hey|krisp|conference|webinar)\b/i;
const TIME_PATTERN = /\d{1,2}:\d{2}\s*(AM|PM)?/i;
const TRAILING_GENERIC_SUFFIX = /\s+(lesson|class|session|meeting|call)$/i;
const NAME_SHAPE = /^[A-Za-z][A-Za-z\s'-]*$/;

function detectStudentInfoFromTitle(title){
  if(!title || typeof title !== 'string') return { name: null, context: null };

  let candidate = null;
  let context = null;
  const separators = [' - ', ' \u2013 ', ' | ', ': '];
  for(const sep of separators){
    if(title.includes(sep)){
      const parts = title.split(sep);
      candidate = parts[0].trim();
      // The segment after the separator (e.g. "Preply" in "Amy - Preply")
      // is a natural byproduct of the same split -- surfaced as an
      // optional display label, not used in any confidence check.
      context = parts.slice(1).join(sep).trim() || null;
      break;
    }
  }
  if(!candidate && TRAILING_GENERIC_SUFFIX.test(title)){
    candidate = title.replace(TRAILING_GENERIC_SUFFIX, '').trim();
  }
  if(!candidate) return { name: null, context: null };

  if(candidate.length === 0 || candidate.length > 24) return { name: null, context: null };
  if(TIME_PATTERN.test(candidate)) return { name: null, context: null };
  if(/\d/.test(candidate)) return { name: null, context: null };
  if(GENERIC_TITLE_MARKERS.test(candidate)) return { name: null, context: null };
  if(candidate.split(/\s+/).length > 2) return { name: null, context: null };
  if(!NAME_SHAPE.test(candidate)) return { name: null, context: null };

  return { name: candidate, context };
}

// --- Normalization layer -------------------------------------------------
// Everything downstream deals only with Pathfinder's own internal shape.
// Real shape (confirmed via a live captured Krisp delivery) checked
// first; original field-name guesses kept as fallbacks in case Krisp
// changes shapes again or delivers a different event type.
function normalizeKrispPayload(body){
  if(!body || typeof body !== 'object' || Array.isArray(body)) return null;

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

  const token = req.query && req.query.token;
  // resolveKrispToken covers missing, malformed, unknown, AND revoked
  // tokens (regenerated or disconnected) with the same generic outcome
  // -- deliberately one error message for all four cases, so a request
  // can't be used to probe which case applies.
  const userIdentity = await resolveKrispToken(token);
  if(!userIdentity){
    return res.status(401).json({ error: 'Missing or invalid webhook token.' });
  }

  console.log('[krisp-webhook] received');

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
      console.log('[krisp-webhook] no transcript content, ignored (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: false, reason: 'No transcript content in this event.' });
    }

    const dedupeMarkerKey = 'krisp:' + token + ':seen:' + dedupeKey;
    const alreadySeen = await kv.get(dedupeMarkerKey);
    if(alreadySeen){
      console.log('[krisp-webhook] duplicate ignored (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: false, reason: 'Duplicate delivery (already processed).' });
    }
    await kv.set(dedupeMarkerKey, true, { ex: DEDUPE_TTL_SECONDS });

    console.log('[krisp-webhook] accepted (id=' + dedupeKey + ')');

    const studentInfo = detectStudentInfoFromTitle(normalized.title);
    const record = {
      meetingId: normalized.meetingId,
      eventId: normalized.eventId,
      title: normalized.title,
      url: normalized.url,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      durationSeconds: normalized.durationSeconds,
      transcript: normalized.transcript,
      detectedStudentName: studentInfo.name,
      detectedContext: studentInfo.context,
      receivedAt: new Date().toISOString(),
      assigned: false
    };

    const waitingKey = 'krisp:' + token + ':waitingSince';
    const matchedKey = 'krisp:' + token + ':matched';
    const pendingKey = 'krisp:' + token + ':pending';

    const waitingSince = await kv.get(waitingKey);
    if(waitingSince){
      record.assigned = true;
      await kv.set(matchedKey, record);
      await kv.set(waitingKey, null);
      console.log('[krisp-webhook] waiting session matched (id=' + dedupeKey + ')');
      console.log('[krisp-webhook] transcript assigned (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: true, matched: true });
    }

    const pending = (await kv.get(pendingKey)) || [];
    pending.unshift(record);
    if(pending.length > PENDING_LIST_MAX){
      pending.length = PENDING_LIST_MAX;
    }
    await kv.set(pendingKey, pending);
    console.log('[krisp-webhook] pending import created (id=' + dedupeKey + ')');

    return res.status(200).json({ stored: true, matched: false });
  }catch(err){
    console.error('[krisp-webhook] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
