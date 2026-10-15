// Requests a one-time mailbox-verification link. This route never returns a
// key and intentionally gives registered and unregistered emails the same
// response; the key exchange happens only in license-verify.js.

import { requestVerifiedAccess } from './_lib/access-request.js';

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try{
    return await requestVerifiedAccess(req, res, { intent: 'recover' });
  }catch(err){
    console.error('license-recover error:', err);
    return res.status(500).json({ error: 'Could not recover a license key right now.' });
  }
}
