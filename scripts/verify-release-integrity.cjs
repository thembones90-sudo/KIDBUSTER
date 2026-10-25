'use strict';
// Release integrity gate. Runs in the Vercel install command (vercel.json), so a
// deployment that would break protected customer functionality fails to BUILD
// instead of going live. Protected: sign-in, recovery and registration;
// authentication emails the deployed relay accepts; license recognition and
// entitlement; Lemon Squeezy checkout and signed webhooks; paid Pro access;
// customer-record storage keys; usage statistics; Krisp; Scout owner-only
// authorization; report generation; the function budget.
//
// What this is: STATIC structure checks plus one SYNTHETIC check that renders
// the real authentication emails for the configured domain and validates them
// against the relay's rules. No network, no secrets, no customer data.
// What this is NOT: proof that production works. Promotion additionally needs
// the full test suite and the live candidate checks in RELEASE-CHECKLIST.md.
//
// Run locally: node scripts/verify-release-integrity.cjs [root]
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Owner-approved 2026-10-25. Do not refresh these fingerprints without a new
// explicit owner request to change the locked sizing behavior (see AGENTS.md).
const WORKSPACE_FIT_LOCK = [
  [
    "assets/initial-workspace-fit.js",
    "0c2f190bd57df53bac3e985cf9f6f6c298e9381d374b8be7c9edec657b68ec12"
  ],
  [
    "assets/initial-workspace-fit.css",
    "fbf43f687a4f72c5befdd177104560d23fc3cfba23a5959bc0d96ba8fb02e637"
  ]
];
const MAX_FUNCTIONS = 12;

// Rules of the mail relay deployed on Railway (tools/mail-relay/server.mjs at
// 00e8e09, Railway deployment d836a056). tests/test-mail-relay-contract.cjs
// fails if this mirror and the relay source ever differ.
const RELAY = {
  origins: ['https://classbuster.com', 'https://kidbuster.vercel.app', 'https://pathfinder-v2-staging-preview.vercel.app'],
  prefixes: ['Use this secure link within 15 minutes to access Classbuster: ', 'Use this secure link within 15 minutes to access Pathfinder: '],
  subjects: ['Verify your Classbuster email', 'Recover your Classbuster access', 'Verify your Pathfinder email', 'Recover your Pathfinder access']
};
// Customer data lives under these key prefixes. Renaming one silently orphans
// every existing customer, subscription, counter or Krisp connection.
const STORAGE_KEYS = [
  ['api/_lib/licensing.js', "'license:'", 'license records'],
  ['api/_lib/licensing.js', "'email:'", 'email-to-account index (sign-in and recovery)'],
  ['api/_lib/licensing.js', "'paymentCustomer:'", 'payment customer index (subscriptions)'],
  ['api/_lib/licensing.js', "'usage:'", 'monthly usage counters'],
  ['api/_lib/licensing.js', "'manualClaim:'", 'manual key activation claims'],
  ['api/_lib/licensing.js', "'trial:'", 'protocol trial counters'],
  ['api/_lib/licensing.js', "'webhookSeen:'", 'payment webhook replay protection'],
  ['api/_lib/krisp-token.js', "'krisp:user:'", 'Krisp connections'],
  ['api/_lib/krisp-token.js', "'krisp:token:'", 'Krisp webhook tokens'],
  ['api/_lib/usage-stats.js', "'stats:v1:", 'owner usage statistics']
];
const PROTOCOLS = ['MA', 'MS', 'FAIRY', 'BLITZ', 'BEIDA', 'OF', 'PREPLY'];

