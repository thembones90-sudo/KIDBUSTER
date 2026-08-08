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
import { isFounderLicenseKey, getLicense, isLicenseExpired } from './_lib/licensing.js';
import { getOrCreateKrispToken, regenerateKrispToken, disconnectKrisp } from './_lib/krisp-token.js';
import { kv } from './_lib/kv-client.js';

function dataKeyPrefix(userIdentity){
  return 'krisp:data:' + userIdentity + ':';
}

async function isEntitledToKrisp(licenseKey){
  if(!licenseKey) return false;
  if(isFounderLicenseKey(licenseKey)) return true;
  const license = await getLicense(licenseKey);
  if(!license) return false;
  if(license.plan !== 'pro' || license.status !== 'active') return false;
  if(isLicenseExpired(license)) return false;
  return true;
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
  if(req.method === 'POST' && (req.body || {}).action === 'regenerate'){
    const newToken = await regenerateKrispToken(licenseKey);
    return res.status(200).json({ webhookUrl: 'https://kidbuster.vercel.app/api/krisp-webhook?token=' + newToken });
  }
  if(req.method === 'POST' && (req.body || {}).action === 'disconnect'){
    await disconnectKrisp(licenseKey);
    return res.status(200).json({ disconnected: true });
  }

  const token = await getOrCreateKrispToken(licenseKey);
  const prefix = dataKeyPrefix(licenseKey);

  const waitingKey = prefix + 'waitingSince';
  const matchedKey = prefix + 'matched';
  const pendingKey = prefix + 'pending';

  if(req.method === 'GET'){
    const matched = await kv.get(matchedKey).catch(() => null);
    if(matched){
      await kv.set(matchedKey, null).catch(() => {});
    }
    const waitingSince = await kv.get(waitingKey).catch(() => null);
    const pendingRaw = (await kv.get(pendingKey).catch(() => null)) || [];
    const pending = sortPendingByMeetingStart(pendingRaw);
    const lastReceivedAt = await kv.get(prefix + 'lastReceivedAt').catch(() => null);
    return res.status(200).json({
      matched,
      waiting: !!waitingSince,
      pending,
      pendingCount: pending.length,
      lastReceivedAt,
      webhookUrl: 'https://kidbuster.vercel.app/api/krisp-webhook?token=' + token
    });
  }

  if(req.method === 'POST'){
    const action = (req.body || {}).action;

    if(action === 'wait'){
      await kv.set(waitingKey, new Date().toISOString()).catch(() => {});
      return res.status(200).json({ waiting: true });
    }

    if(action === 'cancel-wait'){
      await kv.set(waitingKey, null).catch(() => {});
      return res.status(200).json({ waiting: false });
    }

    if(action === 'claim'){
      const meetingId = (req.body || {}).meetingId;
      if(!meetingId){
        return res.status(400).json({ error: 'meetingId is required to claim a pending import.' });
      }
      const pending = (await kv.get(pendingKey).catch(() => null)) || [];
      const index = pending.findIndex(item => item.meetingId === meetingId);
      if(index === -1){
        return res.status(404).json({ error: 'That pending import is no longer available.' });
      }
      const [claimed] = pending.splice(index, 1);
      await kv.set(pendingKey, pending).catch(() => {});
      return res.status(200).json({ claimed, pendingCount: pending.length });
    }

    if(action === 'dismiss'){
      const meetingId = (req.body || {}).meetingId;
      if(!meetingId){
        return res.status(400).json({ error: 'meetingId is required to dismiss a pending import.' });
      }
      const pending = (await kv.get(pendingKey).catch(() => null)) || [];
      const index = pending.findIndex(item => item.meetingId === meetingId);
      if(index === -1){
        return res.status(404).json({ error: 'That pending import is no longer available.' });
      }
      pending.splice(index, 1);
      await kv.set(pendingKey, pending).catch(() => {});
      return res.status(200).json({ dismissed: true, pendingCount: pending.length });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
