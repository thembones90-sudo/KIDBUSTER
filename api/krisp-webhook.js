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
// Storage is namespaced by the user's STABLE license identity (resolved
// from the token at request time), not by the token itself. A webhook
// URL is a rotatable/revocable credential -- regenerating or
// disconnecting it must never lose pending imports, so the data lives
// one level below the token's own lifecycle. See _lib/krisp-token.js
// for the token<->identity mapping this resolves against.
//
// This is a one-way inbound integration only -- we never call out to
// Krisp. Deliberately does NOT implement Krisp's OAuth Platform API;
// that's a separate, heavier product meant for building full third-party
// integrations, and nothing here needs it.
import { kv } from './_lib/kv-client.js';
import { resolveKrispToken } from './_lib/krisp-token.js';

const DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 7; // one week is far more than enough to catch retries
const PENDING_LIST_MAX = 20; // cap so this never grows unbounded if imports go unclaimed
const CONTENT_PREVIEW_MAX_CHARS = 140;

function dataKeyPrefix(userIdentity){
  return 'krisp:data:' + userIdentity + ':';
}

// --- Student name detection (deterministic, no AI) ----------------------
// Three sources, tried in priority order (title, then participant
// metadata, then transcript text). Deliberately conservative throughout:
// it's far better to leave the Student field blank than to fill it with
// something wrong, since a wrong auto-fill is a silent error a teacher
// might not notice before generating a report.
const GENERIC_NAME_WORDS = /^(today|yesterday|tomorrow|teacher|student|chrome|meeting|krisp|zoom|call|broadcast|conference|webinar|preply|lingo|lesson|class|session|hey|getting|started)$/i;
const GENERIC_TITLE_MARKERS = /\b(meeting|chrome|zoom|call|broadcast|getting started|hey|krisp|conference|webinar)\b/i;
const TIME_PATTERN = /\d{1,2}:\d{2}\s*(AM|PM)?/i;

