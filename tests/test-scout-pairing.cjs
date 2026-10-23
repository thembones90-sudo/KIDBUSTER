'use strict';
// One-click Scout pairing (owner decision 2026-10-23, simplicity item 2).
// Scout creates its own rv1_ token and opens ?scout-pair=<sha256(token)>; the
// signed-in owner approves; the server binds that hash. The raw token never
// passes through the browser or the server. Owner-only, single device.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto');
const { createChecker } = require('./helpers/assert.cjs');
const ROOT = path.resolve(__dirname, '..'), OWNER = 'pairing-synthetic-master';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => 'rv1_' + crypto.randomBytes(32).toString('base64url');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-scout-pairing.cjs ===');
  const vars = ['KIDBUSTER_TEST_KV', 'OWNER_LICENSE_KEYS', 'RADAR_VAN_ENABLED', 'RADAR_VAN_OWNER_SHA256'];
  const old = Object.fromEntries(vars.map(k => [k, process.env[k]]));
  Object.assign(process.env, { KIDBUSTER_TEST_KV: '1', OWNER_LICENSE_KEYS: OWNER, RADAR_VAN_ENABLED: 'true', RADAR_VAN_OWNER_SHA256: sha(OWNER) });
  let server, browser;
  try{
    const kv = await import('../api/_lib/kv-client.js'); kv.__resetForTests();
    const rv = await import('../api/_lib/radar-van.js');
    const feedback = (await import('../api/feedback.js')).default;
    const invoke = async (radar, method, body, headers = {}) => {
      const res = { code: 200, headers: {}, status(n){ this.code = n; return this; }, json(v){ this.body = v; return this; }, setHeader(k, v){ this.headers[k.toLowerCase()] = v; } };
      await feedback({ method, body, headers: { 'content-type': 'application/json', ...headers }, query: { radar }, url: '/api/feedback', socket: { remoteAddress: '127.0.0.1' } }, res);
      return res;
    };
    const owner = { 'x-app-key': OWNER };
    const approve = (hash, headers = owner) => invoke('session', 'POST', { action: 'pair-approve', tokenHash: hash }, headers);
    const credCheck = token => invoke('ingest', 'POST', { action: 'credential-check' }, { authorization: 'Bearer ' + token });

    console.log('\n1) Server contract');
    const legacy = (await invoke('session', 'POST', { action: 'connect', automatic: true }, owner)).body.token;
    check('an existing pasted-token connection works before pairing', (await credCheck(legacy)).code === 200);
    const scoutToken = newToken();
    check('an unapproved Scout token is refused by the credential check', (await credCheck(scoutToken)).code === 401);
    const paired = await approve(sha(scoutToken));
    check('the owner approves the hash and Scout is connected automatically', paired.code === 200 && paired.body.paired === true && paired.body.connected === true && paired.body.automatic === true);
    check('no token appears in the approval response', !JSON.stringify(paired.body).includes('rv1_'));
    const [, allKeys] = await kv.kv.scan('0', { match: '', count: 100000 });
    let stored = '';
    for(const k of allKeys){ stored += k + JSON.stringify(await kv.kv.get(k).catch(() => '')); }
    check('the server stores only the hash, never the raw token', allKeys.length > 0 && stored.includes(sha(scoutToken)) && !stored.includes(scoutToken));
    check('the paired Scout token now passes the credential check', (await credCheck(scoutToken)).code === 200);
    check('the previous device token stops working (single device)', (await credCheck(legacy)).code === 401);
    check('approving the same hash again is harmless', (await approve(sha(scoutToken))).code === 200);
    check('a malformed hash is refused', (await approve('not-a-hash')).code === 400);
    check('a non-owner account cannot pair', (await approve(sha(newToken()), { 'x-app-key': 'synthetic-pro-key' })).code === 403);
    const lesson = { version: 1, lessonId: '00000000-0000-4000-8000-000000000001', title: 'Paired lesson', startedAt: '2026-10-23T08:00:00Z', durationSeconds: 900, transcript: '[00:00] TEACHER: Hello\n[00:02] STUDENT: Hi' };
    const ingest = await invoke('ingest', 'POST', lesson, { authorization: 'Bearer ' + scoutToken });
    check('the paired Scout delivers a lesson', ingest.code === 201 && ingest.body.stored === true);

    console.log('\n2) Browser approval card');
    const hits = { pair: 0 };
    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const json = (v, c) => { res.writeHead(c || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
      if(url.pathname === '/api/license-status') return json({ plan: 'pro', status: 'active', founder: true });
      if(url.pathname === '/api/radar-van-session'){
        let body = ''; for await (const chunk of req) body += chunk;
        const parsed = body ? JSON.parse(body) : undefined;
        if(parsed && parsed.action === 'pair-approve') hits.pair++;
        const r = await invoke('session', req.method, parsed, { 'x-app-key': req.headers['x-app-key'] });
        return json(r.body, r.code);
      }
      if(url.pathname.startsWith('/api/')) return json({}, 404);
      const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\//, ''));
      if(!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()){ res.writeHead(404); return res.end(''); }
      res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const puppeteer = require('puppeteer');
    const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    browser = await puppeteer.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
    const open = async (key, hash) => {
      const page = await browser.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.evaluateOnNewDocument(k => { localStorage.setItem('kidbuster_access_key', k); }, key);
      await page.goto(base + '/?scout-pair=' + hash, { waitUntil: 'load' });
      return { page, errors };
    };
    const browserToken = newToken(), browserHash = sha(browserToken);
    const { page, errors } = await open(OWNER, browserHash);
    await page.waitForSelector('#scoutPairCard', { timeout: 12000 });
    check('the owner sees the approval card with the matching code', await page.$eval('#scoutPairCode', (e, c) => e.textContent === c, (browserHash.slice(0, 4) + '-' + browserHash.slice(4, 8)).toUpperCase()));
    check('nothing is paired before Approve', hits.pair === 0 && (await credCheck(browserToken)).code === 401);
    await page.click('#scoutPairApprove');
    await page.waitForFunction(() => /connected/i.test(document.getElementById('scoutPairStatus').textContent), { timeout: 12000 });
    check('Approve connects Scout', (await credCheck(browserToken)).code === 200);
    check('the pairing link is removed from the address bar', !(await page.evaluate(() => location.search)).includes('scout-pair'));
    check('no browser errors on the owner page', errors.length === 0);
    const other = await open('synthetic-pro-key', sha(newToken()));
    await other.page.waitForSelector('#scoutPairCard', { timeout: 12000 });
    check('a non-owner sees a sign-in message and no Approve button', await other.page.$eval('#scoutPairApprove', e => e.hidden) && /owns Scout/.test(await other.page.$eval('#scoutPairCard', e => e.textContent)));
    const plain = await browser.newPage();
    await plain.evaluateOnNewDocument(k => { localStorage.setItem('kidbuster_access_key', k); }, OWNER);
    await plain.goto(base + '/', { waitUntil: 'load' });
    await plain.waitForFunction(() => !document.getElementById('radarVanSection').hidden, { timeout: 12000 });
    check('no card appears without a pairing link', (await plain.$('#scoutPairCard')) === null);
  }catch(e){ console.error('scout pairing test:', e.stack || e); check('Scout pairing scenario completed', false); }
  finally{
    if(browser) await browser.close().catch(() => {});
    if(server) await new Promise(r => server.close(r));
    for(const k of vars){ if(old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; }
  }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
