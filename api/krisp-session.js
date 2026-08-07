// Lets the Pathfinder frontend (a) tell the backend "I'm waiting for the
// next Krisp transcript right now", (b) poll for whether that wait has
// been matched yet, and (c) list/claim items sitting in the pending
// import inbox -- all scoped strictly to the calling user's own data.
//
// Any authenticated Pro user (or founder/admin, kept for debugging) can
// use this endpoint, but the token looked up (or created, on first
// visit) for their OWN validated license key determines which storage
// namespace they read and write -- there is no parameter, header, or
// code path that lets a caller specify or guess someone else's token.
// See _lib/krisp-token.js for the random, independently-revocable token
// design and the regenerate/disconnect lifecycle.
import { isFounderLicenseKey, getLicense, isLicenseExpired } from './_lib/licensing.js';
import { getOrCreateKrispToken, regenerateKrispToken, disconnectKrisp } from './_lib/krisp-token.js';
import { kv } from './_lib/kv-client.js';

async function isEntitledToKrisp(licenseKey){
  if(!licenseKey) return false;
  if(isFounderLicenseKey(licenseKey)) return true;
  const license = await getLicense(licenseKey);
  if(!license) return false;
  if(license.plan !== 'pro' || license.status !== 'active') return false;
  if(isLicenseExpired(license)) return false;
  return true;
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
  // can only ever affect the caller's own integration.
  if(req.method === 'POST' && (req.body || {}).action === 'regenerate'){
    const newToken = await regenerateKrispToken(licenseKey);
    return res.status(200).json({ webhookUrl: 'https://kidbuster.vercel.app/api/krisp-webhook?token=' + newToken });
  }
  if(req.method === 'POST' && (req.body || {}).action === 'disconnect'){
    await disconnectKrisp(licenseKey);
    return res.status(200).json({ disconnected: true });
  }

  const token = await getOrCreateKrispToken(licenseKey);

  const waitingKey = 'krisp:' + token + ':waitingSince';
  const matchedKey = 'krisp:' + token + ':matched';
  const pendingKey = 'krisp:' + token + ':pending';

  if(req.method === 'GET'){
    const matched = await kv.get(matchedKey).catch(() => null);
    if(matched){
      await kv.set(matchedKey, null).catch(() => {});
    }
    const waitingSince = await kv.get(waitingKey).catch(() => null);
    const pending = (await kv.get(pendingKey).catch(() => null)) || [];
    return res.status(200).json({ matched, waiting: !!waitingSince, pending, webhookUrl: 'https://kidbuster.vercel.app/api/krisp-webhook?token=' + token });
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
      return res.status(200).json({ claimed });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
