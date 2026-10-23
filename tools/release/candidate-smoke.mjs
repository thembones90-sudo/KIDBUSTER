#!/usr/bin/env node
// LIVE candidate checks for a Classbuster deployment (staged candidate or
// production). Read-only and refusal-only: page and asset loads, plus requests
// every protected route must REFUSE (no key, invalid key, unsigned webhook,
// invalid email/token). It never sends an email, creates an account, starts a
// checkout, generates a report or uses a real credential.
//
//   node tools/release/candidate-smoke.mjs https://<candidate-or-production-host> [--expect-scout enabled|disabled]
//
// Protected staged candidates: export VERCEL_AUTOMATION_BYPASS_SECRET (never
// printed) to send Vercel's protection-bypass header. Exit code 1 on any FAIL.
// Owner-only Scout access and real sign-in/payment journeys need the owner and
// are listed in RELEASE-CHECKLIST.md; this script cannot and does not cover them.

const args = process.argv.slice(2);
const base = String(args[0] || '').replace(/\/+$/, '');
if(!/^https:\/\/[a-z0-9.-]+$/i.test(base)){ console.error('usage: candidate-smoke.mjs https://<host> [--expect-scout enabled|disabled]'); process.exit(2); }
const expectScout = args.includes('--expect-scout') ? args[args.indexOf('--expect-scout') + 1] : 'enabled';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const results = [];

async function call(method, path, { headers = {}, body } = {}){
  const h = { 'user-agent': 'classbuster-release-smoke', ...headers };
  if(bypass) h['x-vercel-protection-bypass'] = bypass;
  let payload;
  if(body !== undefined){ payload = typeof body === 'string' ? body : JSON.stringify(body); if(!h['content-type']) h['content-type'] = 'application/json'; }
  const res = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const text = await res.text().catch(() => '');
  return { status: res.status, headers: res.headers, text };
}
async function probe(name, fn){
  try{ const detail = await fn(); results.push({ name, ok: true, detail: detail || '' }); }
  catch(err){ results.push({ name, ok: false, detail: err.message }); }
}
const expect = (cond, msg) => { if(!cond) throw new Error(msg); };
const status = (r, ...codes) => { expect(codes.includes(r.status), 'HTTP ' + r.status + ' (expected ' + codes.join('/') + ')'); return 'HTTP ' + r.status; };

await probe('page loads with Classbuster branding, protocol engine and security headers', async () => {
  const r = await call('GET', '/');
  status(r, 200);
  expect(/<title>Classbuster<\/title>/.test(r.text), 'title is not Classbuster');
  expect(r.text.includes('const KidbusterCore = (function(){'), 'protocol engine missing from page');
  for(const p of ['MA', 'MS', 'FAIRY', 'BLITZ', 'BEIDA', 'OF', 'PREPLY']) expect(r.text.includes('name="protocol" value="' + p + '"'), 'protocol ' + p + ' missing');
  expect(/default-src 'self'/.test(r.headers.get('content-security-policy') || ''), 'CSP header missing');
  expect((r.headers.get('x-content-type-options') || '') === 'nosniff', 'nosniff header missing');
  return 'HTTP 200, 7 protocols, CSP';
});
for(const asset of ['/assets/radar-van-client.js', '/assets/scout-integration.css', '/assets/owner-usage-stats.js', '/assets/owner-usage-stats.css', '/assets/scout-release.js'])
  await probe('asset served: ' + asset, async () => status(await call('GET', asset), 200));
await probe('Scout download stays unpublished', async () => {
  const r = await call('GET', '/assets/scout-release.json'); status(r, 200);
  expect(JSON.parse(r.text).available === false, 'Scout download manifest is published'); return 'available:false';
});
await probe('health ping', async () => status(await call('GET', '/api/ping'), 200));

// Customer access: routes exist and refuse invalid input without side effects.
await probe('license status refuses a request without a key', async () => status(await call('GET', '/api/license-status'), 401));
await probe('registration refuses an invalid email (no email sent)', async () => status(await call('POST', '/api/license-signup', { body: { email: 'not-an-email' } }), 400));
await probe('recovery refuses an invalid email (no email sent)', async () => status(await call('POST', '/api/license-recover', { body: { email: 'not-an-email' } }), 400));
await probe('email-link sign-in refuses an invalid token', async () => status(await call('POST', '/api/license-verify', { body: { token: 'invalid-release-smoke-token' } }), 400));

// Payments: checkout validates input; the webhook refuses unsigned requests.
await probe('checkout refuses an invalid email before contacting the provider', async () => status(await call('POST', '/api/create-checkout-session', { body: { email: 'not-an-email' } }), 400));
await probe('payment webhook refuses an unsigned request', async () => status(await call('POST', '/api/payment-webhook', { body: '{"meta":{"event_name":"subscription_created"}}' }), 400, 401));

// Report generation, owner tools, Krisp.
// A well-formed request is built by the trusted protocol engine first (no AI
// call, no quota), then refused for the missing key: proves the engine loads.
await probe('report generation builds the prompt, then refuses a request without a key', async () => status(await call('POST', '/api/generate', { body: { generation: {
  protocol: 'PREPLY', studentName: 'Smoke', notes: '[00:00] TEACHER: Hello\n[00:02] STUDENT: Hi there', lengthFormat: 'short', preplyModule: 'adult' } } }), 401));
await probe('owner license lookup refuses a non-owner', async () => status(await call('POST', '/api/admin-license-lookup', { headers: { 'x-app-key': 'release-smoke-not-a-key' }, body: { action: 'lookup' } }), 403));
await probe('owner key creation refuses a non-owner', async () => status(await call('POST', '/api/admin-create-license', { headers: { 'x-app-key': 'release-smoke-not-a-key' }, body: {} }), 403));
await probe('Krisp webhook refuses an invalid token', async () => status(await call('POST', '/api/krisp-webhook?token=invalid-release-smoke', { body: {} }), 401));

// Scout: owner-only. Enabled -> 401 without a key, 403 for any non-owner key.
if(expectScout === 'enabled'){
  await probe('Scout is enabled and asks for credentials', async () => status(await call('GET', '/api/radar-van-session'), 401));
  await probe('Scout refuses a non-owner key', async () => status(await call('GET', '/api/radar-van-session', { headers: { 'x-app-key': 'release-smoke-not-a-key' } }), 403));
  await probe('Scout ingest refuses a missing device token', async () => status(await call('POST', '/api/radar-van-ingest', { body: {} }), 401));
}else{
  await probe('Scout is disabled on this deployment', async () => status(await call('GET', '/api/radar-van-session'), 404));
}

const failed = results.filter(r => !r.ok);
for(const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' — ' + r.detail : ''));
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' live checks passed against ' + base + (bypass ? ' (protection bypass header sent)' : ''));
process.exit(failed.length ? 1 : 0);
