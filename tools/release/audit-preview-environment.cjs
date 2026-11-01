'use strict';
// Release-only scope audit; consumes names and target scopes ONLY, never variable values.
// Usage: node tools/release/audit-preview-environment.cjs <sanitized-json-file>
// Exit 2 = unsafe shared writes; exit 1 = invalid/incomplete data; exit 0 = scope-separated.
// A zero exit does NOT certify that the actual secrets or upstream databases differ.
const fs = require('node:fs');

const CRITICAL = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'KV_REST_API_REDIS_URL',
  'KV_REST_API_KV_URL',
  'KV_REST_API_READ_ONLY_TOKEN',
  'GOOGLE_SHEET_WEBHOOK_URL',
  'APP_ACCESS_KEY',
  'FOUNDER_LICENSE_KEYS',
  'OWNER_LICENSE_KEYS'
];
const PROVIDER = [
  'LEMONSQUEEZY_API_KEY',
  'LEMONSQUEEZY_STORE_ID',
  'LEMONSQUEEZY_PRO_VARIANT_ID',
  'LEMONSQUEEZY_WEBHOOK_SECRET'
];
const REQUIRED = ['KV_REST_API_URL','KV_REST_API_TOKEN',...PROVIDER];

function auditScope(records) {
  if (!Array.isArray(records)) throw new TypeError('Expected an array of sanitized environment records');
  const safe = records.map(r => {
    if (!r || typeof r.key !== 'string' || !Array.isArray(r.target) || !r.target.every(t => typeof t === 'string')) {
      throw new TypeError('Invalid environment record (expected key and target array)');
    }
    return { key: r.key, target: r.target };
  });
  const targets = (key, target) => safe.filter(r => r.key === key && r.target.includes(target));
  const findings = [];
  const all = [...new Set([...CRITICAL, ...PROVIDER])];
  for (const key of all) {
    const shared = safe.filter(r => r.key === key && r.target.includes('preview') && r.target.includes('production'));
    if (shared.length) findings.push({severity:'BLOCK',key,reason:'ONE ENTRY targets both Preview and Production'});
  }
  for (const key of REQUIRED) {
    if (!targets(key,'production').length || !targets(key,'preview').length) {
      findings.push({severity:'BLOCK',key,reason:'Missing production or preview-scoped configuration'});
    }
  }
  return {
    findings, blocked: findings.some(x=>x.severity==='BLOCK'),
    // Without comparing actual credential values and inspecting provider dashboards,
    // scoped entries are only a necessary, NOT a sufficient, isolation condition.
    verificationStillRequired: [
      'Compare production and preview Redis endpoint IDs and credentials in the console without recording their values',
      'Confirm preview Lemon Squeezy API key, store, variant and webhook are TEST MODE and independent from Live',
      'Confirm preview email/sheet/provider callbacks do not target live recipients or records',
      'Use a dedicated preview Redis instance and empty disposable test accounts before any positive checkout'
    ]
  };
}
function main() {
  if (process.argv.length !== 3) {
    console.error('usage: node tools/release/audit-preview-environment.cjs <sanitized-env-metadata.json>');
    process.exitCode=1;return;
  }
  try {
    const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    const report=auditScope(Array.isArray(input)?input:input.envs);
    for(const x of report.findings) console.log(x.severity+' '+x.key+': '+x.reason);
    for(const x of report.verificationStillRequired) console.log('MANUAL '+x);
    console.log(report.blocked ? 'NO-GO: shared or missing environment scope' : 'SCOPE CHECK PASSED; MANUAL MODE/DATABASE ISOLATION STILL REQUIRED');
    process.exitCode=report.blocked?2:0;
  } catch(e) {
    console.error('NO-GO: malformed or incomplete sanitized scope input: '+e.message);
    process.exitCode=1;
  }
}
module.exports={auditScope,CRITICAL,PROVIDER,REQUIRED};
if(require.main===module)main();