function checkRelease(root){
  const problems = [];
  const read = rel => { try{ return fs.readFileSync(path.join(root, rel), 'utf8'); }catch{ return null; } };
  const need = (rel, why) => { const text = read(rel); if(text === null) problems.push('missing ' + rel + ' (' + why + ')'); return text || ''; };
  const must = (text, pattern, message) => { if(text && !pattern.test(text)) problems.push(message); };

  // Preserve the approved display layer; unrelated application work stays editable.
  for(const [rel, expected] of WORKSPACE_FIT_LOCK){
    const source = need(rel, 'owner-approved workspace sizing lock');
    const actual = require('node:crypto').createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
    if(actual !== expected) problems.push('workspace sizing lock changed: ' + rel + '; explicit owner approval is required before updating the baseline');
    if(!(read('index.html') || '').includes(rel + '?v=20261025-3')) problems.push('workspace sizing lock reference missing: ' + rel);
  }

  // --- Customer sign-in, recovery and registration ---
  need('api/license-signup.js', 'new customer registration');
  need('api/license-recover.js', 'existing customer recovery');
  must(need('api/license-verify.js', 'email link sign-in'), /consumeVerificationToken|verifyAccessToken|access_token|token/i, 'api/license-verify.js no longer verifies the emailed access token');
  const access = need('api/_lib/access-request.js', 'sign-in email requests');
  must(access, /await sendAccessVerificationEmail\(/, 'sign-in requests no longer send the verification email');
  must(access, /status\(429\)/, 'sign-in requests lost their rate limit');
  const email = need('api/_lib/email-service.js', 'authentication email');
  must(email, /PATHFINDER_APP_URL/, 'authentication links no longer use the configured application URL');
  must(email, /\/\?access_token=/, 'authentication link format changed (the relay requires /?access_token=)');

  // --- Licenses, entitlement, paid Pro ---
  const lic = need('api/_lib/licensing.js', 'license rules');
  for(const name of ['evaluateEntitlement', 'isFounderLicenseKey', 'getLicense', 'effectiveSubscriptionLicense', 'isLicenseExpired'])
    must(lic, new RegExp('export (async )?function ' + name + '\\b'), 'licensing.js no longer exports ' + name);
  must(need('api/license-status.js', 'license recognition'), /getLicense|claimManualLicenseForInstallation/, 'license-status no longer reads the stored license');
  must(need('api/_lib/license-service.js', 'entitlement and quota'), /export async function reserveGeneration\b/, 'reserveGeneration (entitlement and quota) is missing');
  for(const [rel, prefix, why] of STORAGE_KEYS)
    if(!(read(rel) || '').includes(prefix)) problems.push('customer data key prefix ' + prefix + ' (' + why + ') changed or removed in ' + rel);

  // --- Lemon Squeezy checkout and webhooks ---
  must(need('api/create-checkout-session.js', 'checkout'), /createCheckout|getActiveProvider/, 'checkout no longer creates a provider checkout');
  const webhook = need('api/payment-webhook.js', 'subscription webhooks');
  must(webhook, /bodyParser:\s*false/, 'payment webhook must read the raw body (signature verification)');
  must(webhook, /verifyAndNormalizeWebhook/, 'payment webhook no longer verifies signatures');
  const ls = need('api/_lib/providers/lemonsqueezy.js', 'Lemon Squeezy provider');
  must(ls, /x-signature/, 'Lemon Squeezy signature header check removed');
  must(ls, /createHmac\('sha256'/, 'Lemon Squeezy HMAC verification removed');
  must(ls, /timingSafeEqual/, 'Lemon Squeezy signature comparison is no longer constant-time');

  // --- Krisp ---
  must(need('api/krisp-webhook.js', 'Krisp transcript delivery'), /resolveKrispToken[\s\S]*status\(401\)/, 'Krisp webhook no longer rejects invalid tokens');
  need('api/krisp-session.js', 'Krisp connection controls');
  must(need('api/_lib/krisp-token.js', 'Krisp webhook tokens'), /tokenResolvesToLicense/, 'Krisp self-heal (reverse-mapping repair) is missing');

  // --- Report generation ---
  const gen = need('api/generate.js', 'report generation');
  must(gen, /reserveGeneration/, 'report generation no longer checks entitlement');
  must(gen, /status\(401\)/, 'report generation no longer rejects requests without a key');
  must(gen, /recordUsageStats/, 'api/generate.js no longer records usage statistics');
  need('api/_lib/server-generation.js', 'trusted prompt construction');
  const html = need('index.html', 'application page');
  must(html, /const KidbusterCore = \(function\(\)\{/, 'index.html lost the protocol engine the server builds prompts from');
  for(const p of PROTOCOLS) if(html && !html.includes('name="protocol" value="' + p + '"')) problems.push('protocol ' + p + ' is missing from the page');

  // --- Scout (owner-only pilot): backend, dispatch, routes, client ---
  const rv = need('api/_lib/radar-van.js', 'Scout backend');
  need('api/_lib/radar-van-session-handler.js', 'Scout session route');
  need('api/_lib/radar-van-ingest-handler.js', 'Scout device ingest');
  const privateDownload = need('api/_lib/radar-van-download-handler.js', 'private owner Scout installer');
  must(privateDownload, /accountEntitlement\(identity\)/, 'Scout installer is missing master-only authorization');
  must(privateDownload, /issueSignedToken/, 'Scout installer does not mint private signed links');
  need('assets/radar-van-client.js', 'Scout browser client');
  need('assets/scout-integration.css', 'Scout inbox styles');
  const feedback = need('api/feedback.js', 'shared function hosting Scout routes');
  if(!/radar-van-session-handler\.js/.test(feedback) || !/radar-van-ingest-handler\.js/.test(feedback) || !/radar-van-download-handler\.js/.test(feedback))
    problems.push('api/feedback.js no longer dispatches the Scout routes');
  if(/configured\s*===\s*undefined\)\s*return\s+true/.test(rv)) problems.push('Scout owner gate fails OPEN when RADAR_VAN_OWNER_SHA256 is unset');
  must(rv, /if\(!configured\)\s*return\s+false/, 'Scout owner gate does not deny a missing fingerprint');
  must(rv, /isFounderLicenseKey\(identity\)/, 'Scout owner gate lost the server-side founder/master check');
  must(rv, /timingSafeEqual/, 'Scout owner gate lost its constant-time comparison');

  // --- Owner usage statistics, download gate ---
  need('api/_lib/usage-stats.js', 'owner usage statistics');
  need('assets/owner-usage-stats.js', 'owner usage panel');
  need('assets/owner-usage-stats.css', 'owner usage panel styles');
  const manifest = need('assets/scout-release.json', 'Scout download manifest');
  need('assets/scout-release.js', 'Scout download gate');
  if(manifest){ try{ if(JSON.parse(manifest).available !== false) problems.push('Public Scout download must remain frozen'); }catch{ problems.push('assets/scout-release.json is not valid JSON'); } }
  if(html && !html.includes('id="radarVanDownloadBtn"')) problems.push('Owner Scout download button is missing');
  for(const asset of ['assets/radar-van-client.js', 'assets/scout-integration.css', 'assets/owner-usage-stats.js', 'assets/owner-usage-stats.css', 'assets/scout-release.js'])
    if(html && !html.includes(asset)) problems.push('index.html does not load ' + asset);

  // --- Routing and function budget ---
  let config = {};
  try{ config = JSON.parse(read('vercel.json') || '{}'); }catch{ problems.push('vercel.json is not valid JSON'); }
  const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];
  for(const [source, destination] of [['/api/radar-van-ingest', '/api/feedback?radar=ingest'], ['/api/radar-van-session', '/api/feedback?radar=session'], ['/api/radar-van-download', '/api/feedback?radar=download']])
    if(!rewrites.some(r => r.source === source && r.destination === destination)) problems.push('vercel.json is missing the rewrite ' + source);
  // The gate runs in the install step: a build command would make Vercel demand
  // a 'public' output directory and stop serving the project root as before.
  if(!/&&\s*node scripts\/verify-release-integrity\.cjs$/.test(String(config.installCommand || ''))) problems.push('vercel.json no longer runs this gate in its install command');
  if(config.buildCommand) problems.push('vercel.json sets a build command (Vercel would then require a public/ output directory and fail)');
  // kidbuster.vercel.app must keep SERVING (not redirecting): the Lemon Squeezy
  // webhook, Krisp webhook links and installed Scout clients still post to it,
  // and webhook senders do not reliably follow redirects on POST.
  const redirects = Array.isArray(config.redirects) ? config.redirects : [];
  const hostRule = r => JSON.stringify(r.has || []).toLowerCase();
  if(redirects.some(r => /kidbuster\.vercel\.app/.test(hostRule(r)) || /^\/(api(\/|$)|:path\*|\(\.\*\))/.test(String(r.source || ''))))
    problems.push('vercel.json redirects the legacy domain or API routes (payment, Krisp and Scout webhooks would break)');
  const ignored = (read('.vercelignore') || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let functions = 0;
  try{ for(const name of fs.readdirSync(path.join(root, 'api'))) if(name.endsWith('.js') && !ignored.includes('api/' + name)) functions++; }
  catch{ problems.push('missing api/ directory'); }
  if(functions > MAX_FUNCTIONS) problems.push('deployment has ' + functions + ' serverless functions; the limit is ' + MAX_FUNCTIONS);

  return problems;
}

// Synthetic: render the real verification and recovery emails for each origin
// and validate them exactly as the relay does. Catches a domain migration or
// wording change the deployed relay would reject (the 2026-10-22 incident).
async function checkAuthEmails(root, origins){
  const problems = [];
  const saved = { mode: process.env.KIDBUSTER_TEST_EMAIL, url: process.env.PATHFINDER_APP_URL };
  try{
    process.env.KIDBUSTER_TEST_EMAIL = '1';
    const mod = await import(pathToFileURL(path.join(root, 'api', '_lib', 'email-service.js')).href + '?gate=' + Date.now());
    const token = 'GateCheck_' + 'A'.repeat(33);
    for(const origin of origins){
      process.env.PATHFINDER_APP_URL = origin;
      for(const intent of ['signup', 'recover']){
        const before = mod.__getTestMessages().length;
        await mod.sendAccessVerificationEmail({ email: 'gate@example.com', token, intent });
        const msg = mod.__getTestMessages()[before];
        const prefix = msg && RELAY.prefixes.find(p => typeof msg.text === 'string' && msg.text.startsWith(p));
        let url = null;
        try{ url = prefix ? new URL(msg.text.slice(prefix.length).trim()) : null; }catch{ url = null; }
        const ok = msg && RELAY.subjects.includes(msg.subject) && url && RELAY.origins.includes(url.origin) && url.pathname === '/' &&
          url.searchParams.size === 1 && url.searchParams.get('access_token') === token;
        if(!ok) problems.push('the relay would REJECT the ' + intent + ' email for ' + origin + ' (subject, wording or link not accepted)');
      }
    }
  }catch(err){
    problems.push('authentication email could not be rendered: ' + (err && err.message || err));
  }finally{
    if(saved.mode === undefined) delete process.env.KIDBUSTER_TEST_EMAIL; else process.env.KIDBUSTER_TEST_EMAIL = saved.mode;
    if(saved.url === undefined) delete process.env.PATHFINDER_APP_URL; else process.env.PATHFINDER_APP_URL = saved.url;
  }
  return problems;
}

// Origins to validate: the deployment's configured PATHFINDER_APP_URL (set
// during Vercel builds) plus the official domain.
function emailOrigins(){
  const configured = String(process.env.PATHFINDER_APP_URL || '').replace(/\/+$/, '');
  return [...new Set([configured, 'https://classbuster.com'].filter(Boolean))];
}

async function verifyRelease(root, origins = emailOrigins()){
  return [...checkRelease(root), ...await checkAuthEmails(root, origins)];
}

module.exports = { checkRelease, checkAuthEmails, verifyRelease, emailOrigins, RELAY, STORAGE_KEYS, PROTOCOLS, MAX_FUNCTIONS };

if(require.main === module){
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  verifyRelease(root).then(problems => {
    if(problems.length){
      console.error('RELEASE INTEGRITY FAILED (' + problems.length + '):\n- ' + problems.join('\n- '));
      process.exit(1);
    }
    console.log('Release integrity OK (static + synthetic email contract for ' + emailOrigins().join(', ') + '). Live candidate checks are still required before promotion.');
  });
}
