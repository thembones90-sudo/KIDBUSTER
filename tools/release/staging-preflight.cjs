'use strict';
// Pure, local, fail-closed validation. It never calls Vercel or a provider.
const fs = require('node:fs');

const PROJECT = 'classbuster-isolated-staging';
const PROJECT_ID = 'prj_nv9khsQRl2OMMTaw15lfdq8LXu8m';
const REQUIRED = ['KV_REST_API_URL','KV_REST_API_TOKEN','LEMONSQUEEZY_API_KEY','LEMONSQUEEZY_STORE_ID','LEMONSQUEEZY_PRO_VARIANT_ID','LEMONSQUEEZY_WEBHOOK_SECRET','LEMONSQUEEZY_MODE'];
const FORBIDDEN = /(^|\/\/)(classbuster\.com|kidbuster\.vercel\.app)|googleapis\.com|sheets\.google/i;
const PLACEHOLDER = /REDACTED|REPLACE_WITH|PLACEHOLDER|EXAMPLE|TEST_(?:STORE|VARIANT)|NONSECRET|PENDING|RECORD_/i;
function preflight(input) {
  const m = input && input.manifest ? input.manifest : input;
  const errors = [];
  if (!m || m.project !== PROJECT) errors.push('project must be exactly '+PROJECT);
  if (m?.projectId !== PROJECT_ID) errors.push('projectId must be the protected isolated project ID');
  if (!/^[0-9a-f]{40}$/.test(m?.sourceSha || '')) errors.push('sourceSha must be an immutable 40-hex commit SHA');
  if (m?.protected !== true || m?.noProductionChange !== true) errors.push('protected and noProductionChange must both be true');
  if (m?.productionChangesAllowed !== false) errors.push('productionChangesAllowed must be false');
  if (m?.deploymentAllowed !== false) errors.push('deploymentAllowed must be false until operator approval');
  if (m?.publicAccess !== false) errors.push('publicAccess must be false');
  if (m?.lemonSqueezyMode !== 'test') errors.push('lemonSqueezyMode must be test');
  const vars = m?.environmentVariables || {};
  for (const key of REQUIRED) {
    const v=vars[key];
    if (!v || typeof v !== 'object' || v.name !== key || !Array.isArray(v.scopes) || !v.scopes.length || v.value !== undefined) errors.push('each environment variable requires sanitized name/scope metadata only: '+key);
    if (typeof v?.name === 'string' && PLACEHOLDER.test(v.name)) errors.push('placeholder variable metadata rejected: '+key);
    if (v?.scopes?.some(s => !['preview','production'].includes(s))) errors.push('invalid variable scope metadata: '+key);
  }
  for (const [key, value] of Object.entries(vars)) if (JSON.stringify(value).match(FORBIDDEN)) errors.push('unsafe public/live destination in '+key);
  const a=m?.providerEvidence;
  if (!a || a.status !== 'pass' || a.providerVerified !== true || (typeof a.attestedBy !== 'string' || !a.attestedBy.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(a.attestedAt||'')) errors.push('providerEvidence requires verified provider attestation with reviewer and ISO date');
  return {ok: errors.length === 0, errors, secretValuesRead: false, cloudCallsMade: false};
}
function main() { try { const r=preflight(JSON.parse(fs.readFileSync(process.argv[2],'utf8'))); r.errors.forEach(e=>console.error('NO-GO: '+e)); console.log(r.ok?'PREFLIGHT PASS (local scaffolding only)':'PREFLIGHT BLOCKED'); process.exitCode=r.ok?0:2; } catch(e) { console.error('NO-GO: malformed manifest'); process.exitCode=1; } }
module.exports={preflight,REQUIRED}; if(require.main===module) main();
