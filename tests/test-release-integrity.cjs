'use strict';
// The release integrity gate (Vercel build command) passes on this tree and
// FAILS a deployment that breaks protected customer functionality: sign-in,
// recovery and registration, relay-compatible authentication emails, license
// recognition and entitlement, Lemon Squeezy checkout and signed webhooks,
// customer-record storage keys, usage statistics, Krisp, Scout owner-only
// authorization, report generation, routing and the function budget.
// Each case deliberately breaks one thing in a temporary copy. Offline only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createChecker } = require('./helpers/assert.cjs');

const ROOT = path.resolve(__dirname, '..');
const COPY = ['assets/initial-workspace-fit.js', 'assets/initial-workspace-fit.css', 'index.html', 'vercel.json', '.vercelignore', 'api', 'scripts', 'assets/radar-van-client.js', 'assets/scout-integration.css',
  'assets/owner-usage-stats.js', 'assets/owner-usage-stats.css', 'assets/scout-release.js', 'assets/scout-release.json'];

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-release-integrity.cjs ===');
  const gate = require('../scripts/verify-release-integrity.cjs');
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  check('every Vercel deployment runs the integrity gate in its install step', config.installCommand === 'npm install && node scripts/verify-release-integrity.cjs');
  check('no build command is set (Vercel keeps serving the project root)', !('buildCommand' in config));
  const ignored = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  check('the gate script is uploaded with the deployment', !ignored.some(p => /^\/?scripts\/?$/.test(p)));
  const current = await gate.verifyRelease(ROOT, ['https://classbuster.com', 'https://kidbuster.vercel.app']);
  check('this tree passes the gate (static + email contract for both domains)', current.length === 0);
  if(current.length) console.log('    ' + current.join('\n    '));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
  const fresh = () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'case-'));
    for(const rel of COPY) fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
    return dir;
  };
  const edit = (dir, rel, fn) => {
    const file = path.join(dir, rel), before = fs.readFileSync(file, 'utf8'), after = fn(before);
    if(after === before) throw new Error('test mutation did not change ' + rel);
    fs.writeFileSync(file, after);
  };
  const rm = rel => d => fs.rmSync(path.join(d, rel));
  const fails = async (label, mutate, pattern, origins = ['https://classbuster.com']) => {
    const dir = fresh();
    try{ mutate(dir); }catch(err){ check('mutation applied: ' + label + ' (' + err.message + ')', false); return; }
    const problems = await gate.verifyRelease(dir, origins);
    check('gate fails when ' + label, problems.some(p => pattern.test(p)));
  };
  try{
    check('a faithful copy passes', (await gate.verifyRelease(fresh(), ['https://classbuster.com'])).length === 0);

    await fails('approved workspace sizing JavaScript changes', d => edit(d, 'assets/initial-workspace-fit.js', s => s + '\n/* accidental change */'), /workspace sizing lock changed/);
    await fails('approved workspace sizing CSS changes', d => edit(d, 'assets/initial-workspace-fit.css', s => s + '\n.wrap { zoom: 1; }'), /workspace sizing lock changed/);
    await fails('workspace sizing asset reference disappears', d => edit(d, 'index.html', s => s.replace('assets/initial-workspace-fit.js?v=20261027-no-menu-resize', 'assets/missing.js')), /workspace sizing lock reference missing/);

    console.log('\n  Customer sign-in, recovery, registration, authentication email');
    await fails('the registration route is missing', rm('api/license-signup.js'), /registration/);
    await fails('the recovery route is missing', rm('api/license-recover.js'), /recovery/);
    await fails('sign-in requests stop sending the email', d => edit(d, 'api/_lib/access-request.js', s => s.replace(/await sendAccessVerificationEmail\(/, 'await noop(')), /verification email/);
    await fails('the sign-in rate limit is removed', d => edit(d, 'api/_lib/access-request.js', s => s.replace(/status\(429\)/g, 'status(200)')), /rate limit/);
    await fails('a domain migration produces links the relay rejects', () => {}, /relay would REJECT/, ['https://www.classbuster.com']);
    await fails('the email wording is rebranded without the relay', d => edit(d, 'api/_lib/email-service.js', s => s.replace(/access Pathfinder: /, 'sign in to Classbuster: ')), /relay would REJECT/);
    await fails('the email subject changes to one the relay rejects', d => edit(d, 'api/_lib/email-service.js', s => s.replace(/'Verify your Pathfinder email'/, "'Welcome to Classbuster'")), /relay would REJECT/);
    await fails('the link path changes', d => edit(d, 'api/_lib/email-service.js', s => s.replace("'/?access_token='", "'/login?access_token='")), /link format|relay would REJECT/);

    console.log('\n  Licenses, entitlement, customer records');
    await fails('a license helper export is removed', d => edit(d, 'api/_lib/licensing.js', s => s.replace('export function isLicenseExpired', 'function isLicenseExpired')), /isLicenseExpired/);
    await fails('entitlement/quota reservation is removed', d => edit(d, 'api/_lib/license-service.js', s => s.replace('export async function reserveGeneration', 'async function reserveGeneration')), /reserveGeneration/);
    await fails('the license record key prefix is renamed', d => edit(d, 'api/_lib/licensing.js', s => s.replace("'license:'", "'classbuster:license:'")), /'license:'/);
    await fails('the email index prefix is renamed', d => edit(d, 'api/_lib/licensing.js', s => s.replace("'email:'", "'mail:'")), /'email:'/);
    await fails('the payment customer index is renamed', d => edit(d, 'api/_lib/licensing.js', s => s.replace("'paymentCustomer:'", "'customer:'")), /paymentCustomer/);
    await fails('usage counters are renamed', d => edit(d, 'api/_lib/licensing.js', s => s.replace("'usage:'", "'use:'")), /'usage:'/);

    console.log('\n  Lemon Squeezy');
    await fails('checkout stops creating a provider checkout', d => edit(d, 'api/create-checkout-session.js', s => s.replace(/createCheckout|getActiveProvider/g, 'x')), /checkout/);
    await fails('the webhook parses JSON before verifying', d => edit(d, 'api/payment-webhook.js', s => s.replace(/bodyParser:\s*false/, 'bodyParser: true')), /raw body/);
    await fails('signature verification is removed from the webhook', d => edit(d, 'api/payment-webhook.js', s => s.replace(/verifyAndNormalizeWebhook/g, 'normalizeWebhook')), /verifies signatures/);
    await fails('the HMAC check is removed from the provider', d => edit(d, 'api/_lib/providers/lemonsqueezy.js', s => s.replace(/createHmac\('sha256'/g, "createHash('sha256'")), /HMAC/);
    await fails('the signature comparison stops being constant-time', d => edit(d, 'api/_lib/providers/lemonsqueezy.js', s => s.replace(/timingSafeEqual/g, 'equals')), /constant-time/);

    console.log('\n  Krisp, Scout, usage statistics');
    await fails('the Krisp webhook stops rejecting bad tokens', d => edit(d, 'api/krisp-webhook.js', s => s.replace(/status\(401\)/g, 'status(200)')), /Krisp webhook/);
    await fails('the Krisp connection key prefix is renamed', d => edit(d, 'api/_lib/krisp-token.js', s => s.replace("'krisp:user:'", "'krisp:u:'")), /krisp:user:/);
    await fails('the Krisp self-heal is reverted', d => edit(d, 'api/_lib/krisp-token.js', s => s.replaceAll('tokenResolvesToLicense', 'legacyLookup')), /Krisp self-heal/);
    await fails('the Scout backend is missing', rm('api/_lib/radar-van.js'), /Scout backend/);
    await fails('the Scout ingest route is missing', rm('api/_lib/radar-van-ingest-handler.js'), /device ingest/);
    await fails('the page stops loading the Scout client', d => edit(d, 'index.html', s => s.replaceAll('assets/radar-van-client.js', 'assets/x.js')), /radar-van-client/);
    await fails('the Scout owner gate fails open again', d => edit(d, 'api/_lib/radar-van.js', s => s.replace(/if\(!configured\)\s*return\s+false;/, 'if(configured === undefined) return true;')), /fails OPEN|missing fingerprint/);
    await fails('the Scout founder check is dropped', d => edit(d, 'api/_lib/radar-van.js', s => s.replace(/!isFounderLicenseKey\(identity\)/, 'false')), /founder/);
    await fails('owner usage statistics are missing', rm('api/_lib/usage-stats.js'), /usage statistics/);
    await fails('usage statistics keys are renamed', d => edit(d, 'api/_lib/usage-stats.js', s => s.replaceAll("'stats:v1:", "'stats:v2:")), /stats:v1/);

    console.log('\n  Report generation, routing, budget');
    await fails('generation stops checking entitlement', d => edit(d, 'api/generate.js', s => s.replaceAll('reserveGeneration', 'skipCheck')), /entitlement/);
    await fails('generation stops recording usage', d => edit(d, 'api/generate.js', s => s.replaceAll('recordUsageStats', 'noop')), /records usage/);
    await fails('the protocol engine is removed from the page', d => edit(d, 'index.html', s => s.replace('const KidbusterCore = (function(){', 'const Core = (function(){')), /protocol engine/);
    await fails('a protocol disappears from the page', d => edit(d, 'index.html', s => s.replace('name="protocol" value="BEIDA"', 'name="protocol" value="X"')), /protocol BEIDA/);
    await fails('a Scout rewrite is removed', d => edit(d, 'vercel.json', s => s.replace('"/api/radar-van-ingest"', '"/api/other"')), /rewrite \/api\/radar-van-ingest/);
    await fails('the install command stops running the gate', d => edit(d, 'vercel.json', s => s.replace('npm install && node scripts/verify-release-integrity.cjs', 'npm install')), /install command/);
    await fails('a build command is reintroduced', d => edit(d, 'vercel.json', s => { const c = JSON.parse(s); c.buildCommand = 'node x.js'; return JSON.stringify(c, null, 2); }), /build command/);
    const addRedirect = rule => d => edit(d, 'vercel.json', s => { const c = JSON.parse(s); c.redirects = [rule]; return JSON.stringify(c, null, 2); });
    await fails('the legacy domain is redirected to classbuster.com',
      addRedirect({ source: '/:path*', has: [{ type: 'host', value: 'kidbuster.vercel.app' }], destination: 'https://classbuster.com/:path*', permanent: true }), /legacy domain/);
    await fails('API routes are redirected', addRedirect({ source: '/api/:path*', destination: 'https://classbuster.com/api/:path*', permanent: false }), /legacy domain or API/);
    await fails('the function budget is exceeded', d => fs.writeFileSync(path.join(d, 'api/extra-function.js'), 'export default ()=>{}'), /serverless functions/);
    await fails('the Scout download manifest is broken', d => fs.writeFileSync(path.join(d, 'assets/scout-release.json'), '{nope'), /valid JSON/);
  }finally{ fs.rmSync(tmp, { recursive: true, force: true }); }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
