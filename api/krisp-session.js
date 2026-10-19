// Lets the Pathfinder frontend (a) tell the backend "I'm waiting for the
// next Krisp transcript right now", (b) poll for whether that wait has
// been matched yet, and (c) list/import/dismiss items sitting in the
// pending import inbox -- all scoped strictly to the calling user's own
// data.
//
// Any authenticated Pro user (or founder/admin, kept for debugging) can
// use this endpoint. The webhook TOKEN (looked up or created for their
// own validated license key) is only ever used for routing/auth on the
// webhook side -- the actual data here is stored under the user's
// stable license identity, resolved the same way, so pending imports
// survive token regeneration and Krisp reconnects. See
// _lib/krisp-token.js for the token<->identity design.
import { isEntitledToKrisp, readImportQueue, writeImportQueue, krispRetentionDays } from './_lib/krisp-retention.js';
import { getOrCreateKrispToken, regenerateKrispToken, disconnectKrisp, KrispTokenBusyError } from './_lib/krisp-token.js';
import crypto from 'crypto';
import { krispWebhookUrlForToken } from './_lib/krisp-webhook-url.js';
import { kv, acquirePaymentLock, releasePaymentLock } from './_lib/kv-client.js';

const PENDING_LIST_MAX = 20;
// A matched (armed) transcript is LEASED to the polling browser, not deleted
// on read. If the response is lost (sleeping phone, dropped connection) the
// lease lapses and the same transcript is offered again; the browser confirms
// receipt with the 'ack-matched' action, which is what removes it. A client
// that never acknowledges stops being offered the item after a few attempts.
const MATCHED_LEASE_MS = 45 * 1000;
const MAX_MATCHED_DELIVERIES = 20;
const PRODUCTION_FALLBACK_ORIGIN = 'https://kidbuster.vercel.app';

// The webhook URL a teacher pastes into Krisp must point at the deployment
// they are actually signed in to. It was previously hard-coded to production,
// which handed staging accounts a URL whose token production cannot resolve.
// Order: explicit configuration, then the request's own host, then production.
function webhookOrigin(req){
  for(const configured of [process.env.PATHFINDER_APP_URL, process.env.SITE_URL]){
    const raw = String(configured || '').trim();
    if(!raw) continue;
    try{
      const parsed = new URL(raw);
      if(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname))){
        return parsed.origin;
      }
    }catch(_err){ /* ignore a malformed value and try the next source */ }
  }
  const host = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(',')[0].trim();
  if(/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)){
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
    return (local ? 'http://' : 'https://') + host;
  }
  return PRODUCTION_FALLBACK_ORIGIN;
}
function krispWebhookUrl(req, token){
  if(process.env.VERCEL_ENV === 'preview') return krispWebhookUrlForToken(token);
  return webhookOrigin(req) + '/api/krisp-webhook?token=' + token;
}

function dataKeyPrefix(userIdentity){
  return 'krisp:data:' + userIdentity + ':';
}

