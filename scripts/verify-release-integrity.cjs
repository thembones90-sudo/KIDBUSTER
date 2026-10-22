'use strict';
// Release integrity gate. Runs as the Vercel build command (vercel.json), so a
// deployment that is missing Scout, owner usage statistics, the fail-closed
// owner gate or the Krisp self-heal fails to BUILD instead of silently going
// live without them. Static checks only: no network, no secrets, no deps.
// Run locally: node scripts/verify-release-integrity.cjs [root]
const fs = require('node:fs');
const path = require('node:path');

const MAX_FUNCTIONS = 12;

function checkRelease(root){
  const problems = [];
  const file = rel => path.join(root, rel);
  const read = rel => { try{ return fs.readFileSync(file(rel), 'utf8'); }catch{ return null; } };
  const need = (rel, why) => { const text = read(rel); if(text === null) problems.push('missing ' + rel + ' (' + why + ')'); return text || ''; };

  // Scout (owner-only pilot): backend, dispatch, routes and browser client.
  const rv = need('api/_lib/radar-van.js', 'Scout backend');
  need('api/_lib/radar-van-session-handler.js', 'Scout session route');
  need('api/_lib/radar-van-ingest-handler.js', 'Scout device ingest');
  need('assets/radar-van-client.js', 'Scout browser client');
  need('assets/scout-integration.css', 'Scout inbox styles');
  const feedback = need('api/feedback.js', 'shared function hosting Scout routes');
  if(!/radar-van-session-handler\.js/.test(feedback) || !/radar-van-ingest-handler\.js/.test(feedback))
    problems.push('api/feedback.js no longer dispatches the Scout routes');

  // The owner gate must fail closed: founder check AND a configured fingerprint.
  if(/configured\s*===\s*undefined\)\s*return\s+true/.test(rv)) problems.push('Scout owner gate fails OPEN when RADAR_VAN_OWNER_SHA256 is unset');
  if(rv && !/if\(!configured\)\s*return\s+false/.test(rv)) problems.push('Scout owner gate does not deny a missing fingerprint');
  if(rv && !/isFounderLicenseKey\(identity\)/.test(rv)) problems.push('Scout owner gate lost the server-side founder/master check');
  if(rv && !/timingSafeEqual/.test(rv)) problems.push('Scout owner gate lost its constant-time comparison');

  // Owner usage and cost statistics.
  need('api/_lib/usage-stats.js', 'owner usage statistics');
  need('assets/owner-usage-stats.js', 'owner usage panel');
  need('assets/owner-usage-stats.css', 'owner usage panel styles');
  if(!/recordUsageStats/.test(need('api/generate.js', 'report generation'))) problems.push('api/generate.js no longer records usage statistics');

  // Krisp self-heal after the datastore migration.
  if(!/tokenResolvesToLicense/.test(need('api/_lib/krisp-token.js', 'Krisp webhook tokens')))
    problems.push('Krisp self-heal (reverse-mapping repair) is missing');

  // Static Scout download gate.
  const manifest = need('assets/scout-release.json', 'Scout download manifest');
  need('assets/scout-release.js', 'Scout download gate');
  if(manifest){ try{ JSON.parse(manifest); }catch{ problems.push('assets/scout-release.json is not valid JSON'); } }

  // The page must actually load every component.
  const html = need('index.html', 'application page');
  for(const asset of ['assets/radar-van-client.js', 'assets/scout-integration.css', 'assets/owner-usage-stats.js', 'assets/owner-usage-stats.css', 'assets/scout-release.js'])
    if(html && !html.includes(asset)) problems.push('index.html does not load ' + asset);

  // Scout routes are rewrites into the existing function (no extra function).
  let config = {};
  try{ config = JSON.parse(read('vercel.json') || '{}'); }catch{ problems.push('vercel.json is not valid JSON'); }
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  for(const [source, destination] of [['/api/radar-van-ingest', '/api/feedback?radar=ingest'], ['/api/radar-van-session', '/api/feedback?radar=session']])
    if(!rewrites.some(r => r.source === source && r.destination === destination)) problems.push('vercel.json is missing the rewrite ' + source);

  // Vercel function budget.
  const ignored = (read('.vercelignore') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let functions = 0;
  try{
    for(const name of fs.readdirSync(file('api'))){
      if(name.endsWith('.js') && !ignored.includes('api/' + name)) functions++;
    }
  }catch{ problems.push('missing api/ directory'); }
  if(functions > MAX_FUNCTIONS) problems.push('deployment has ' + functions + ' serverless functions; the limit is ' + MAX_FUNCTIONS);

  return problems;
}

module.exports = { checkRelease, MAX_FUNCTIONS };

if(require.main === module){
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const problems = checkRelease(root);
  if(problems.length){
    console.error('RELEASE INTEGRITY FAILED (' + problems.length + '):\n- ' + problems.join('\n- '));
    process.exit(1);
  }
  console.log('Release integrity OK: Scout (fail-closed owner gate), owner usage statistics, Krisp self-heal, download gate, routes, function budget.');
}
