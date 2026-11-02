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
    check('status check without a key -> 401', (await call({ method: 'GET', query: T })).statusCode === 401);
    const before = await call({ method: 'GET', key: teacher, query: T });
    check('status before any story: submitted false', before.statusCode === 200 && before.body.submitted === false);
    check('PUT on proposal route -> 405', (await call({ method: 'PUT', key: teacher, query: T })).statusCode === 405);

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

    console.log('\n6) one story per account (owner decision 2026-11-02)');
    const status = await call({ method: 'GET', key: teacher, query: T });
    check('status after a story: submitted true', status.statusCode === 200 && status.body.submitted === true);
    const fresh = await svc.getOrCreateFreeLicense('teacher.fresh@example.com');
    check('another account is unaffected', (await call({ method: 'GET', key: fresh, query: T })).body.submitted === false);
    const recordsBefore = (await store.listTestimonialProposals()).length;
    const secondP = proposal();
    const second = await call({ key: teacher, body: secondP, query: T });
    check('a different second story -> 409 already_submitted', second.statusCode === 409 && second.body.status === 'already_submitted');
    check('the second story stored nothing', (await store.listTestimonialProposals()).length === recordsBefore);
    check('the second story left no claim behind', !kvMod.__dumpForTests()['tp:idem:' + store.accountTag(teacher) + ':' + secondP.proposalId]);
    const sameAgain = await call({ key: teacher, body: first, query: T });
    check('a retry of the stored story still answers 200 duplicate, not refused', sameAgain.statusCode === 200 && sameAgain.body.duplicate === true && sameAgain.body.id === ok.body.id);
    check('the marker holds only the story id and never expires', (() => { const m = kvMod.__dumpForTests()['tp:done:' + store.accountTag(teacher)]; return m && Number(m.value) === ok.body.id && !m.expiresAt; })());

    console.log('\n6b) daily limit still bounds an account whose marker is missing');
    const dropMarker = () => kvMod.kv.del('tp:done:' + store.accountTag(teacher));
    await dropMarker(); await call({ key: teacher, body: proposal(), query: T });
    await dropMarker(); await call({ key: teacher, body: proposal(), query: T });
    await dropMarker();
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
    check('client talks only to the private endpoint (status check + send)', fetches.length === 2 && clientSrc.split("fetch('/api/feedback?kind=testimonial'").length === 3);
    check('client has no third-party/analytics calls', !/https?:\/\/[a-z]|gtag\(|google-analytics|sendBeacon|dataLayer|XMLHttpRequest|new Image\(/i.test(clientSrc.replace(/\/\/.*$/gm, '')));
    const pub = JSON.parse(fs.readFileSync(publicFile, 'utf8'));
    check('no proposal text reached the public file', !JSON.stringify(pub).includes('report writing time'));

    console.log('\n9) store outage never fakes success and allows retry');
    const retry = proposal();
    const other9 = await svc.getOrCreateFreeLicense('teacher.nine@example.com');
    kvMod.__simulateOutage(true);
    const down = await call({ key: other9, body: retry, query: T });
    kvMod.__simulateOutage(false);
    check('full outage -> 503, never 200', down.statusCode === 503);
    const realIncr = kvMod.kv.incr;
    kvMod.kv.incr = async () => { throw new Error('simulated mid-write failure'); };
    let mid;
    try{ mid = await call({ key: other9, body: retry, query: T }); }finally{ kvMod.kv.incr = realIncr; }
    check('mid-write failure -> 503, never 200', mid.statusCode === 503);
    const after = await call({ key: other9, body: retry, query: T });
    check('same proposal succeeds after recovery', after.statusCode === 200 && after.body.duplicate === false);

    // ---- hardening 2026-11-02: claims, races, stale recovery, command use ----
    kvMod.__resetForTests();
    const t3 = await svc.getOrCreateFreeLicense('teacher.three@example.com');
    const t4 = await svc.getOrCreateFreeLicense('teacher.four@example.com');
    const t5 = await svc.getOrCreateFreeLicense('teacher.five@example.com');
    const tag = store.accountTag;
    const idem = (key, id) => 'tp:idem:' + tag(key) + ':' + id;
    const dump = () => kvMod.__dumpForTests();
    const proposalCount = () => Object.keys(dump()).filter(k => k.startsWith('tp:item:')).length;
    const isOk = r => r.statusCode === 200 && r.body.status === 'received_private' && Number.isSafeInteger(r.body.id) && r.body.id > 0;

    console.log('\n10) a claim still in progress is a retryable 409, never 200 with a null id');
    const busyP = proposal();
    await kvMod.kv.set(idem(t3, busyP.proposalId), 'pending:' + 'ab'.repeat(12), { nx: true, ex: store.TESTIMONIAL_CLAIM_TTL_SECONDS });
    const busy = await call({ key: t3, body: busyP, query: T });
    check('in-progress claim -> 409 in_progress retryable', busy.statusCode === 409 && busy.body.status === 'in_progress' && busy.body.retryable === true);
    check('in-progress answer carries no id and no success status', busy.body.id === undefined && busy.body.status !== 'received_private');
    check('in-progress answer created no record', proposalCount() === 0);
    check('no 200/received_private with a null id anywhere in the handler', !/status\(200\)\.json\(\{\s*status:\s*'received_private',\s*id:\s*null/.test(fs.readFileSync(path.join(root, 'api/feedback.js'), 'utf8')));

    console.log('\n11) concurrent double submit stores exactly one record');
    const raceP = proposal();
    const [r1, r2] = await Promise.all([call({ key: t3, body: raceP, query: T }), call({ key: t3, body: raceP, query: T })]);
    const winners = [r1, r2].filter(isOk), losers = [r1, r2].filter(r => r.statusCode === 409);
    check('one request stores, the other is told to retry', winners.length === 1 && losers.length === 1 && losers[0].body.status === 'in_progress');
    check('exactly one record after the race', proposalCount() === 1);
    const raceRetry = await call({ key: t3, body: raceP, query: T });
    check('retry after the race returns the stored id as duplicate', isOk(raceRetry) && raceRetry.body.duplicate === true && raceRetry.body.id === winners[0].body.id);
    check('claim committed as stored:<id> with the 180-day expiry', dump()[idem(t3, raceP.proposalId)].value === 'stored:' + winners[0].body.id && dump()[idem(t3, raceP.proposalId)].expiresAt > Date.now() + 179 * 86400000);
    const many = await Promise.all(Array.from({ length: 5 }, () => call({ key: t4, body: { ...raceP }, query: T })));
    check('five parallel submits of one proposal: one 200, rest 409, one record', many.filter(isOk).length === 1 && many.filter(r => r.statusCode === 409).length === 4 && proposalCount() === 2);
    check('parallel duplicates consume only one daily slot', Number(dump()['tp:rate:' + tag(t4) + ':' + new Date().toISOString().slice(0, 10)].value) === 1);

    console.log('\n12) stale claim recovery');
    const staleP = proposal();
    await kvMod.kv.set(idem(t5, staleP.proposalId), 'pending:' + 'cd'.repeat(12), { nx: true, ex: store.TESTIMONIAL_CLAIM_TTL_SECONDS });
    check('pending claim expires within about a minute', dump()[idem(t5, staleP.proposalId)].expiresAt <= Date.now() + 61000);
    const realNow = Date.now;
    let recovered;
    try{ Date.now = () => realNow() + (store.TESTIMONIAL_CLAIM_TTL_SECONDS + 1) * 1000; recovered = await call({ key: t5, body: staleP, query: T }); }
    finally{ Date.now = realNow; }
    check('crashed worker claim recovers after its expiry', isOk(recovered) && recovered.body.duplicate === false);
    const legacyP = proposal();
    const t5b = await svc.getOrCreateFreeLicense('teacher.five.b@example.com');
    await kvMod.kv.set(idem(t5b, legacyP.proposalId), 'pending', { ex: 180 * 86400 });
    const legacy = await call({ key: t5b, body: legacyP, query: T });
    check('legacy tokenless pending (180-day) claim is taken over and stored', isOk(legacy) && legacy.body.duplicate === false);
    const legacyNum = proposal();
    const t5c = await svc.getOrCreateFreeLicense('teacher.five.c@example.com');
    await kvMod.kv.set(idem(t5c, legacyNum.proposalId), 7, { ex: 180 * 86400 });
    const legacyDup = await call({ key: t5c, body: legacyNum, query: T });
    check('legacy numeric stored claim still answers duplicate with its id', isOk(legacyDup) && legacyDup.body.duplicate === true && legacyDup.body.id === 7);

    console.log('\n13) a slow worker that lost its claim withdraws its copy and never deletes the new owner');
    kvMod.__resetForTests();
    const t6 = await svc.getOrCreateFreeLicense('teacher.six@example.com');
    const slowP = proposal();
    const realIncr2 = kvMod.kv.incr;
    const intruder = 'pending:' + 'ef'.repeat(12);
    kvMod.kv.incr = async key => {
      // While "we" are storing, our claim expires and another worker claims it.
      if(key === 'tp:seq') await kvMod.kv.set(idem(t6, slowP.proposalId), intruder, { ex: 60 });
      return realIncr2(key);
    };
    let slow;
    try{ slow = await call({ key: t6, body: slowP, query: T }); }finally{ kvMod.kv.incr = realIncr2; }
    check('lost claim -> 409 retryable, not 200', slow.statusCode === 409 && slow.body.retryable === true);
    check('the slow worker removed its own record', proposalCount() === 0);
    check('the newer claim is untouched', dump()[idem(t6, slowP.proposalId)].value === intruder);
    check('the daily slot was refunded', !dump()['tp:rate:' + tag(t6) + ':' + new Date().toISOString().slice(0, 10)]);
    const realSet = kvMod.kv.set;
    kvMod.kv.set = async (key, value, opts) => {
      if(String(key).startsWith('tp:item:')){
        await realSet.call(kvMod.kv, idem(t6, failP.proposalId), 'stored:999', { ex: 60 });
        throw new Error('simulated write failure');
      }
      return realSet.call(kvMod.kv, key, value, opts);
    };
    const failP = proposal();
    let failed;
    try{ failed = await call({ key: t6, body: failP, query: T }); }finally{ kvMod.kv.set = realSet; }
    check('write failure -> 503', failed.statusCode === 503);
    check('failure cleanup is token-guarded: it never deletes a committed claim', dump()[idem(t6, failP.proposalId)].value === 'stored:999');
    const quotaP = [proposal(), proposal(), proposal()];
    const quota = [];
    // Clear the one-story marker so the daily limiter itself is what is tested.
    for(const p of quotaP){ await kvMod.kv.del('tp:done:' + tag(t6)); quota.push(await call({ key: t6, body: p, query: T })); }
    check('failed attempts did not use up the daily limit', quota.every(isOk));

    console.log('\n14) owner listing is bounded and uses MGET, not one GET per proposal');
    kvMod.__resetForTests();
    for(let n = 1; n <= 260; n++) await kvMod.kv.set('tp:item:' + n, { id: n, status: 'received_private', publishable: false, story: 'Story ' + n }, { ex: 3600 });
    await kvMod.kv.set('tp:seq', 260);
    const counts = { get: 0, mget: 0, mgetKeys: 0 };
    const realGet = kvMod.kv.get, realMget = kvMod.kv.mget;
    kvMod.kv.get = async (...a) => { counts.get++; return realGet.apply(kvMod.kv, a); };
    kvMod.kv.mget = async (...keys) => { counts.mget++; counts.mgetKeys = Math.max(counts.mgetKeys, keys.length); return realMget.apply(kvMod.kv, keys); };
    const reset = () => { counts.get = 0; counts.mget = 0; counts.mgetKeys = 0; };
    let listed;
    try{
      listed = await store.listTestimonialProposals();
      check('default listing: 100 newest first', listed.length === 100 && listed[0].id === 260 && listed[99].id === 161);
      check('default listing costs 2 Redis commands (GET seq + one MGET)', counts.get === 1 && counts.mget === 1 && counts.mgetKeys <= 100);
      reset(); listed = await store.listTestimonialProposals({ limit: 200 });
      check('limit 200: 1 GET + 2 MGET of <= 100 keys', listed.length === 200 && counts.get === 1 && counts.mget === 2 && counts.mgetKeys <= 100);
      reset(); listed = await store.listTestimonialProposals({ limit: 100000 });
      check('limit is capped at 200', listed.length === 200 && counts.mget <= 3);
      for(const n of [255, 240, 200, 170]) await kvMod.kv.del('tp:item:' + n);
      reset(); listed = await store.listTestimonialProposals();
      check('gaps are stepped over and the window still fills', listed.length === 100 && !listed.some(i => [255, 240, 200, 170].includes(i.id)) && listed[99].id === 157);
      check('gap handling stays bounded (<= 3 commands)', counts.get + counts.mget <= 3);
      reset(); const owner2 = await call({ method: 'GET', key: 'owner_key_test' });
      check('owner GET returns proposals via the bounded reader', owner2.statusCode === 200 && owner2.body.testimonialProposals.length === 100);
      check('owner GET adds at most 2 MGETs for proposals', counts.mget <= 2);
      kvMod.kv.mget = undefined;
      reset(); listed = await store.listTestimonialProposals({ limit: 20 });
      check('compatibility fallback without MGET still lists correctly', listed.length === 20 && listed[0].id === 260);
    }finally{ kvMod.kv.get = realGet; kvMod.kv.mget = realMget; }
    check('older proposals outside the window are preserved, not deleted', !!(await kvMod.kv.get('tp:item:1')));
    await kvMod.kv.set('tp:seq', 'garbage');
    check('corrupt sequence lists nothing instead of throwing', (await store.listTestimonialProposals()).length === 0);

    console.log('\n15) privacy policy discloses testimonial proposals precisely');
    const policy = fs.readFileSync(path.join(root, 'privacy-policy.html'), 'utf8');
    const section = (policy.match(/<section class="section" id="testimonial-proposals">([\s\S]*?)<\/section>/) || [])[1] || '';
    const text = section.replace(/<[^>]+>/g, '');
    check('dedicated anchored section exists', section.length > 0);
    check('discloses account email read from account records', /email address of your signed-in Classbuster account/.test(text) && /reads from our account records/.test(text));
    check('discloses what is stored (story, name, context, one-way reference, feedback link)', /story text/.test(text) && /optional name and teaching context/.test(text) && /one-way account reference/.test(text) && /related feedback item/.test(text));
    check('discloses 180-day storage and owner-only visibility', /expires automatically 180 days/.test(text) && /visible only to the Classbuster owner/.test(text));
    check('discloses no Sheet/analytics/third-party/public use', /not forwarded to the Google Sheets workflow or any other third party/.test(text) && /not sent to analytics/.test(text) && /not added to the public testimonials page/.test(text));
    check('contact is optional and limited to asking', /only allows Classbuster to email your account address/.test(text) && /may never contact you/.test(text));
    check('publication only with separate exact-quote consent', /not permission to publish/.test(text) && /separate, explicit consent to the exact quoted wording/.test(text) && /withdraw/.test(text));
    check('section 2 lists the category and points to the section', /Optional feedback and private testimonial proposals/.test(policy) && /Section 7a/.test(policy));
    check('policy effective date updated', /Effective date: 2 November 2026/.test(policy));
    check('invite links to the anchored disclosure', clientSrc.includes("'/privacy-policy.html#testimonial-proposals'"));
  }finally{
    global.fetch = originalFetch;
    for(const [k, v] of Object.entries(saved)){ if(v === undefined) delete process.env[k]; else process.env[k] = v; }
    kvMod.__resetForTests();
  }
  return getFailures();
};
if(require.main === module) module.exports().then(f => { process.exitCode = f ? 1 : 0; });
