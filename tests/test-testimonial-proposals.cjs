'use strict';
// Private testimonial proposals (owner request 2026-11-02): authorization,
// validation, idempotence, rate limit, owner-only review, no third-party
// mirroring and no public publication.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-testimonial-proposals.cjs ===');
  process.env.KIDBUSTER_TEST_KV = '1';
  const root = path.resolve(__dirname, '..');
  const publicFile = path.join(root, 'assets/testimonials/testimonials.json');
  const publicHash = () => crypto.createHash('sha256').update(fs.readFileSync(publicFile)).digest('hex');
  const publicBefore = publicHash();

  const feedback = await import('../api/feedback.js');
  const svc = await import('../api/_lib/license-service.js');
  const store = await import('../api/_lib/feedback-store.js');
  const kvMod = await import('../api/_lib/kv-client.js');

  const saved = {};
  for(const k of ['APP_ACCESS_KEY', 'OWNER_LICENSE_KEYS', 'FOUNDER_LICENSE_KEYS', 'GOOGLE_SHEET_WEBHOOK_URL']) saved[k] = process.env[k];
  const originalFetch = global.fetch;
  let thirdPartyCalls = 0;

  async function call({ method = 'POST', key, body, query }){
    const req = { method, headers: key ? { 'x-app-key': key } : {}, body, query: query || {} };
    let statusCode = null, jsonBody = null;
    const res = { status(c){ statusCode = c; return res; }, json(b){ jsonBody = b; return res; }, setHeader(){} };
    await feedback.default(req, res);
    return { statusCode, body: jsonBody };
  }
  const pid = () => crypto.randomBytes(8).toString('hex');
  const proposal = extra => ({ proposalId: pid(), story: 'Classbuster cut my report writing time in half.', displayName: 'Ana', role: 'Online ESL teacher', contactOk: true, ...extra });
  const T = { kind: 'testimonial' };

  try{
    kvMod.__resetForTests();
    process.env.APP_ACCESS_KEY = 'shared_app_key_test';
    process.env.OWNER_LICENSE_KEYS = 'owner_key_test';
    process.env.FOUNDER_LICENSE_KEYS = '';
    process.env.GOOGLE_SHEET_WEBHOOK_URL = 'https://example.test/sheet';
    global.fetch = async () => { thirdPartyCalls++; return { ok: true }; };
    const teacher = await svc.getOrCreateFreeLicense('teacher.one@example.com');
    const other = await svc.getOrCreateFreeLicense('teacher.two@example.com');

    console.log('\n1) feedback save confirms stored:true with an id the browser can link');
    const fb = await call({ key: teacher, body: { teacherName: 'T', protocol: 'MA', ratingTier: '4', score: 2, comment: 'Useful but long', category: 'quality' } });
    check('feedback stored and returns feedbackId', fb.statusCode === 200 && fb.body.stored === true && Number.isSafeInteger(fb.body.feedbackId));
    thirdPartyCalls = 0;

    console.log('\n2) authorization');
    check('no key -> 401', (await call({ body: proposal(), query: T })).statusCode === 401);
    check('random key -> 401', (await call({ key: 'nope', body: proposal(), query: T })).statusCode === 401);
    check('shared legacy app key has no identity -> 401', (await call({ key: 'shared_app_key_test', body: proposal(), query: T })).statusCode === 401);
    check('GET on proposal route -> 405', (await call({ method: 'GET', key: teacher, query: T })).statusCode === 405);

    console.log('\n3) validation');
    const bad = async (body, label) => check(label, (await call({ key: teacher, body, query: T })).statusCode === 400);
    await bad(proposal({ contactOk: false }), 'contact permission required');
    await bad(proposal({ proposalId: 'x' }), 'malformed proposal id refused');
    await bad(proposal({ story: 'short' }), 'too-short story refused');
    await bad(proposal({ story: 'a'.repeat(801) }), 'too-long story refused');
    await bad(proposal({ story: 'Email me at ana@example.com any time please' }), 'email address refused');
    await bad(proposal({ story: 'See https://example.com for more about me' }), 'link refused');
    await bad(proposal({ story: 'Call me on +1 555 123 4567 about Classbuster' }), 'phone number refused');
    await bad(proposal({ story: 'Nice tool ‮reversed text here' }), 'bidi control refused');
    await bad(proposal({ displayName: 'ana@example.com' }), 'contact detail in name refused');
    check('classbuster.com and years are fine', !store.validateTestimonialProposal(proposal({ story: 'I found classbuster.com in 2024-2025 and use it daily.' })).error);

    console.log('\n4) private storage, server-side contact email, linking');
    const first = proposal({ feedbackId: fb.body.feedbackId });
    const ok = await call({ key: teacher, body: first, query: T });
    check('accepted as private proposal', ok.statusCode === 200 && ok.body.status === 'received_private' && ok.body.published === false && ok.body.duplicate === false);
    const items = await store.listTestimonialProposals();
    const item = items.find(i => i.id === ok.body.id);
    check('stored with non-publishable status', item && item.status === 'received_private' && item.publishable === false);
    check('contact email comes from the license record', item && item.contactEmail === 'teacher.one@example.com');
    check('linked to own feedback item', item && item.feedbackId === fb.body.feedbackId);
    check('no raw license key stored', !JSON.stringify(item).includes(teacher));
    const foreign = await call({ key: other, body: proposal({ feedbackId: fb.body.feedbackId }), query: T });
    const foreignItem = (await store.listTestimonialProposals()).find(i => i.id === foreign.body.id);
    check('another account cannot link to this feedback', foreign.statusCode === 200 && foreignItem && foreignItem.feedbackId === null);

    console.log('\n5) idempotence');
    const again = await call({ key: teacher, body: first, query: T });
    check('retry with same proposalId returns the same record', again.statusCode === 200 && again.body.duplicate === true && again.body.id === ok.body.id);
    check('retry did not create a second record', (await store.listTestimonialProposals()).filter(i => i.account === item.account).length === 1);

    console.log('\n6) daily limit');
    await call({ key: teacher, body: proposal(), query: T });
    await call({ key: teacher, body: proposal(), query: T });
    const limited = await call({ key: teacher, body: proposal(), query: T });
    check('fourth story in a day -> 429', limited.statusCode === 429);

    console.log('\n7) owner-only review');
    check('teacher cannot list feedback/proposals', (await call({ method: 'GET', key: teacher })).statusCode === 403);
    const owner = await call({ method: 'GET', key: 'owner_key_test' });
    check('owner sees proposals', owner.statusCode === 200 && Array.isArray(owner.body.testimonialProposals) && owner.body.testimonialProposals.length === 4);

    console.log('\n8) no third-party mirroring, no public publication');
    check('no Sheet/third-party request for proposals', thirdPartyCalls === 0);
    check('public testimonials.json untouched', publicHash() === publicBefore);
    const storeSrc = fs.readFileSync(path.join(root, 'api/_lib/feedback-store.js'), 'utf8');
    check('store never touches the public testimonials file', !/testimonials\.json/.test(storeSrc.replace(/\/\/.*$/gm, '')) && !/from 'node:fs'|require\('fs'\)/.test(storeSrc));
    const clientSrc = fs.readFileSync(path.join(root, 'assets/testimonial-invite.js'), 'utf8');
    const fetches = clientSrc.match(/fetch\(/g) || [];
    check('client sends stories only to the private endpoint', fetches.length === 1 && clientSrc.includes("fetch('/api/feedback?kind=testimonial'"));
    check('client has no third-party/analytics calls', !/https?:\/\/[a-z]|gtag\(|google-analytics|sendBeacon|dataLayer|XMLHttpRequest|new Image\(/i.test(clientSrc.replace(/\/\/.*$/gm, '')));
    const pub = JSON.parse(fs.readFileSync(publicFile, 'utf8'));
    check('no proposal text reached the public file', !JSON.stringify(pub).includes('report writing time'));

    console.log('\n9) store outage never fakes success and allows retry');
    const retry = proposal();
    kvMod.__simulateOutage(true);
    const down = await call({ key: other, body: retry, query: T });
    kvMod.__simulateOutage(false);
    check('full outage -> 503, never 200', down.statusCode === 503);
    const realIncr = kvMod.kv.incr;
    kvMod.kv.incr = async () => { throw new Error('simulated mid-write failure'); };
    let mid;
    try{ mid = await call({ key: other, body: retry, query: T }); }finally{ kvMod.kv.incr = realIncr; }
    check('mid-write failure -> 503, never 200', mid.statusCode === 503);
    const after = await call({ key: other, body: retry, query: T });
    check('same proposal succeeds after recovery', after.statusCode === 200 && after.body.duplicate === false);
  }finally{
    global.fetch = originalFetch;
    for(const [k, v] of Object.entries(saved)){ if(v === undefined) delete process.env[k]; else process.env[k] = v; }
    kvMod.__resetForTests();
  }
  return getFailures();
};
if(require.main === module) module.exports().then(f => { process.exitCode = f ? 1 : 0; });
