// Owner-only emergency replacement of the September 11 manual-code inventory.
// Existing customer records are never deleted. Only old, already-expired
// September 11 manual codes can be retired; renewed keys are protected.
import { getLicense, saveLicense, isFounderLicenseKey, isLicenseExpired } from './_lib/licensing.js';
import { createManualProLicense } from './_lib/license-service.js';
import { disconnectKrisp } from './_lib/krisp-token.js';

const OLD_BATCH_DATE = '2026-09-11';
const KEY_PATTERN = /^kb_live_[0-9a-f]{48}$/;
const mask = key => key.slice(0, 8) + '...' + key.slice(-4);

function parseKeys(raw){
  // Accept either a clean key list or Claude's numbered text list.
  const parts = (Array.isArray(raw) ? raw : String(raw || '').match(/kb_live_[0-9a-f]{48}/g) || [])
    .map(k => String(k || '').trim()).filter(Boolean);
  if(parts.length < 1 || parts.length > 25) throw new Error('Paste between 1 and 25 old keys.');
  if(parts.some(k => !KEY_PATTERN.test(k))) throw new Error('One or more old keys have an invalid format.');
  if(new Set(parts).size !== parts.length) throw new Error('Duplicate old keys detected.');
  return parts;
}

function describe(key, license){
  let category = 'protected';
  if(!license) category = 'missing';
  else if(license.status === 'revoked') category = 'already_retired';
  else if(license.manual === true && !license.paymentSubscriptionId
      && String(license.createdAt || '').slice(0,10) === OLD_BATCH_DATE
      && isLicenseExpired(license)) category = 'retire_eligible';
  return {
    key: mask(key),
    category,
    issued: license?.createdAt || null,
    expiry: license?.expiresAt || null,
    claimed: !!license?.claimedInstallationId
  };
}

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
  if(!isFounderLicenseKey(req.headers['x-app-key'])){
    return res.status(403).json({error:'Owner authorization is required.'});
  }
  const action = String(req.body?.action || '');
  try{
    if(action === 'create-batch'){
      const count = Number(req.body?.count);
      if(!Number.isInteger(count) || count < 1 || count > 20){
        return res.status(400).json({error:'Choose 1 to 20 new activation-based codes.'});
      }
      // Bounded concurrency: avoid overwhelming KV and avoid serverless timeouts.
      const results = [];
      for(let start=0; start<count; start+=5){
        const chunk=await Promise.allSettled(Array.from({length:Math.min(5,count-start)},
          () => createManualProLicense({email:'',days:30,note:'Activation-based replacement stock 2026-10-12'})));
        for(const item of chunk){
          if(item.status==='fulfilled') results.push(item.value);
        }
      }
      return res.status(results.length===count ? 200 : 207).json({
        created:results.length, requested:count,
        codes:results.map(x=>x.licenseKey), activationPending:true,
        message:'Clock starts only at first activation. Copy and securely store these codes now.'
      });
    }
    if(action !== 'preview-retirement' && action !== 'retire-expired'){
      return res.status(400).json({error:'Unknown batch action.'});
    }
    const keys = parseKeys(req.body?.keys);
    const results = [];
    for(const key of keys){
      const license=await getLicense(key);
      const info=describe(key,license);
      if(action === 'retire-expired' && info.category==='retire_eligible'){
        await saveLicense(key,{
          ...license,
          status:'revoked',
          revokedAt:new Date().toISOString(),
          revocationReason:'September 11 expired inventory replaced by activation-based keys'
        });
        // Invalidate the retired key's inbound Krisp webhook token too,
        // without deleting any previously received transcripts.
        await disconnectKrisp(key);
        info.category='retired';
      }
      results.push(info);
    }
    const summary={};
    for(const item of results) summary[item.category]=(summary[item.category]||0)+1;
    return res.status(200).json({items:results,summary,action});
  }catch(err){
    if(err.message && /keys|format|Duplicate/.test(err.message))return res.status(400).json({error:err.message});
    console.error('admin-manual-batch failed:',err);
    return res.status(500).json({error:'Could not complete batch operation; recheck the preview before retrying.'});
  }
}
