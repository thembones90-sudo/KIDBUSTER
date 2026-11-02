'use strict';
// Scout public release (owner approval 2026-11-02): the master account and
// active Pro accounts use Scout; Free and unknown keys do not; each teacher
// sees only their own lessons. RADAR_VAN_OWNER_SHA256 still gates the private
// master installer and fails closed. Exercised through the real
// feedback-function dispatch, session, ingest and download handlers on the
// in-memory KV. Synthetic keys only; no network.
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
    const FREE = 'kb_live_' + '1'.repeat(48), PRO = 'kb_live_' + '2'.repeat(48), PRO_B = 'kb_live_' + '3'.repeat(48);
    await lic.saveLicense(FREE, { plan: 'free', status: 'active' });
    for (const k of [PRO, PRO_B]) await lic.saveLicense(k, { plan: 'pro', status: 'active', source: 'subscription', subscriptionStatus: 'active' });

    const call = async (route, req) => {
      const res = { code: 200, headers: {}, body: null, setHeader(k, v){ this.headers[k.toLowerCase()] = v; }, status(c){ this.code = c; return this; }, json(b){ this.body = b; return this; } };
      await feedback({ method: 'GET', headers: {}, body: undefined, url: '/', socket: { remoteAddress: '203.0.113.7' }, ...req, query: { radar: route, ...(req.query || {}) } }, res);
      return res;
    };
    const session = (key, headers = {}) => call('session', { headers: { ...(key ? { 'x-app-key': key } : {}), ...headers } });
    const act = (key, action, extra = {}) => call('session', { method: 'POST', headers: { 'x-app-key': key, 'content-type': 'application/json' }, body: { action, ...extra } });
    const ingest = (token, n) => call('ingest', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: lesson(n) });
    const download = key => call('download', { headers: key ? { 'x-app-key': key } : {} });

    console.log('\n1) Who may use Scout');
    check('correct master account: session granted', (await session(MASTER)).code === 200);
    check('paid Pro account: session granted', (await session(PRO)).code === 200);
    check('lifetime founder account (full access, as for Krisp): granted', (await session(OTHER_FOUNDER)).code === 200);
    check('ordinary Free account: denied', (await session(FREE)).code === 403);
    check('unknown or malformed key: denied', (await session('kb_live_' + '9'.repeat(48))).code === 403 && (await session('kb_pro_scout')).code === 403);
    check('no key: denied', (await session(null)).code === 401);
    check('optimized version poll: Pro granted, Free denied', (await session(PRO, { 'x-radar-since': '0' })).code === 200 && (await session(FREE, { 'x-radar-since': '0' })).code === 403);
    for (const action of ['connect', 'enable-automatic', 'disconnect'])
      check('Free cannot ' + action, (await act(FREE, action)).code === 403);
    check('Free cannot claim/import', (await act(FREE, 'claim', { meetingId: 'rv:' + uuid(1) })).code === 403);

    console.log('\n1b) Each teacher sees only their own lessons');
    const tokA = (await act(PRO, 'connect')).body.token, tokB = (await act(PRO_B, 'connect')).body.token;
    check('two Pro teachers each mint their own device token', /^rv1_/.test(tokA || '') && /^rv1_/.test(tokB || '') && tokA !== tokB);
    check('teacher A delivers a lesson', (await ingest(tokA, 101)).code === 201);
    check('teacher B delivers a lesson', (await ingest(tokB, 102)).code === 201);
    const inbox = async k => ((await session(k)).body.pending || []).map(p => p.meetingId);
    const aIds = await inbox(PRO), bIds = await inbox(PRO_B), mIds = await inbox(MASTER);
    check('A sees only A\'s lesson', aIds.includes('rv:' + uuid(101)) && !aIds.includes('rv:' + uuid(102)));
    check('B sees only B\'s lesson', bIds.includes('rv:' + uuid(102)) && !bIds.includes('rv:' + uuid(101)));
    check('the master inbox sees neither teacher\'s lessons', !mIds.includes('rv:' + uuid(101)) && !mIds.includes('rv:' + uuid(102)));
    const stolen = await act(PRO_B, 'claim', { meetingId: 'rv:' + uuid(101) });
    check('B cannot claim A\'s lesson', !(stolen.code === 200 && stolen.body.claimed && String(stolen.body.claimed.transcript || '').includes('Hi there 101')));
    check('A\'s lesson is still waiting for A', (await inbox(PRO)).includes('rv:' + uuid(101)));
    const mine = await act(PRO, 'claim', { meetingId: 'rv:' + uuid(101) });
    check('A claims its own lesson', mine.code === 200 && mine.body.claimed && mine.body.claimed.transcript.includes('Hi there 101'));
    await lic.saveLicense(PRO_B, { plan: 'pro', status: 'active', source: 'subscription', subscriptionStatus: 'active', expiresAt: new Date(Date.now() - 1000).toISOString() });
    check('when B\'s subscription ends, B\'s device token stops delivering', (await ingest(tokB, 103)).code === 403);
    check('and B\'s session is refused', (await session(PRO_B)).code === 403);

    console.log('\n2) Private master installer: fingerprint fails closed');
    // No BLOB_STORE_ID in tests: an authorized master gets 503 (storage), a
    // refused caller gets 403 before storage is considered.
    check('Pro cannot mint the private installer link', (await download(PRO)).code === 403);
    check('lifetime founder cannot mint the private installer link', (await download(OTHER_FOUNDER)).code === 403);
    const withHash = async (value, label, expectMaster) => {
      if (value === undefined) delete process.env.RADAR_VAN_OWNER_SHA256; else process.env.RADAR_VAN_OWNER_SHA256 = value;
      const code = (await download(MASTER)).code;
      check(label + (expectMaster ? ': master passes the installer check' : ': master refused the private installer'),
        expectMaster ? code === 503 : code === 403);
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
    process.env.RADAR_VAN_OWNER_SHA256 = sha(PRO);
    check('a fingerprint never grants master status to a Pro key', (await download(PRO)).code === 403);
    process.env.RADAR_VAN_OWNER_SHA256 = sha(MASTER);

    console.log('\n3) Feature flag');
    for (const flag of [undefined, 'false', 'TRUE', '1']) {
      if (flag === undefined) delete process.env.RADAR_VAN_ENABLED; else process.env.RADAR_VAN_ENABLED = flag;
      check('flag ' + JSON.stringify(flag) + ': Scout disabled for master and Pro (404)', (await session(MASTER)).code === 404 && (await session(PRO)).code === 404);
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
