'use strict';
// Real-browser test of the header "Krisp integration" button and everything it
// must NOT disturb (ARM/DISARM, webhook controls, matching, notes counter).
// The page is served by a tiny local server with a stubbed /api/krisp-session,
// so the real index.html JavaScript runs end to end. Synthetic data only.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createChecker } = require('./helpers/assert.cjs');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
// 1x1 transparent PNG, used only to prove the optional logo slot works.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

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

function makeServer(state){
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/krisp-session') {
      if (req.method === 'GET') {
        state.calls.push('GET');
        if (!state.entitled) { res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"no"}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ webhookUrl: state.webhookUrl, waiting: state.waiting,
          lastReceivedAt: state.lastReceivedAt, pending: state.pending, matched: state.matched }));
      }
      let body = '';
      req.on('data', c => body += c);
      req.on('end', () => {
        let action = ''; let parsed = {};
        try { parsed = JSON.parse(body); action = parsed.action; } catch (e) { /* ignore */ }
        state.calls.push(action);
        if (action === 'wait') state.waiting = true;
        if (action === 'cancel-wait') state.waiting = false;
        if (action === 'regenerate') state.webhookUrl = 'https://example.test/api/krisp-webhook?t=REGENERATED';
        if (action === 'ack-matched') state.matched = null;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, webhookUrl: state.webhookUrl }));
      });
      return;
    }
    if (url.pathname === '/api/license-status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"status":"active"}');
    }
    if (url.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('{}'); }
    let rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (/^\/assets\/logos\/krisp-logo\.(png|svg)$/.test(rel)) {
      // Scenario control: by default behave as if no logo file exists, so the fallback icon path is tested.
      if (state.logoFile === 'stand-in') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PIXEL); }
      if (state.logoFile !== 'shipped') { res.writeHead(404); return res.end(); }
    }
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-krisp-integration-button.cjs ===');
  let puppeteer, launchOptions;
  try { ({ puppeteer, launchOptions } = loadPuppeteer()); }
  catch (e) { console.log('  SKIPPED - no puppeteer/Chrome here (' + e.message + ')'); return 0; }

  const state = { calls: [], entitled: true, waiting: false, lastReceivedAt: null, pending: [], matched: null,
    webhookUrl: 'https://example.test/api/krisp-webhook?t=ORIGINAL', logoFile: false };
  const server = makeServer(state);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], ...launchOptions });
  const pageErrors = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function open(opts = {}){
    const page = await browser.newPage();
    await page.setViewport(opts.viewport || { width: 1440, height: 900 });
    page.on('pageerror', e => pageErrors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.evaluateOnNewDocument(k => { try { if (k) localStorage.setItem('kidbuster_access_key', k); else localStorage.removeItem('kidbuster_access_key'); } catch (e) {} }, opts.key === undefined ? 'synthetic-pro-key' : opts.key);
    await page.goto(base, { waitUntil: 'load' });
    await sleep(500);
    return page;
  }
  const info = page => page.evaluate(() => {
    const b = document.getElementById('krispIntegrationBtn');
    const s = document.getElementById('krispSetupSection');
    const w = document.getElementById('krispWaitBtn');
    const vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
    return { btnVisible: vis(b), expanded: b && b.getAttribute('aria-expanded'), sectionVisible: vis(s),
      wait: w && w.textContent.trim(), waiting: w && w.dataset.waiting, urlField: document.getElementById('krispWebhookUrlField').value,
      panelVisible: vis(document.getElementById('krispIntegrationPanel')) };
  });
  const toggleBtn = page => page.evaluate(() => document.getElementById('krispIntegrationBtn').click());

  try {
    console.log('\n1) No saved key: nothing Krisp-related is shown');
    let page = await open({ key: '' });
    let i = await info(page);
    check('header button hidden without an access key', !i.btnVisible);
    check('Krisp panel hidden without an access key', !i.panelVisible);
    check('no GET to the Krisp API without a key', state.calls.length === 0);
    await page.close();

    console.log('\n2) Not entitled (403): stays hidden');
    state.entitled = false; state.calls = [];
    page = await open();
    i = await info(page);
    check('button and panel stay hidden on 403', !i.btnVisible && !i.panelVisible);
    await page.close(); state.entitled = true;

    console.log('\n3) Entitled, first visit (nothing received yet): visible and open');
    state.calls = []; state.lastReceivedAt = null;
    page = await open();
    i = await info(page);
    check('header button visible', i.btnVisible);
    check('setup is open when no transcript has ever arrived', i.expanded === 'true' && i.sectionVisible);
    check('connection maintenance is collapsed by default',await page.$eval('#krispConnectionDetails',el=>!el.open));
    check('commands clearly identify link maintenance',await page.evaluate(()=>document.getElementById('krispCopyUrlBtn').textContent.includes('Copy link')&&document.getElementById('krispRegenerateBtn').textContent.includes('Replace connection link')));
    check('webhook URL is shown', i.urlField === state.webhookUrl);
    const label = await page.evaluate(() => document.querySelector('#krispIntegrationBtn .krisp-integration-label').textContent.trim());
    check('button text says Krisp integration', /krisp integration/i.test(label));
    const icon = await page.evaluate(() => {
      const img = document.getElementById('krispLogoImg'), fb = document.getElementById('krispLogoFallback');
      const cs = getComputedStyle(fb), r = fb.getBoundingClientRect(), slot = document.querySelector('.krisp-logo-slot').getBoundingClientRect();
      return { imgHidden: img.hidden, fbShown: cs.display !== 'none' && r.width > 0, dbg: { cssW: cs.width, flex: cs.flex, minW: cs.minWidth, maxW: cs.maxWidth, display: cs.display, w: r.width, h: r.height, slotW: slot.width, svgStyle: fb.getAttribute('style') } };
    });
    if (!(icon.imgHidden && icon.fbShown)) console.log('    debug icon:', JSON.stringify(icon));
    check('neutral fallback icon shows when no logo file exists', icon.imgHidden && icon.fbShown);
    await page.close();

    console.log('\n4) Entitled, Krisp already used: collapsed, toggles open and closed');
    state.lastReceivedAt = new Date().toISOString();
    page = await open();
    i = await info(page);
    check('collapsed after a transcript has been received', i.btnVisible && i.expanded === 'false' && !i.sectionVisible);
    await toggleBtn(page); i = await info(page);
    check('click opens the settings', i.expanded === 'true' && i.sectionVisible && i.urlField === state.webhookUrl);
    await toggleBtn(page); i = await info(page);
    check('second click closes the settings', i.expanded === 'false' && !i.sectionVisible);

    console.log('\n5) ARM / DISARM are independent of the integration button');
    state.calls = [];
    await toggleBtn(page); await toggleBtn(page);
    check('toggling visibility sends no arm or disarm request', !state.calls.includes('wait') && !state.calls.includes('cancel-wait'));
    await page.evaluate(() => document.getElementById('krispWaitBtn').click()); await sleep(300);
    i = await info(page);
    check('ARM KRISP arms (button says DISARM KRISP)', i.wait === 'DISARM KRISP' && i.waiting === 'true' && state.waiting === true);
    check('persistent status explicitly says Krisp armed',await page.$eval('#krispArmedState',el=>el.textContent==='Krisp armed'));
    await toggleBtn(page); i = await info(page);
    check('opening settings while armed keeps it armed', i.wait === 'DISARM KRISP' && state.waiting === true);
    await toggleBtn(page); i = await info(page);
    check('closing settings while armed keeps it armed', i.wait === 'DISARM KRISP' && state.waiting === true);
    await page.evaluate(() => document.getElementById('krispWaitBtn').click()); await sleep(300);
    i = await info(page);
    check('DISARM KRISP disarms', i.wait === 'ARM KRISP' && i.waiting === 'false' && state.waiting === false);
    await toggleBtn(page); i = await info(page);
    check('toggling settings while disarmed does not arm', i.wait === 'ARM KRISP' && state.waiting === false);

    console.log('\n6) Armed state survives a reload; transcript match does not disarm');
    await page.evaluate(() => document.getElementById('krispWaitBtn').click()); await sleep(300);
    await page.reload({ waitUntil: 'load' }); await sleep(600);
    i = await info(page);
    if (!(i.wait === 'DISARM KRISP' && i.waiting === 'true')) console.log('    debug armed:', JSON.stringify(i), 'server waiting=', state.waiting, 'calls=', JSON.stringify(state.calls));
    check('armed state restored after reload', i.wait === 'DISARM KRISP' && i.waiting === 'true');
    state.calls = [];
    state.matched = { meetingId: 'meeting-synth-1', transcript: 'Today we practised the past tense with several short sentences about the weekend and daily routines.' };
    await page.reload({ waitUntil: 'load' }); await sleep(900);
    const matched = await page.evaluate(() => ({ notes: document.getElementById('krispNotes').value, counter: document.getElementById('krispCounter').textContent,
      wait: document.getElementById('krispWaitBtn').textContent.trim() }));
    check('matched transcript is placed in the notes box', /past tense/.test(matched.notes));
    check('word counter reflects the imported transcript', /^[1-9]\d* words?/.test(matched.counter));
    check('receiving a transcript does NOT disarm Krisp', matched.wait === 'DISARM KRISP' && state.waiting === true);
    check('the transcript is acknowledged once, by its meeting id', state.calls.filter(c => c === 'ack-matched').length === 1);
    check('no automatic disarm request was sent', !state.calls.includes('cancel-wait'));

    console.log('\n7) Webhook controls (each handler runs exactly once)');
    await toggleBtn(page);
    i = await info(page);
    if (!i.sectionVisible) await toggleBtn(page);
    await page.evaluate(() => document.getElementById('krispCopyUrlBtn').click()); await sleep(150);
    const copied = await page.evaluate(() => document.getElementById('krispCopyUrlBtn').textContent.trim());
    check('Copy gives feedback', copied === 'Copied!');
    state.calls = [];
    await page.evaluate(() => document.getElementById('krispRegenerateBtn').click()); await sleep(400);
    i = await info(page);
    check('Regenerate sends exactly one request and shows the new URL', state.calls.filter(c => c === 'regenerate').length === 1 && /REGENERATED/.test(i.urlField));
    check('Regenerate leaves Krisp armed', i.wait === 'DISARM KRISP' && state.waiting === true);
    state.calls = [];
    await page.evaluate(() => document.getElementById('krispDisconnectBtn').click()); await sleep(400);
    check('Disconnect sends exactly one request', state.calls.filter(c => c === 'disconnect').length === 1);

    console.log('\n8) Manual typing and counter');
    await page.evaluate(() => { const t = document.getElementById('krispNotes'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#krispNotes');
    await page.keyboard.type('one two three');
    const typed = await page.evaluate(() => document.getElementById('krispCounter').textContent);
    check('typing updates the counter (3 words, 13 characters)', /3 words/.test(typed) && /13 characters/.test(typed));

    console.log('\n9) Theme follows the active protocol');
    const themeA = await page.evaluate(() => ({ color: getComputedStyle(document.getElementById('krispIntegrationBtn')).color,
      rgb: getComputedStyle(document.getElementById('krispIntegrationBtn')).getPropertyValue('--toxin-rgb').trim() }));
    const switched = await page.evaluate(() => { const r = document.querySelector('input[name="protocol"][value="FAIRY"]'); if (!r) return false; r.click(); return true; });
    await sleep(900);
    const themeB = await page.evaluate(() => ({ color: getComputedStyle(document.getElementById('krispIntegrationBtn')).color,
      rgb: getComputedStyle(document.getElementById('krispIntegrationBtn')).getPropertyValue('--toxin-rgb').trim() }));
    const toRgb = s => 'rgb(' + s.split(',').map(x => x.trim()).join(', ') + ')';
    check('button colour equals the active --toxin-rgb', themeA.color.replace(/\s+/g, '') === toRgb(themeA.rgb).replace(/\s+/g, ''));
    check('protocol switch exists in the page', switched);
    if (!(switched && themeB.color.replace(/\s+/g, '') === toRgb(themeB.rgb).replace(/\s+/g, ''))) console.log('    debug theme:', JSON.stringify({ themeA, themeB }));
    check('button colour follows a protocol change (and differs from Classic)', switched && themeB.color !== themeA.color && themeB.color.replace(/\s+/g, '') === toRgb(themeB.rgb).replace(/\s+/g, ''));
    await page.close();

    console.log('\n10) Sign in AFTER page load reveals the button (the original defect)');
    state.calls = []; state.waiting = false;
    page = await open({ key: '' });
    i = await info(page);
    check('hidden before signing in', !i.btnVisible);
    await page.evaluate(() => document.getElementById('accountBtn').click()); await sleep(250);
    await page.evaluate(() => { const inp = document.getElementById('licenseModalKeyInput'); inp.value = 'synthetic-pro-key'; });
    await page.evaluate(() => document.getElementById('licenseModalKeyBtn').click()); await sleep(900);
    i = await info(page);
    check('button appears right after sign-in without reloading', i.btnVisible);
    state.calls = [];
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('kidbuster:access-key-saved'))); await sleep(500);
    await page.evaluate(() => document.getElementById('krispRegenerateBtn').click()); await sleep(300);
    check('re-initialising does not duplicate handlers (one regenerate request)', state.calls.filter(c => c === 'regenerate').length === 1);
    await page.close();

    console.log('\n11) Optional Krisp logo slot');
    state.logoFile = 'stand-in'; state.lastReceivedAt = null;
    page = await open();
    const logo = await page.evaluate(() => { const img = document.getElementById('krispLogoImg'), fb = document.getElementById('krispLogoFallback');
      return { imgShown: !img.hidden && img.getBoundingClientRect().width > 0, fbHidden: getComputedStyle(fb).display === 'none' }; });
    check('a logo file at assets/logos/krisp-logo.png replaces the fallback icon', logo.imgShown && logo.fbHidden);
    await page.close();
    state.logoFile = 'shipped';
    page = await open();
    const real = await page.evaluate(() => { const img = document.getElementById('krispLogoImg'), fb = document.getElementById('krispLogoFallback'), r = img.getBoundingClientRect();
      return { shown: !img.hidden && r.width >= 16 && r.height >= 16, natural: img.naturalWidth, fbHidden: getComputedStyle(fb).display === 'none', src: img.getAttribute('src') }; });
    check('the shipped Krisp logo file loads in the header button (real image, not the fallback)', real.shown && real.natural > 0 && real.fbHidden && /krisp-logo\.png$/.test(real.src));
    await page.close();
    const logoPath = path.join(ROOT, 'assets', 'logos', 'krisp-logo.png');
    const hdr = fs.existsSync(logoPath) ? fs.readFileSync(logoPath) : Buffer.alloc(0);
    check('shipped logo is a PNG with an alpha channel (transparent background)', hdr.length > 500 && hdr.slice(1, 4).toString() === 'PNG' && hdr[25] === 6);
    state.logoFile = false;

    console.log('\n12) Layout: desktop and mobile');
    for (const vp of [{ name: 'desktop 1440', width: 1440, height: 900 }, { name: 'tablet 768', width: 768, height: 900 }, { name: 'mobile 390', width: 390, height: 800 }]) {
      page = await open({ viewport: { width: vp.width, height: vp.height } });
      const lay = await page.evaluate(() => {
        const r = el => el.getBoundingClientRect();
        const b = r(document.getElementById('krispIntegrationBtn')), h = r(document.getElementById('helpBtn')), a = r(document.getElementById('accountBtn'));
        const hit = (x, y) => !(x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top);
        return { inView: b.left >= 0 && b.right <= innerWidth, h: b.height, noOverlap: !hit(b, h) && !hit(b, a),
          noHScroll: document.documentElement.scrollWidth <= innerWidth + 1, w: b.width };
      });
      check(vp.name + ': button fully on screen, tall enough to tap, not overlapping neighbours', lay.inView && lay.h >= 40 && lay.noOverlap);
      check(vp.name + ': no horizontal scrolling', lay.noHScroll);
      await page.close();
    }

    check('no uncaught page errors in any scenario', pageErrors.length === 0);
    if (pageErrors.length) console.log('    errors:', pageErrors.slice(0, 5));
  } finally {
    await browser.close();
    server.close();
  }
  return getFailures();
};

if (require.main === module) {
  module.exports().then(f => process.exit(f ? 1 : 0)).catch(e => { console.error(e); process.exit(1); });
}
