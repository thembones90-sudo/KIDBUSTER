// Owner-only operational event log (2026-10-23). Vercel's plan keeps request
// logs for one hour; this keeps 30 days of content-free events so "it didn't
// work this morning" can be answered. Never stores transcripts, keys, tokens
// or full emails: callers pass masked values only. Recording never throws.
import { kv } from './kv-client.js';

export const EVENT_RETENTION_DAYS = 30;
const MAX_PER_DAY = 2000;
const day = ms => new Date(ms).toISOString().slice(0, 10);
const seqKey = d => 'events:v1:' + d + ':seq';
const eventKey = (d, n) => 'events:v1:' + d + ':' + n;

export async function recordEvent(type, fields = {}, { now = Date.now() } = {}){
  try{
    const d = day(now);
    const n = await kv.incr(seqKey(d));
    if(n === 1) await kv.expire(seqKey(d), (EVENT_RETENTION_DAYS + 1) * 86400);
    if(n > MAX_PER_DAY) return;
    const safe = {};
    for(const [k, v] of Object.entries(fields)){
      if(v === undefined || v === null) continue;
      safe[k] = typeof v === 'string' ? v.slice(0, 200) : typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 200);
    }
    await kv.set(eventKey(d, n), { at: new Date(now).toISOString(), type: String(type).slice(0, 40), ...safe }, { ex: EVENT_RETENTION_DAYS * 86400 });
  }catch(err){
    console.error('event log write failed:', (err && err.name) || 'error');
  }
}

// Newest first, across the last `days` days, at most `limit` events.
export async function readEvents({ days = 7, limit = 300, now = Date.now(), type = null } = {}){
  const out = [];
  for(let i = 0; i < Math.min(days, EVENT_RETENTION_DAYS) && out.length < limit; i++){
    const d = day(now - i * 86400000);
    const total = Math.min(Number(await kv.get(seqKey(d))) || 0, MAX_PER_DAY);
    for(let n = total; n >= 1 && out.length < limit; n--){
      const event = await kv.get(eventKey(d, n));
      if(event && (!type || event.type === type)) out.push(event);
    }
  }
  return out;
}
