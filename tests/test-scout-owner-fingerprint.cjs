'use strict';
// Scout master-only pilot: RADAR_VAN_OWNER_SHA256 is mandatory and fails closed.
// Exercised through the real feedback-function dispatch, session and ingest
// handlers on the in-memory KV. Synthetic keys only; no network.
const crypto = require('node:crypto');
const { createChecker } = require('./helpers/assert.cjs');

const MASTER = 'scout-master-synthetic';
const OTHER_FOUNDER = 'scout-other-founder-synthetic';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const lesson = n => ({ version: 1, lessonId: uuid(n), title: 'Synthetic lesson ' + n, startedAt: '2026-10-22T09:00:00Z', durationSeconds: 1500,
  transcript: '[00:00] TEACHER: Hello\n[00:02] STUDENT: Hi there ' + n });

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-scout-owner-fingerprint.cjs ===');
  const names = ['KIDBUSTER_TEST_KV', 'OWNER_LICENSE_KEYS', 'FOUNDER_LICENSE_KEYS', 'RADAR_VAN_ENABLED', 'RADAR_VAN_OWNER_SHA256'];
  const saved = Object.fromEntries(names.map(n => [n, process.env[n]]));
  process.env.KIDBUSTER_TEST_KV = '1';
  process.env.OWNER_LICENSE_KEYS = MASTER;
  process.env.FOUNDER_LICENSE_KEYS = OTHER_FOUNDER;
  process.env.RADAR_VAN_ENABLED = 'true';
  process.env.RADAR_VAN_OWNER_SHA256 = sha(MASTER);
  try {
    const kvMod = await import('../api/_lib/kv-client.js');
    kvMod.__resetForTests();
    const lic = await import('../api/_lib/licensing.js');
    const feedback = (await import('../api/feedback.js')).default;
    await lic.saveLicense('kb_free_scout', { plan: 'free', status: 'active' });
    await lic.saveLicense('kb_pro_scout', { plan: 'pro', status: 'active', source: 'subscription', subscriptionStatus: 'active' });

    const call = async (route, req) => {
      const res = { code: 200, headers: {}, body: null, setHeader(k, v){ this.headers[k.toLowerCase()] = v; }, status(c){ this.code = c; return this; }, json(b){ this.body = b; return this; } };
      await feedback({ method: 'GET', headers: {}, body: undefined, url: '/', socket: { remoteAddress: '203.0.113.7' }, ...req, query: { radar: route, ...(req.query || {}) } }, res);
      return res;
    };
    const session = (key, headers = {}) => call('session', { headers: { ...(key ? { 'x-app-key': key } : {}), ...headers } });
    const act = (key, action, extra = {}) => call('session', { method: 'POST', headers: { 'x-app-key': key, 'content-type': 'application/json' }, body: { action, ...extra } });
    const ingest = (token, n) => call('ingest', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: lesson(n) });

    console.log('\n1) Who may use Scout');
    check('correct master account: session granted', (await session(MASTER)).code === 200);
    check('ordinary Free account: denied', (await session('kb_free_scout')).code === 403);
    check('ordinary paid Pro account: denied', (await session('kb_pro_scout')).code === 403);
    check('another founder/master account: denied', (await session(OTHER_FOUNDER)).code === 403);
    check('no key: denied', (await session(null)).code === 401);
    for (const key of ['kb_free_scout', 'kb_pro_scout', OTHER_FOUNDER])
      check('optimized version poll denied for ' + key, (await session(key, { 'x-radar-since': '0' })).code === 403);
    for (const action of ['connect', 'enable-automatic', 'disconnect'])
      check('paid Pro cannot ' + action, (await act('kb_pro_scout', action)).code === 403);
    check('paid Pro cannot claim/import', (await act('kb_pro_scout', 'claim', { meetingId: 'rv:' + uuid(1) })).code === 403);

    console.log('\n2) Fingerprint configuration fails closed');
    const withHash = async (value, label, expectMaster) => {
      if (value === undefined) delete process.env.RADAR_VAN_OWNER_SHA256; else process.env.RADAR_VAN_OWNER_SHA256 = value;
      const master = (await session(MASTER)).code, poll = (await session(MASTER, { 'x-radar-since': '0' })).code;
      check(label + (expectMaster ? ': master granted' : ': master denied (session and poll)'),
        expectMaster ? master === 200 : master === 403 && poll === 403);
    };
    await withHash(undefined, 'missing fingerprint', false);
    await withHash('', 'empty fingerprint', false);
    await withHash('   ', 'whitespace fingerprint', false);
    await withHash('not-a-hash', 'malformed fingerprint', false);
    await withHash(sha(MASTER).slice(0, 63), 'truncated fingerprint', false);
    await withHash(sha(MASTER) + ',', 'trailing empty entry', false);
    await withHash(sha(MASTER) + ',zz', 'one malformed entry poisons the list', false);
    await withHash(sha('kb_pro_scout'), 'fingerprint of a non-master key', false);
    await withHash(sha(MASTER).toUpperCase(), 'same fingerprint in upper case', true);
    process.env.RADAR_VAN_OWNER_SHA256 = sha('kb_pro_scout');
    check('a fingerprint never grants master status to a Pro key', (await session('kb_pro_scout')).code === 403);
    process.env.RADAR_VAN_OWNER_SHA256 = sha(MASTER);

    console.log('\n3) Feature flag');
    for (const flag of [undefined, 'false', 'TRUE', '1']) {
      if (flag === undefined) delete process.env.RADAR_VAN_ENABLED; else process.env.RADAR_VAN_ENABLED = flag;
      check('flag ' + JSON.stringify(flag) + ': Scout disabled even for the master (404)', (await session(MASTER)).code === 404);
    }
    process.env.RADAR_VAN_ENABLED = 'true';

    console.log('\n4) Device tokens');
    const connected = await act(MASTER, 'connect');
    const token = connected.body && connected.body.token;
    check('master can mint a device token', connected.code === 200 && /^rv1_/.test(token || ''));
    check('master device delivers a lesson', (await ingest(token, 1)).code === 201);
    check('duplicate delivery is acknowledged, not stored twice', (await ingest(token, 1)).code === 200);
    check('invalid token denied', (await ingest('rv1_' + 'A'.repeat(43), 2)).code === 401);
    check('malformed bearer denied', (await call('ingest', { method: 'POST', headers: { authorization: 'Bearer nope', 'content-type': 'application/json' }, body: lesson(3) })).code === 401);
    process.env.RADAR_VAN_OWNER_SHA256 = sha(OTHER_FOUNDER);
    check('master token stops working the moment the fingerprint no longer matches', (await ingest(token, 4)).code === 403);
    process.env.RADAR_VAN_OWNER_SHA256 = sha(MASTER);
    const rotated = (await act(MASTER, 'connect')).body.token;
    check('rotated-out token denied', (await ingest(token, 5)).code === 401);
    check('new token works', (await ingest(rotated, 6)).code === 201);

    console.log('\n5) Master workflow: inbox, import, automatic');
    const view = (await session(MASTER)).body;
    const ids = (view.pending || []).map(p => p.meetingId);
    check('delivered lessons wait in the master inbox', ids.includes('rv:' + uuid(1)) && ids.includes('rv:' + uuid(6)));
    const claimed = await act(MASTER, 'claim', { meetingId: 'rv:' + uuid(1) });
    check('master can claim a lesson for import', claimed.code === 200 && claimed.body.claimed && claimed.body.claimed.transcript.includes('Hi there 1'));
    check('import acknowledgement removes it from the inbox', (await act(MASTER, 'ack-matched', { meetingId: 'rv:' + uuid(1) })).code === 200 &&
      !((await session(MASTER)).body.pending || []).some(p => p.meetingId === 'rv:' + uuid(1)));
    check('master can enable automatic import', (await act(MASTER, 'enable-automatic')).code === 200);
    check('master can disconnect (token revoked)', (await act(MASTER, 'disconnect')).code === 200);
    check('revoked token denied', (await ingest(rotated, 7)).code === 401);
    check('lesson waiting in the inbox survives disconnect', ((await session(MASTER)).body.pending || []).some(p => p.meetingId === 'rv:' + uuid(6)));
  } catch (err) {
    console.log('  FAIL  unexpected exception: ' + (err && err.stack || err));
    check('suite completed without exception', false);
  } finally {
    for (const n of names) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
  }
  return getFailures();
};
if (require.main === module) module.exports().then(n => process.exit(n ? 1 : 0)).catch(e => { console.error(e); process.exit(1); });