function isValidNameCandidate(candidate){
  if(!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if(trimmed.length === 0 || trimmed.length > 24) return false;
  if(TIME_PATTERN.test(trimmed)) return false;
  if(/\d/.test(trimmed)) return false;
  if(trimmed.includes(':')) return false;
  if(!/^[A-Za-z][A-Za-z\s'-]*$/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if(words.length > 2) return false;
  for(const w of words){
    if(GENERIC_NAME_WORDS.test(w)) return false;
  }
  return true;
}

function extractFromTitle(title){
  if(!title || typeof title !== 'string') return { name: null, context: null };
  let candidate = null;
  let context = null;
  const separators = [' - ', ' \u2013 ', ' | ', ': '];
  for(const sep of separators){
    if(title.includes(sep)){
      const parts = title.split(sep);
      candidate = parts[0].trim();
      context = parts.slice(1).join(sep).trim() || null;
      break;
    }
  }
  if(!candidate){
    // "Kaya lesson" / "Kaya's lesson" / "Kaya class" / "Kaya session" / "Kaya meeting" / "Kaya call"
    const suffixMatch = title.match(/^([A-Za-z][A-Za-z\s'-]*?)('s)?\s+(lesson|class|session|meeting|call)$/i);
    if(suffixMatch) candidate = suffixMatch[1].trim();
  }
  if(!candidate) return { name: null, context: null };
  if(GENERIC_TITLE_MARKERS.test(candidate)) return { name: null, context: null };
  if(!isValidNameCandidate(candidate)) return { name: null, context: null };
  return { name: candidate, context };
}

// Only confident when participants/speakers metadata names exactly ONE
// distinct person. With two or more listed people there's no reliable
// way here to tell which one is the student and which is the teacher
// (Pathfinder doesn't track the teacher's own name/email to exclude
// them) -- so this deliberately detects nothing rather than guess.
function extractFromParticipants(meeting){
  if(!meeting || typeof meeting !== 'object') return { name: null };
  const lists = [];
  if(Array.isArray(meeting.participants)) lists.push(meeting.participants);
  if(Array.isArray(meeting.speakers)) lists.push(meeting.speakers);
  const candidates = new Set();
  for(const list of lists){
    for(const person of list){
      if(person && typeof person.first_name === 'string' && person.first_name.trim()){
        candidates.add(person.first_name.trim());
      }
    }
  }
  if(candidates.size !== 1) return { name: null };
  const only = [...candidates][0];
  if(!isValidNameCandidate(only)) return { name: null };
  return { name: only };
}

const TRANSCRIPT_NAME_PATTERNS = [
  /today'?s lesson with ([A-Za-z][A-Za-z'-]*)/i,
  /([A-Za-z][A-Za-z'-]*) and i discussed/i,
  /([A-Za-z][A-Za-z'-]*) practiced/i
];

function extractFromTranscript(content){
  if(!content || typeof content !== 'string') return { name: null };
  for(const pattern of TRANSCRIPT_NAME_PATTERNS){
    const match = content.match(pattern);
    if(match && match[1] && isValidNameCandidate(match[1].trim())){
      return { name: match[1].trim() };
    }
  }
  return { name: null };
}

function detectStudentInfo(normalized){
  const titleResult = extractFromTitle(normalized.title);
  if(titleResult.name) return { name: titleResult.name, context: titleResult.context, source: 'title' };

  const participantResult = extractFromParticipants(normalized.rawMeeting);
  if(participantResult.name) return { name: participantResult.name, context: null, source: 'participant' };

  const transcriptResult = extractFromTranscript(normalized.transcript);
  if(transcriptResult.name) return { name: transcriptResult.name, context: null, source: 'transcript' };

  return { name: null, context: null, source: null };
}

function buildContentPreview(transcript){
  if(!transcript || typeof transcript !== 'string') return '';
  const singleLine = transcript.replace(/\s+/g, ' ').trim();
  if(singleLine.length <= CONTENT_PREVIEW_MAX_CHARS) return singleLine;
  return singleLine.slice(0, CONTENT_PREVIEW_MAX_CHARS).trim() + '\u2026';
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

  return { meetingId, eventId, title, url, startTime, endTime, durationSeconds, transcript, rawMeeting: meeting };
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

  const prefix = dataKeyPrefix(userIdentity);

  try{
    if(!normalized.transcript){
      console.log('[krisp-webhook] no transcript content, ignored (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: false, reason: 'No transcript content in this event.' });
    }

    const dedupeMarkerKey = prefix + 'seen:' + dedupeKey;
    const alreadySeen = await kv.get(dedupeMarkerKey);
    if(alreadySeen){
      console.log('[krisp-webhook] duplicate ignored (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: false, reason: 'Duplicate delivery (already processed).' });
    }
    await kv.set(dedupeMarkerKey, true, { ex: DEDUPE_TTL_SECONDS });

    console.log('[krisp-webhook] accepted (id=' + dedupeKey + ')');

    const studentInfo = detectStudentInfo(normalized);
    const record = {
      meetingId: normalized.meetingId,
      eventId: normalized.eventId,
      title: normalized.title,
      url: normalized.url,
      startTime: normalized.startTime,
      meetingStartTime: normalized.startTime,
      endTime: normalized.endTime,
      durationSeconds: normalized.durationSeconds,
      transcript: normalized.transcript,
      contentPreview: buildContentPreview(normalized.transcript),
      studentNameCandidate: studentInfo.name,
      detectedStudentName: studentInfo.name,
      detectionSource: studentInfo.source,
      detectedContext: studentInfo.context,
      receivedAt: new Date().toISOString(),
      assigned: false
    };

    const waitingKey = prefix + 'waitingSince';
    const matchedKey = prefix + 'matched';
    const pendingKey = prefix + 'pending';

    const waitingSince = await kv.get(waitingKey);
    if(waitingSince){
      record.assigned = true;
      await kv.set(matchedKey, record);
      await kv.set(waitingKey, null);
      console.log('[krisp-webhook] waiting session matched (id=' + dedupeKey + ')');
      console.log('[krisp-webhook] transcript assigned (id=' + dedupeKey + ')');
      return res.status(200).json({ stored: true, matched: true });
    }

    // No one was waiting -- file it in the pending-import inbox instead
    // so nothing is lost; the teacher can insert it manually later.
    // Every pending item is preserved (up to the cap) rather than only
    // the newest -- ordering for display is handled at read time in
    // krisp-session.js, sorted by meeting start time, not arrival order.
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
