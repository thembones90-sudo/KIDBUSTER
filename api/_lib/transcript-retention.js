// New transcript bodies have their own absolute storage expiry. Queue indexes
// retain only opaque IDs, timestamps and delivery/claim state. Untagged legacy
// records stay inline under their original source's retention policy.
import crypto from 'node:crypto';
import { kv } from './kv-client.js';

export const NEW_TRANSCRIPT_RETENTION_HOURS = 12;
const WINDOW_MS = NEW_TRANSCRIPT_RETENTION_HOURS * 3600000;
const STORED_BODY = Symbol('stored transcript body');
const STATE = ['leasedUntil', 'deliveryCount', 'claimedUntil', 'claimCount', 'assigned', 'deferred'];

export function markNewTranscript(record, nowMs = Date.now()){
  return { ...record, receivedAt: new Date(nowMs).toISOString(),
    retentionVersion: 1, retentionExpiresAt: nowMs + WINDOW_MS };
}

export function transcriptDeadline(record, legacyMs){
  const received = Date.parse(record?.receivedAt);
  if(!Number.isFinite(received)) return null;
  if(record.retentionVersion === undefined) return received + legacyMs;
  if(record.retentionVersion !== 1 || !Number.isSafeInteger(record.retentionExpiresAt) ||
      record.retentionExpiresAt !== received + WINDOW_MS) return null;
  return record.retentionExpiresAt;
}

function contentKey(queueKey, record){
  const base = queueKey.replace(/:(pending|matched|matchedQueue)$/, '');
  const digest = crypto.createHash('sha256').update(JSON.stringify([
    record.meetingId, record.receivedAt, record.retentionExpiresAt
  ])).digest('hex');
  return base + ':content12:' + digest;
}

function legacyReceiptKey(queueKey, meetingId){
  const base = queueKey.replace(/:(pending|matched|matchedQueue)$/, '');
  return base + ':legacy-retention:' + crypto.createHash('sha256').update(String(meetingId)).digest('hex');
}

// A legacy item consumed by a browser may be deferred back to the inbox.
// Remember only its original identity/time, so deferral preserves its old
// window without trusting a client to declare arbitrary new text "legacy".
export async function rememberLegacyTranscript(key, record, legacyMs, nowMs = Date.now()){
  const deadline = transcriptDeadline(record, legacyMs);
  if(record.retentionVersion !== undefined || !record.meetingId || !(deadline > nowMs)) return;
  await kv.set(legacyReceiptKey(key, record.meetingId), {
    meetingId: record.meetingId, receivedAt: record.receivedAt, deadline
  }, { pxat: deadline, nx: true });
}

export async function prepareDeferredTranscript(key, record, legacyMs, nowMs = Date.now()){
  const received = Date.parse(record.receivedAt);
  const fresh = markNewTranscript(record, Number.isFinite(received) ? Math.min(received, nowMs) : nowMs);
  const stored = await kv.get(contentKey(key, fresh));
  if(stored?.meetingId === fresh.meetingId && stored.receivedAt === fresh.receivedAt &&
      transcriptDeadline(stored, legacyMs) === fresh.retentionExpiresAt){
    if(String(stored.transcript).trim() !== record.transcript.trim()) return null;
    const prepared = { ...stored };
    for(const field of STATE) if(field in record) prepared[field] = record[field];
    return prepared;
  }
  const receipt = record.retentionVersion === 1 ? null :
    await kv.get(legacyReceiptKey(key, record.meetingId));
  if(receipt?.meetingId === record.meetingId && receipt.deadline > nowMs &&
      Date.parse(receipt.receivedAt) + legacyMs === receipt.deadline){
    return { ...record, receivedAt: receipt.receivedAt };
  }
  return fresh;
}

export async function readTranscriptQueue(key, raw, legacyMs, nowMs = Date.now()){
  if(!Array.isArray(raw)) return { items: [], pruned: false };
  const live = raw.filter(record => record && (record.retentionVersion === undefined || typeof record.meetingId === 'string' || Number.isFinite(record.meetingId)) &&
    transcriptDeadline(record, legacyMs) > nowMs);
  const refs = live.filter(record => record.retentionVersion === 1 && record.contentRef);
  const valid = refs.filter(record => record.contentRef === contentKey(key, record));
  const keys = valid.map(record => record.contentRef);
  const values = keys.length ? (kv.mget ? await kv.mget(...keys) :
    await Promise.all(keys.map(name => kv.get(name)))) : [];
  const bodies = new Map(keys.map((name, i) => [name, values[i]]));
  const items = [];
  for(const record of live){
    if(!record.contentRef){ items.push(record); continue; }
    if(record.retentionVersion !== 1 || record.contentRef !== contentKey(key, record)) continue;
    const body = bodies.get(record.contentRef);
    if(!body || typeof body !== 'object' || body.meetingId !== record.meetingId ||
        body.receivedAt !== record.receivedAt ||
        transcriptDeadline(body, legacyMs) !== record.retentionExpiresAt) continue;
    const item = { ...body };
    Object.defineProperty(item, STORED_BODY, { value: JSON.stringify(body) });
    for(const field of STATE){ delete item[field]; if(field in record) item[field] = record[field]; }
    items.push(item);
  }
  return { items, pruned: items.length !== raw.length };
}

export async function writeTranscriptQueue(key, items, legacyMs, nowMs = Date.now()){
  const live = items.filter(record => transcriptDeadline(record, legacyMs) > nowMs);
  if(!live.length){ await kv.del(key); return live; }
  const index = [], writes = [];
  for(const record of live){
    if(record.retentionVersion !== 1){ index.push(record); continue; }
    const { contentRef: unused, ...body } = record;
    for(const field of STATE) delete body[field];
    const ref = contentKey(key, body);
    // PXAT never extends a lifetime during polling, leases, moves or retries.
    // Persist the body before publishing its reference. A failed index write
    // can leave only an expiring orphan, never an acknowledged missing body.
    if(record[STORED_BODY] !== JSON.stringify(body)) writes.push([ref, body]);
    const entry = { meetingId: body.meetingId, receivedAt: body.receivedAt,
      retentionVersion: 1, retentionExpiresAt: body.retentionExpiresAt, contentRef: ref };
    for(const field of ['lessonId', 'eventId', ...STATE]) if(field in record) entry[field] = record[field];
    index.push(entry);
  }
  if(writes.length){
    if(kv.pipeline){
      const pipeline = kv.pipeline();
      for(const [ref, body] of writes) pipeline.set(ref, body, { pxat: body.retentionExpiresAt });
      await pipeline.exec();
    }else{
      await Promise.all(writes.map(([ref, body]) => kv.set(ref, body, { pxat: body.retentionExpiresAt })));
    }
  }
  // Legacy records keep their old window. New opaque references may outlive
  // their bodies in a mixed index, but no lesson text or personal labels do.
  const deadline = Math.max(...live.map(record => transcriptDeadline(record, legacyMs)));
  await kv.set(key, index, { pxat: deadline });
  return live;
}
