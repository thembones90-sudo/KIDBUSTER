'use strict';
// Verifies operator-supplied nonsecret evidence only. No provider/API calls.
const fs=require('node:fs');
function verify(e) {
  const errors=[];
  const id=v=>typeof v==='string' && /^[a-z0-9][a-z0-9_-]{2,}$/.test(v) && !/example|placeholder|record|nonsecret|redacted|same/i.test(v);
  if (!id(e?.productionRedisId) || !id(e?.stagingRedisId) || e.productionRedisId === e.stagingRedisId) errors.push('distinct non-placeholder Upstash database IDs are required');
  const hash=v=>typeof v==='string' && /^[0-9a-f]{64}$/.test(v);
  if (!hash(e?.productionRedisCredentialHash) || !hash(e?.stagingRedisCredentialHash) || e.productionRedisCredentialHash === e.stagingRedisCredentialHash) errors.push('distinct 64-hex credential fingerprints are required');
  if (e?.lemonSqueezyMode !== 'test') errors.push('Lemon Squeezy console mode must be test');
  for (const k of ['productionStoreId','stagingTestStoreId','productionVariantId','stagingTestVariantId']) if (!Number.isSafeInteger(e?.[k]) || e[k] <= 0) errors.push('numeric '+k+' is required');
  if (!errors.length && (e.productionStoreId === e.stagingTestStoreId || e.productionVariantId === e.stagingTestVariantId)) errors.push('Lemon test store/variant must differ from production');
  if (e?.testMode !== true) errors.push('explicit testMode true is required');
  if (!['disabled','dedicated-test'].includes(e?.sheetDestination) || !['disabled','dedicated-test'].includes(e?.emailDestination)) errors.push('email and Sheets must be disabled or separately dedicated test destinations');
  if (typeof e?.reviewer !== 'string' || !e.reviewer.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(e?.reviewedAt||'') || e.reviewStatus !== 'pass') errors.push('reviewer, ISO date, and pass status are mandatory');
  return {ok:!errors.length,errors,secretValuesRead:false,providerCallsMade:false};
}
function main(){try{const r=verify(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));r.errors.forEach(e=>console.error('NO-GO: '+e));console.log(r.ok?'ISOLATION EVIDENCE PASS':'ISOLATION EVIDENCE BLOCKED');process.exitCode=r.ok?0:2}catch(e){console.error('NO-GO: malformed evidence');process.exitCode=1}}
module.exports={verify};if(require.main===module)main();
