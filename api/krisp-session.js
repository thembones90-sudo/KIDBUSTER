// Lets the Pathfinder frontend (a) tell the backend "I'm waiting for the
// next Krisp transcript right now", (b) poll for whether that wait has
// been matched yet, and (c) list/claim items sitting in the pending
// import inbox.
//
// This is deliberately gated to the founder/owner account only, the same
// way admin-create-license.js is. This whole feature is a personal
// workflow tool tied to one specific Krisp account and one specific
// teacher -- it was never meant to be visible to ordinary site visitors,
// who would otherwise be able to see (and interfere with) the transcript
// inbox just by calling this endpoint directly.
import { isFounderLicenseKey } from './_lib/licensing.js';
import { kv } from './_lib/kv-client.js';

export default async function handler(req, res){
  const ownerKey = req.headers['x-app-key'];
  if(!isFounderLicenseKey(ownerKey)){
    return res.status(403).json({ error: 'Owner access is required to use the Krisp import inbox.' });
  }

  if(req.method === 'GET'){
    const matched = await kv.get('krisp:matched').catch(() => null);
    if(matched){
      // Consumed exactly once -- once the frontend has picked it up,
      // clear it so a page refresh doesn't re-apply the same transcript.
      await kv.set('krisp:matched', null).catch(() => {});
    }
    const waitingSince = await kv.get('krisp:waitingSince').catch(() => null);
    const pending = (await kv.get('krisp:pending').catch(() => null)) || [];
    return res.status(200).json({ matched, waiting: !!waitingSince, pending });
  }

  if(req.method === 'POST'){
    const action = (req.body || {}).action;

    if(action === 'wait'){
      await kv.set('krisp:waitingSince', new Date().toISOString()).catch(() => {});
      return res.status(200).json({ waiting: true });
    }

    if(action === 'cancel-wait'){
      await kv.set('krisp:waitingSince', null).catch(() => {});
      return res.status(200).json({ waiting: false });
    }

    if(action === 'claim'){
      // Manually insert one specific item from the pending inbox (the
      // "small pending-import inbox" fallback for an unmatched transcript,
      // and also what "Recover Latest Krisp Transcript" uses under the
      // hood -- both just read what's already stored, never re-request
      // anything from Krisp itself).
      const meetingId = (req.body || {}).meetingId;
      if(!meetingId){
        return res.status(400).json({ error: 'meetingId is required to claim a pending import.' });
      }
      const pending = (await kv.get('krisp:pending').catch(() => null)) || [];
      const index = pending.findIndex(item => item.meetingId === meetingId);
      if(index === -1){
        return res.status(404).json({ error: 'That pending import is no longer available.' });
      }
      const [claimed] = pending.splice(index, 1);
      await kv.set('krisp:pending', pending).catch(() => {});
      return res.status(200).json({ claimed });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
