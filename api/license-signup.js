// Starts verified Free signup. If the email already owns an account this
// safely becomes recovery, without disclosing that fact in the response.
import { requestVerifiedAccess } from './_lib/access-request.js';

export default async function handler(req, res){
  if(req.method !== 'POST'){
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try{
    return await requestVerifiedAccess(req, res, { intent: 'signup' });
  }catch(err){
    console.error('license-signup error:', err);
    return res.status(500).json({ error: 'Could not create a license key right now. Please try again shortly.' });
  }
}
