'use strict';
// Real-browser RADAR VAN test. The real index.html runs against the REAL
// backend handlers (feedback.js dispatcher -> radar-van-*-handler.js) on the
// in-memory KV, reached through the same path rewrites vercel.json declares.
// Synthetic data only: no network, no real KV, no credentials.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createChecker } = require('./helpers/assert.cjs');

process.env.KIDBUSTER_TEST_KV = '1';
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const lesson = (n, extra = {}) => ({ version: 1, lessonId: uuid(n), title: 'Browser lesson ' + n, startedAt: '2026-10-17T14:00:00Z', durationSeconds: 900,
  transcript: '[00:00] TEACHER: Hello from lesson ' + n + '\n\n[00:02] STUDENT: Hi there', ...extra });

function loadPuppeteer(){
  try {
    const puppeteer = require('puppeteer');
    const win = process.platform === 'win32' ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p)) : null;
    return { puppeteer, launchOptions: win ? { executablePath: win } : {} };
  } catch (e) {
    const fallback = '/usr/local/lib/node_modules_global/@mermaid-js/mermaid-cli/node_modules/puppeteer';
    const puppeteer = require(fallback);
    const exe = process.env.PUPPETEER_EXECUTABLE_PATH;
    return { puppeteer, launchOptions: exe ? { executablePath: exe } : {} };
  }
}

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-radar-van-browser.cjs ===');
  let puppeteer, launchOptions;
  try { ({ puppeteer, launchOptions } = loadPuppeteer()); }
  catch (e) { console.log('  SKIPPED - no puppeteer/Chrome here (' + e.message + ')'); return 0; }

  const prior = { flag: process.env.RADAR_VAN_ENABLED, owner: process.env.OWNER_LICENSE_KEYS };
  process.env.RADAR_VAN_ENABLED = 'true';
  // Synthetic owner identities only; ordinary Free/Pro access is tested as denied.
  process.env.OWNER_LICENSE_KEYS = 'kb_free_browser,kb_free_ack_a,kb_free_ack_b';
  const kvMod = await import('../api/_lib/kv-client.js');
  kvMod.__resetForTests();
  const lic = await import('../api/_lib/licensing.js');
  const rv = await import('../api/_lib/radar-van.js');
  const feedback = (await import('../api/feedback.js')).default;
  const krispSession = (await import('../api/krisp-session.js')).default;
  const KEY = 'kb_free_browser';
  await lic.saveLicense(KEY, { plan: 'free', status: 'active' });

  const hits = { generate: 0, krisp: 0, krispMutations: 0 };
  async function callHandler(handler, req, res, query, bodyText){
    let body;
    if (bodyText && String(req.headers['content-type'] || '').startsWith('application/json')) { try { body = JSON.parse(bodyText); } catch (e) { body = bodyText; } }
    else body = bodyText || undefined;
    const out = { code: 200, headers: {}, json(b){ res.writeHead(this.code, { 'content-type': 'application/json', ...this.headers }); res.end(JSON.stringify(b)); return this; },
      status(c){ this.code = c; return this; }, setHeader(k, v){ this.headers[k] = v; } };
    await handler({ method: req.method, headers: req.headers, query, body, url: req.url, socket: req.socket }, out);
  }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let chunks = '';
    req.on('data', c => chunks += c);
    req.on('end', async () => {
      try {
        // vercel.json rewrites: /api/radar-van-X -> /api/feedback?radar=X (destination parameter wins)
        const rewrite = { '/api/radar-van-ingest': 'ingest', '/api/radar-van-session': 'session' }[url.pathname];
        if (rewrite) return callHandler(feedback, req, res, { ...Object.fromEntries(url.searchParams), radar: rewrite }, chunks);
        if (url.pathname === '/api/krisp-session') { hits.krisp++; if(req.method==='POST')hits.krispMutations++; return callHandler(krispSession, req, res, {}, chunks); }
        if (url.pathname === '/api/generate') { hits.generate++; res.writeHead(500); return res.end('{}'); }
        if (url.pathname === '/api/license-status') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"plan":"free","status":"active","usageCount":0,"remainingFreeReports":5}'); }
        if (url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }
        const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
        const file = path.join(ROOT, rel);
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
      } catch (e) { res.writeHead(500); res.end('{}'); }
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], ...launchOptions });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pageErrors = [];

  // "Desktop app" side: bearer-authenticated ingest and an account-key status read.
  const ingest = (token, body) => fetch(base + '/api/radar-van-ingest', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ code: r.status, body: await r.json() }));
  const status = () => fetch(base + '/api/radar-van-session', { headers: { 'x-app-key': KEY } }).then(async r => ({ code: r.status, body: await r.json() }));
  async function fallbackPending(n){
    const matched = await kvMod.kv.get(rv.radarKeys.matched(KEY)) || [];
    const record = matched.find(r => r.lessonId === uuid(n));
    if(!record) throw new Error('Synthetic fallback record missing');
    await kvMod.kv.set(rv.radarKeys.matched(KEY), matched.filter(r=>r!==record), {ex:86400});
    const pending = await kvMod.kv.get(rv.radarKeys.pending(KEY)) || [];
    // Exhausted automatic retries remain manually recoverable in the inbox.
    await kvMod.kv.set(rv.radarKeys.pending(KEY), [...pending,{...record,claimCount:10}],{ex:86400});
  }

  async function open(opts = {}){
    const page = await browser.newPage();
    await page.setViewport(opts.viewport || { width: 1280, height: 900 });
    page.on('pageerror', e => pageErrors.push(e.message)); page.on('console', m => { if (/^GEOM/.test(m.text())) console.log('  ' + m.text()); });
    page.dialogs = [];
    page.on('dialog', d => { page.dialogs.push(d.message()); d.accept(); });
    page.radarBodies = [];
    page.on('response', async r => { if (r.url().includes('/api/radar-van-session')) { try { page.radarBodies.push(await r.text()); } catch (e) { /* navigation */ } } });
    const key = opts.key === undefined ? KEY : opts.key;
    if (opts.clearDraft) await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('kidbuster_draft_v1'); } catch (e) { /* ignore */ } });
    if (opts.breakReceipts) await page.evaluateOnNewDocument(() => { localStorage.removeItem('kidbuster_draft_v1'); const real = Storage.prototype; const gs = real.getItem, ss = real.setItem; real.getItem = function(k){ if (k === 'radarvan_ack_receipts_v1') throw new Error('blocked'); return gs.call(this, k); }; real.setItem = function(k, v){ if (k === 'radarvan_ack_receipts_v1') throw new Error('blocked'); return ss.call(this, k, v); }; });
    await page.evaluateOnNewDocument(k => { try { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); if (k) localStorage.setItem('kidbuster_access_key', k); else localStorage.removeItem('kidbuster_access_key'); } catch (e) { /* ignore */ } }, key);
    await page.goto(base + '/', { waitUntil: 'load' });
    await sleep(400);
    return page;
  }
  const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && r.width > 0 && r.height > 0; }, id);
  const openAccount = async page => { if (!(await page.evaluate(() => getComputedStyle(document.getElementById('accountPanel')).display !== 'none'))) await page.click('#accountBtn'); };
  const wait = (page, fn, arg, timeout = 9000) => page.waitForFunction(fn, { timeout }, arg).then(() => true, () => false);
  const text = (page, id) => page.evaluate(i => (document.getElementById(i) || {}).textContent || '', id);
  const notes = page => page.evaluate(() => document.getElementById('krispNotes').value);
  const poke = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const setNotes = (page, v) => page.evaluate(val => { const n = document.getElementById('krispNotes'); n.value = val; n.dispatchEvent(new Event('input', { bubbles: true })); }, v);

  try {
    // ---- feature disabled ----
    console.log('\n1) Feature gate and sign-in');
    process.env.RADAR_VAN_ENABLED = 'false';
    let page = await open();
    await openAccount(page); await sleep(500);
    check('feature OFF: RADAR VAN section stays hidden', !(await visible(page, 'radarVanSection')));
    check('feature OFF: no RADAR VAN header button exists any more', await page.evaluate(() => !document.getElementById('radarVanBtn')));
    await page.close();
    process.env.RADAR_VAN_ENABLED = 'true';

    page = await open({ key: '' });
    await sleep(300);
    check('no access key: section hidden', !(await visible(page, 'radarVanSection')));
    await page.evaluate(k => { localStorage.setItem('kidbuster_access_key', k); document.dispatchEvent(new CustomEvent('kidbuster:access-key-saved')); }, KEY);
    check('post-load sign-in reveals RADAR VAN for a Free account without reload', await wait(page, () => !document.getElementById('radarVanSection').hidden));
    check('section lives inside the account popover', await page.evaluate(() => !!document.querySelector('#accountPanel #radarVanSection')));
    check('labelled region, status live region and labelled list (ARIA)', await page.evaluate(() => {
      const s = document.getElementById('radarVanSection');
      const lab = document.getElementById(s.getAttribute('aria-labelledby'));
      const st = document.getElementById('radarVanStatus');
      return !!lab && st.getAttribute('role') === 'status' && st.getAttribute('aria-live') === 'polite' &&
        !document.getElementById('radarVanArmBtn') &&
        !!document.getElementById(document.getElementById('radarVanList').getAttribute('aria-labelledby')) &&
        document.getElementById('radarVanTokenBox').getAttribute('role') === 'group';
    }));
    check('Scout startup never changes Krisp ARM', hits.krispMutations === 0);
    check('Scout has no ARM control', await page.evaluate(() => !document.getElementById('radarVanArmBtn')));

    // ---- connect: token shown once ----
    console.log('\n2) Token shown once, copy errors handled, no leak');
    await openAccount(page);
    await page.click('#radarVanConnectBtn');
    check('token box becomes visible', await wait(page, () => !document.getElementById('radarVanTokenBox').hidden));
    const token = await page.evaluate(() => document.getElementById('radarVanTokenField').value);
    check('token is an rv1_ device credential, visibly displayed in a field (not clipboard-only)', /^rv1_[A-Za-z0-9_-]{43}$/.test(token) && await visible(page, 'radarVanTokenField'));
    check('one-time warning is on screen', /only once/i.test(await text(page, 'radarVanTokenTitle')) && /cannot be shown again/i.test(await text(page, 'radarVanTokenWarning')));
    check('after connect the UI shows automatic import', await page.evaluate(() => document.getElementById('radarVanState').dataset.state === 'connected' && /automatic/.test(document.getElementById('radarVanState').textContent)));
    await page.evaluate(() => { document.execCommand = () => false; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
    await page.click('#radarVanCopyBtn');
    await sleep(200);
    check('clipboard failure is handled with manual-copy guidance (token stays selectable)', /blocked copying/i.test(await text(page, 'radarVanStatus')) && await page.evaluate(() => { const f = document.getElementById('radarVanTokenField'); return f.selectionStart === 0 && f.selectionEnd === f.value.length; }));
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: v => { window.__copied = v; return Promise.resolve(); } } }); });
    await page.click('#radarVanCopyBtn'); await sleep(200);
    check('clipboard success copies exactly the token', (await page.evaluate(() => window.__copied)) === token && /copied/i.test(await text(page, 'radarVanStatus')));
    check('only the connect response itself carried the token', page.radarBodies.filter(b => b.includes(token)).length === 1);
    page.radarBodies.length = 0;
    check('token never reached localStorage / sessionStorage', await page.evaluate(t => !JSON.stringify(localStorage).includes(t) && !JSON.stringify(sessionStorage).includes(t), token));
    await page.reload({ waitUntil: 'load' }); await sleep(600); await openAccount(page);
    check('after reload the token is gone from the page and the UI is connected', await page.evaluate(t => document.getElementById('radarVanTokenBox').hidden && !document.documentElement.innerHTML.includes(t) && document.getElementById('radarVanTokenField').value === '', token));
    check('status responses never contained the token', page.radarBodies.every(b => !b.includes(token)));
    check('reload shows connected state with a replace option', await page.evaluate(() => document.getElementById('radarVanState').dataset.state === 'connected' && /replace/i.test(document.getElementById('radarVanConnectBtn').textContent)));

    // ---- ARM persists ----
    console.log('\n3) ARM persistence and matched auto-apply');
    check('automatic import is on without ARM', (await status()).body.automatic === true);
    await page.reload({ waitUntil: 'load' }); await sleep(600); await openAccount(page);
    check('automatic import persisted across reload', await page.evaluate(() => !document.getElementById('radarVanArmBtn') && /automatic/.test(document.getElementById('radarVanState').textContent)));
    check('automatic Scout never mutates Krisp settings', hits.krispMutations === 0);

    await page.evaluate(() => { window.__inputs = 0; document.getElementById('krispNotes').addEventListener('input', () => window.__inputs++); });
    const m1 = await ingest(token, lesson(1));
    check('armed ingest is matched (201)', m1.code === 201 && m1.body.matched === true);
    await poke(page);
    check('matched lesson is applied into the EMPTY notes automatically', await wait(page, () => document.getElementById('krispNotes').value.includes('Hello from lesson 1')));
    check('an input event was dispatched for the import', (await page.evaluate(() => window.__inputs)) >= 1);
    await sleep(500);
    check('ACK followed the successful import: server matched queue is empty', (await status()).body.matchedCount === 0);
    const dupAfterAck = await ingest(token, lesson(1));
    check('desktop retry after the ACK is a duplicate and creates nothing', dupAfterAck.code === 200 && dupAfterAck.body.duplicate === true && (await status()).body.matchedCount === 0 && (await status()).body.pendingCount === 0);
    check('import never triggered report generation', hits.generate === 0);

    // ---- occupied notes: never overridden ----
    console.log('\n4) Occupied workspace is never overwritten');
    check('armed ingest while notes are occupied', (await ingest(token, lesson(2))).body.matched === true);
    await poke(page); await sleep(900);
    check('occupied notes were preserved (lesson 1 stays, lesson 2 not applied)', (await notes(page)).includes('Hello from lesson 1') && !(await notes(page)).includes('lesson 2'));
    check('matched lesson is still safely on the server (not acknowledged)', (await status()).body.matchedCount === 1);
    check('armed waiting copy promises automatic import, not a paused state', await page.evaluate(() => /imports automatically/.test(document.getElementById('radarVanWaiting').textContent) && !/paused/.test(document.getElementById('radarVanWaiting').textContent)));
    check('UI tells the user a lesson is waiting', await page.evaluate(() => !document.getElementById('radarVanWaiting').hidden && /waiting/.test(document.getElementById('radarVanWaiting').textContent)));
    await setNotes(page, '');
    check('once notes are empty the waiting lesson imports by itself', await wait(page, () => document.getElementById('krispNotes').value.includes('Hello from lesson 2'), undefined, 12000));
    await sleep(500);
    check('...and is acknowledged', (await status()).body.matchedCount === 0);

    // ---- pending claim / dismiss ----
    console.log('\n5) Pending claim and dismiss');
    await setNotes(page, 'my own draft');
    const evil = '<img src=x onerror="window.__pwn=1">';
    check('automatic ingest accepted', (await ingest(token, lesson(3, { title: evil }))).body.matched === true);
    await fallbackPending(3);
    await poke(page);
    check('pending lesson appears with Claim and Dismiss', await wait(page, () => document.querySelectorAll('#radarVanList .radar-van-item').length === 1 && !!document.querySelector('.radar-van-claim') && !!document.querySelector('.radar-van-dismiss')));
    check('titles render as text (no HTML injection) and source is labelled Scout', await page.evaluate(() => !window.__pwn && !document.querySelector('#radarVanList img') && document.querySelector('.radar-van-item-title').textContent.includes('<img') && /Scout|RADAR VAN/.test(document.querySelector('.radar-van-item-meta').textContent)));
    check('pending count is shown and the account button is flagged', (await text(page, 'radarVanCount')) === '1' && (await page.evaluate(() => document.getElementById('accountBtn').getAttribute('data-radar-pending'))) === '1');
    await setNotes(page, 'my own draft');
    await page.click('.radar-van-claim'); await sleep(500);
    check('claim with occupied notes does nothing destructive', (await notes(page)) === 'my own draft' && /nothing was imported or overwritten/i.test(await text(page, 'radarVanStatus')));
    check('...and the lesson is still pending on the server', (await status()).body.pendingCount === 1);
    await setNotes(page, '');
    await page.click('.radar-van-claim');
    check('claim into empty notes imports the full transcript', await wait(page, () => document.getElementById('krispNotes').value.includes('Hello from lesson 3') && document.getElementById('krispNotes').value.includes('Hi there')));
    await sleep(500);
    const afterClaim = await status();
    check('claimed + acknowledged: gone from pending and matched, list is empty', afterClaim.body.pendingCount === 0 && afterClaim.body.matchedCount === 0 && (await kvMod.kv.get(rv.radarKeys.pending(KEY))) === null && await page.evaluate(() => document.querySelectorAll('#radarVanList .radar-van-item').length === 0));
    check('retry after claim+ACK is a duplicate (not recreated)', (await ingest(token, lesson(3))).body.duplicate === true && (await status()).body.pendingCount === 0);
    check('still no report generation', hits.generate === 0);
    await setNotes(page, 'my own draft');
    await ingest(token, lesson(4));
    await fallbackPending(4);
    await poke(page);
    await wait(page, () => document.querySelectorAll('.radar-van-dismiss').length === 1);
    await page.click('.radar-van-dismiss');
    check('dismiss removes the lesson (after confirmation)', await wait(page, () => document.querySelectorAll('#radarVanList .radar-van-item').length === 0) && page.dialogs.some(d => /Dismiss/.test(d)) && (await status()).body.pendingCount === 0);
    check('retry after dismiss is a duplicate', (await ingest(token, lesson(4))).body.duplicate === true && (await status()).body.pendingCount === 0);

    // ---- disconnect ----
    console.log('\n6) Disconnect revokes server-side');
    await ingest(token, lesson(5));
    page.dialogs.length = 0;
    await page.click('#radarVanDisconnectBtn');
    check('disconnect state shown', await wait(page, () => document.getElementById('radarVanState').dataset.state === 'off'));
    check('confirmation warns that the server credential is revoked and desktop-only clearing is not enough', page.dialogs.some(d => /revokes the device token on our server/.test(d) && /does not revoke/.test(d)));
    check('status text says the token was revoked on the server', /revoked on the server/i.test(await text(page, 'radarVanStatus')));
    check('old token now fails (401)', (await ingest(token, lesson(6))).code === 401);
    check('queued lessons survive the disconnect', (await status()).body.waitingCount === 1 && (await status()).body.automatic === false);
    check('ARM remains absent after disconnect', await page.evaluate(() => !document.getElementById('radarVanArmBtn')));
    check('no uncaught page errors', pageErrors.length === 0);
    await page.close();

    // ---- lost ACK / reload resilience ----
    console.log('\n8) Durable ACK receipt: lost ACK, reload, accounts, storage');
    const KEY_A = 'kb_free_ack_a', KEY_B = 'kb_free_ack_b';
    await lic.saveLicense(KEY_A, { plan: 'free', status: 'active' });
    await lic.saveLicense(KEY_B, { plan: 'free', status: 'active' });
    const RECEIPTS = 'radarvan_ack_receipts_v1';
    const control = async (p, init) => {
      p.ctl = { blockAck: false, hold: false, held: [] }; p.reqs = [];
      await p.setRequestInterception(true);
      p.on('request', rq => {
        const u = rq.url();
        if (u.includes('/api/radar-van-session')) {
          p.reqs.push({ method: rq.method(), key: rq.headers()['x-app-key'], body: rq.postData() || '' });
          if (rq.method() === 'POST' && (rq.postData() || '').includes('ack-matched') && p.ctl.blockAck) return rq.abort();
          if (rq.method() === 'GET' && p.ctl.hold) { p.ctl.held.push(rq); return; }
        }
        rq.continue();
      });
    };
    const setup = async (key, clearDraft) => {
      const p = await open({ key, clearDraft }); await control(p);
      await openAccount(p); await p.click('#radarVanConnectBtn');
      await wait(p, () => !document.getElementById('radarVanTokenBox').hidden);
      const tok = await p.evaluate(() => document.getElementById('radarVanTokenField').value);
      await wait(p, () => /automatic/.test(document.getElementById('radarVanState').textContent));
      return { p, tok };
    };
    const receiptRaw = p => p.evaluate(k => localStorage.getItem(k), RECEIPTS);
    const mid = n => 'rv:' + uuid(n);
    const mq = id => kvMod.kv.get(rv.radarKeys.matched(id));
    const importedLocally = (p, n) => p.evaluate(t => document.getElementById('krispNotes').value.includes(t), 'Hello from lesson ' + n);

    const A = await setup(KEY_A, true);
    A.p.ctl.blockAck = true;
    await ingest(A.tok, lesson(11));
    await poke(A.p);
    check('lost ACK: lesson imported into the notes', await wait(A.p, () => document.getElementById('krispNotes').value.includes('Hello from lesson 11')));
    await sleep(8500);
    check('lost ACK: all three ACK attempts failed, server still holds the matched record', (await mq(KEY_A)).length === 1);
    const raw1 = await receiptRaw(A.p);
    check('receipt written for the imported meetingId', !!raw1 && raw1.includes(mid(11)));
    check('receipt holds no transcript, device token or access key', !raw1.includes('Hello from lesson') && !raw1.includes('TEACHER') && !raw1.includes(A.tok) && !raw1.includes(KEY_A));
    check('device token still never in any storage', await A.p.evaluate(t => !JSON.stringify(localStorage).includes(t) && !JSON.stringify(sessionStorage).includes(t), A.tok));

    const aReqs1 = A.p.reqs; await A.p.close(); // one signed-in account per browser profile: A's receipt stays in localStorage
    // Account B in the same browser profile: same meetingId, must import for B and never touch A's receipt or queue.
    const B = await setup(KEY_B, true);
    await ingest(B.tok, lesson(11));
    await poke(B.p);
    check('account B imports the same-numbered lesson (A\'s receipt does not suppress it)', await wait(B.p, () => document.getElementById('krispNotes').value.includes('Hello from lesson 11')));
    let bQueue; for (let i = 0; i < 40; i++) { await sleep(250); bQueue = await kvMod.kv.get(rv.radarKeys.matched(KEY_B)); if (!bQueue || !bQueue.length) break; }
    check('account B was acknowledged on its own queue', !bQueue || bQueue.length === 0);
    check('account A queue and receipt untouched by B', (await mq(KEY_A)).length === 1 && JSON.parse(await receiptRaw(B.p) || 'null') && Object.keys(JSON.parse(await receiptRaw(B.p)).a).length === 1);
    check('B never sent a request with A\'s key, and A\'s lesson ack never used B\'s key', B.p.reqs.every(r => r.key === KEY_B) && aReqs1.every(r => r.key === KEY_A));
    await B.p.close();

    // Back to A in a fresh tab: reload with already-imported (occupied) notes, ACK now allowed.
    A.p = await open({ key: KEY_A }); await control(A.p);
    A.p.ctl.blockAck = false; A.p.ctl.hold = true;
    await A.p.reload({ waitUntil: 'domcontentloaded' });
    check('reload: poll issued', await (async () => { for (let i = 0; i < 40 && !A.p.ctl.held.length; i++) await sleep(100); return A.p.ctl.held.length > 0; })());
    await setNotes(A.p, 'already imported notes');
    A.p.ctl.hold = false; for (const h of A.p.ctl.held.splice(0)) h.continue();
    let acked = false; for (let i = 0; i < 60 && !acked; i++) { await sleep(250); acked = !(await mq(KEY_A)); }
    check('reload with occupied notes: server eventually acknowledged (no new lease needed)', acked);
    check('reload with occupied notes: notes untouched, receipt cleared on ACK', (await notes(A.p)) === 'already imported notes' && (await receiptRaw(A.p)) === null);

    // Reload with EMPTY notes while the server re-offers the lesson: ACK only, never re-apply.
    A.p.ctl.blockAck = true;
    await ingest(A.tok, lesson(12));
    await setNotes(A.p, '');
    await poke(A.p);
    check('second lost ACK: lesson 12 imported once', await wait(A.p, () => document.getElementById('krispNotes').value.includes('Hello from lesson 12')));
    await sleep(8500);
    const q = await mq(KEY_A); q.forEach(x => { x.leasedUntil = 0; }); await kvMod.kv.set(rv.radarKeys.matched(KEY_A), q, { ex: 86400 });
    A.p.radarBodies.length = 0; A.p.ctl.hold = false;
    await A.p.evaluate(() => localStorage.removeItem('kidbuster_draft_v1')); // the app restores notes from its draft after a reload
    await A.p.reload({ waitUntil: 'load' });
    check('reload: notes start empty', (await notes(A.p)) === '');
    check('reload: server re-offered the full transcript', await (async () => { for (let i = 0; i < 40; i++) { if (A.p.radarBodies.some(b => b.includes('Hello from lesson 12'))) return true; await sleep(200); } return false; })());
    await sleep(800);
    check('re-offered lesson was NOT applied a second time (notes still empty)', (await notes(A.p)) === '');
    check('...its ACK was attempted', A.p.reqs.some(r => r.method === 'POST' && r.body.includes(mid(12))));
    A.p.ctl.blockAck = false;
    let acked2 = false; for (let i = 0; i < 160 && !acked2; i++) { await sleep(250); acked2 = !(await mq(KEY_A)); }
    check('eventual server ACK once the network recovers; receipt cleared; notes still empty', acked2 && (await receiptRaw(A.p)) === null && (await notes(A.p)) === '');

    // Mid-fetch occupancy: notes become occupied while the lease request is in flight.
    A.p.ctl.hold = true;
    await ingest(A.tok, lesson(13));
    await A.p.reload({ waitUntil: 'domcontentloaded' });
    for (let i = 0; i < 40 && !A.p.ctl.held.length; i++) await sleep(100);
    await setNotes(A.p, 'late draft typed during fetch');
    A.p.ctl.hold = false; for (const h of A.p.ctl.held.splice(0)) h.continue();
    await sleep(1200);
    check('mid-fetch: draft typed while the request was in flight is NOT overwritten', (await notes(A.p)) === 'late draft typed during fetch');
    check('mid-fetch: no receipt and no ACK for the lesson that was not imported', (await receiptRaw(A.p)) === null && !A.p.reqs.some(r => r.body.includes('ack-matched') && r.body.includes(mid(13))) && (await mq(KEY_A)).length === 1);
    await A.p.close();

    // Storage unavailable: ordinary importing keeps working, nothing is persisted.
    await ingest(A.tok, lesson(14));
    const S = await open({ key: KEY_A, breakReceipts: true });
    check('storage blocked: a waiting lesson still imports', await wait(S, () => /Hello from lesson 1[34]/.test(document.getElementById('krispNotes').value), undefined, 20000));
    let shrunk = false; for (let i = 0; i < 60 && !shrunk; i++) { await sleep(250); shrunk = (await mq(KEY_A)).length === 1; }
    check('storage blocked: ACK still succeeds and nothing was persisted', shrunk && (await S.evaluate(k => { try { return Object.keys(localStorage).every(x => x !== k); } catch (e) { return true; } }, RECEIPTS)));
    await S.close();
    check('no uncaught page errors in resilience scenarios', pageErrors.length === 0);
    check('still no report generation', hits.generate === 0);

    // ---- mobile ----
    console.log('\n7) Mobile access');
    const mobile = await open({ viewport: { width: 390, height: 844 } });
    await mobile.click('#accountBtn');
    check('mobile: section reachable from the account popover', await wait(mobile, () => !document.getElementById('radarVanSection').hidden));
    const geometry = await mobile.evaluate(() => {
      const ids = ['radarVanConnectBtn'];
      const rects = ids.map(i => document.getElementById(i).getBoundingClientRect());
      return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        inside: rects.every(r => r.left >= 0 && r.right <= window.innerWidth && r.width > 0),
        tall: rects.every(r => r.height >= 40) };
    });
    check('mobile: no horizontal overflow, controls inside the viewport and touch-sized', !geometry.overflow && geometry.inside && geometry.tall);
    await mobile.evaluate(() => document.getElementById('radarVanConnectBtn').scrollIntoView({ block: 'center' }));
    await mobile.click('#radarVanConnectBtn');
    check('mobile: token reveal fits the screen', await wait(mobile, () => !document.getElementById('radarVanTokenBox').hidden) && await mobile.evaluate(() => { const r = document.getElementById('radarVanTokenField').getBoundingClientRect(); const p = document.getElementById('accountPanel').getBoundingClientRect(); if (r.right > window.innerWidth || r.left < 0) console.log('GEOM field', r.left, r.right, 'panel', p.left, p.right, 'vw', window.innerWidth); return r.right <= window.innerWidth && r.left >= 0; }));
    await mobile.close();
    check('mobile run: no uncaught page errors', pageErrors.length === 0);
  } catch (err) {
    console.log('  FAIL  unexpected exception: ' + (err && err.stack || err));
    check('browser suite completed without exception', false);
  } finally {
    await browser.close().catch(() => {});
    await new Promise(r => server.close(r));
    if (prior.flag === undefined) delete process.env.RADAR_VAN_ENABLED; else process.env.RADAR_VAN_ENABLED = prior.flag;
    if (prior.owner !== undefined) process.env.OWNER_LICENSE_KEYS = prior.owner;
  }
  return getFailures();
};
if (require.main === module) module.exports().then(n => process.exit(n ? 1 : 0)).catch(e => { console.error(e); process.exit(1); });