function sortPendingByMeetingStart(pending){
  // Newest meeting first. Items with no startTime (shouldn't normally
  // happen, but defensively handled) sort to the end rather than
  // crashing or floating to the top.
  return [...pending].sort((a, b) => {
    const aTime = a.meetingStartTime || a.startTime;
    const bTime = b.meetingStartTime || b.startTime;
    if(!aTime && !bTime) return 0;
    if(!aTime) return 1;
    if(!bTime) return -1;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

function normalizeDeferredImport(record){
  if(!record || typeof record !== 'object') return null;
  const meetingId = typeof record.meetingId === 'string' ? record.meetingId.trim() : '';
  const transcript = typeof record.transcript === 'string' ? record.transcript.trim() : '';
  if(!meetingId || !transcript) return null;

  return {
    meetingId,
    transcript,
    title: typeof record.title === 'string' ? record.title : '',
    detectedStudentName: typeof record.detectedStudentName === 'string' ? record.detectedStudentName : '',
    detectedContext: typeof record.detectedContext === 'string' ? record.detectedContext : '',
    contentPreview: typeof record.contentPreview === 'string' ? record.contentPreview : transcript.slice(0, 220),
    meetingStartTime: record.meetingStartTime || record.startTime || null,
    startTime: record.startTime || record.meetingStartTime || null,
    durationSeconds: Number.isFinite(Number(record.durationSeconds)) ? Number(record.durationSeconds) : null,
    receivedAt: record.receivedAt || new Date(Date.now()).toISOString(),
    assigned: false,
    deferred: true
  };
}

export default async function handler(req, res){
  const licenseKey = req.headers['x-app-key'];
  const entitled = await isEntitledToKrisp(licenseKey);
  if(!entitled){
    return res.status(403).json({ error: 'A Pro (or owner) account is required to use the Krisp import inbox.' });
  }

  // regenerate/disconnect manage the token mapping themselves and don't
  // need an existing token looked up first -- handled before the
  // generic getOrCreateKrispToken call below. licenseKey here always
  // comes from the caller's own validated x-app-key header (checked by
  // isEntitledToKrisp above), never from the request body or any other
  // caller-supplied field -- there is no parameter through which a
  // caller could name a different user's identity, so these actions
  // can only ever affect the caller's own integration. Neither action
  // touches krisp:data:<licenseKey>:* at all -- pending imports are
  // keyed by identity, not by token, so they're untouched either way.
  const tokenBusy = () => res.status(503).json({ error: 'Krisp settings are busy. Retry in a moment.', reason: 'busy' });
  if(req.method === 'POST' && (req.body || {}).action === 'regenerate'){
    let newToken;
    try{ newToken = await regenerateKrispToken(licenseKey); }
    catch(err){ if(err instanceof KrispTokenBusyError) return tokenBusy(); throw err; }
    return res.status(200).json({ webhookUrl: krispWebhookUrl(req, newToken) });
  }
  if(req.method === 'POST' && (req.body || {}).action === 'disconnect'){
    try{ await disconnectKrisp(licenseKey); }
    catch(err){ if(err instanceof KrispTokenBusyError) return tokenBusy(); throw err; }
    return res.status(200).json({ disconnected: true });
  }

  // Only the initial connection-panel read validates both token mappings.
  // A migration can leave a visible forward URL with no working reverse
  // mapping, making Krisp receive 401 indefinitely despite a healthy server.
  // Do not add this extra KV read to every 5-second inbox poll.
  const verifyConnection = req.method === 'GET' && req.query?.verify === '1';
  const previousMapping = verifyConnection ? await kv.get('krisp:user:' + licenseKey) : null;
  let token;
  try{ token = await getOrCreateKrispToken(licenseKey, { verifyReverse: verifyConnection }); }
  catch(err){ if(err instanceof KrispTokenBusyError) return tokenBusy(); throw err; }
  const webhookLinkRepaired = !!(verifyConnection && previousMapping?.token && previousMapping.token !== token);
  const prefix = dataKeyPrefix(licenseKey);

  const waitingKey = prefix + 'waitingSince';
  const matchedKey = prefix + 'matched';
  const matchedQueueKey = prefix + 'matchedQueue';
  const pendingKey = prefix + 'pending';

  async function withMutationLock(work){
    const lockKey=prefix+'mutationLock';
    const lockToken=crypto.randomUUID();
    if(!await acquirePaymentLock(lockKey,lockToken,30))return {busy:true};
    try{return {value:await work()};}
    finally{await releasePaymentLock(lockKey,lockToken).catch(()=>{});}
  }

  if(req.method === 'GET'){
    const read=await withMutationLock(async()=>{
      const nowMs=Date.now();
      const legacy=await kv.getdel(matchedKey);
      let queue=await readImportQueue(matchedQueueKey,nowMs);
      if(legacy&&typeof legacy==='object'){
        if(!legacy.receivedAt)legacy.receivedAt=new Date(nowMs).toISOString();
        queue.unshift(legacy);
      }
      queue=queue.filter(item=>(item.deliveryCount||0)<MAX_MATCHED_DELIVERIES);
      const head=queue.find(item=>!item.leasedUntil||item.leasedUntil<=nowMs)||null;
      let matched=null;
      if(head){
        head.leasedUntil=nowMs+MATCHED_LEASE_MS;
        head.deliveryCount=(head.deliveryCount||0)+1;
        matched={...head};
        delete matched.leasedUntil;delete matched.deliveryCount;
      }
      await writeImportQueue(matchedQueueKey,queue,nowMs);
      return {matched,pendingRaw:await readImportQueue(pendingKey,nowMs)};
    });
    if(read.busy)return res.status(503).json({error:'Krisp inbox is busy. Retry shortly.'});
    const waitingSince = await kv.get(waitingKey);
    const {matched,pendingRaw}=read.value;
    const pending = sortPendingByMeetingStart(pendingRaw);
    const lastReceivedAt = await kv.get(prefix + 'lastReceivedAt').catch(() => null);
    return res.status(200).json({
      matched,
      waiting: !!waitingSince,
      pending,
      pendingCount: pending.length,
      retentionDays: krispRetentionDays(),
      lastReceivedAt,
      webhookLinkRepaired,
      webhookUrl: krispWebhookUrl(req, token)
    });
  }

  if(req.method === 'POST'){
    const action = (req.body || {}).action;

    if(action === 'wait'){
      await kv.set(waitingKey, new Date().toISOString());
      return res.status(200).json({ waiting: true });
    }

    if(action === 'ack-matched'){
      const meetingId = (req.body || {}).meetingId;
      if(!meetingId || typeof meetingId !== 'string'){
        return res.status(400).json({ error: 'meetingId is required to acknowledge a transcript.' });
      }
      const acked=await withMutationLock(async()=>{
        const queue=await readImportQueue(matchedQueueKey);
        const remaining=queue.filter(item=>item.meetingId!==meetingId);
        if(remaining.length===queue.length)return false;
        await writeImportQueue(matchedQueueKey,remaining);
        return true;
      });
      if(acked.busy)return res.status(409).json({error:'Krisp inbox changed. Please retry.'});
      return res.status(200).json({ acked: acked.value });
    }

    if(action === 'cancel-wait'){
      await kv.del(waitingKey);
      return res.status(200).json({ waiting: false });
    }

    if(action === 'claim'){
      const meetingId = (req.body || {}).meetingId;
      if(!meetingId){
        return res.status(400).json({ error: 'meetingId is required to claim a pending import.' });
      }
      const claim=await withMutationLock(async()=>{
        const pending=await readImportQueue(pendingKey);
        const index=pending.findIndex(item=>item.meetingId===meetingId);
        if(index===-1)return null;
        const [claimed]=pending.splice(index,1);
        await writeImportQueue(pendingKey,pending);
        return {claimed,pendingCount:pending.length};
      });
      if(claim.busy)return res.status(409).json({error:'Krisp inbox changed. Please retry.'});
      if(!claim.value){
        return res.status(404).json({ error: 'That pending import is no longer available.' });
      }
      return res.status(200).json(claim.value);
    }

    if(action === 'defer'){
      const record = normalizeDeferredImport((req.body || {}).record);
      if(!record){
        return res.status(400).json({ error: 'A valid Krisp import record is required to defer.' });
      }
      const deferred=await withMutationLock(async()=>{
        const pending=await readImportQueue(pendingKey);
        const existingIndex=pending.findIndex(item=>item.meetingId===record.meetingId);
        if(existingIndex===-1)pending.unshift(record);else pending[existingIndex]={...pending[existingIndex],...record};
        if(pending.length>PENDING_LIST_MAX)pending.length=PENDING_LIST_MAX;
        await writeImportQueue(pendingKey,pending);
        return sortPendingByMeetingStart(pending);
      });
      if(deferred.busy)return res.status(409).json({error:'Krisp inbox changed. Please retry.'});
      const sorted=deferred.value;
      return res.status(200).json({ deferred: true, pending: sorted, pendingCount: sorted.length });
    }

    if(action === 'dismiss'){
      const meetingId = (req.body || {}).meetingId;
      if(!meetingId){
        return res.status(400).json({ error: 'meetingId is required to dismiss a pending import.' });
      }
      const dismissed=await withMutationLock(async()=>{
        const pending=await readImportQueue(pendingKey);
        const index=pending.findIndex(item=>item.meetingId===meetingId);
        if(index===-1)return null;
        pending.splice(index,1);
        await writeImportQueue(pendingKey,pending);
        return pending.length;
      });
      if(dismissed.busy)return res.status(409).json({error:'Krisp inbox changed. Please retry.'});
      if(dismissed.value===null){
        return res.status(404).json({ error: 'That pending import is no longer available.' });
      }
      return res.status(200).json({ dismissed: true, pendingCount: dismissed.value });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
