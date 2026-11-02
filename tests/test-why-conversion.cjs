'use strict';
// Owner-approved 2026-11-02: discovery link in the visitor access window and the
// "Start free" conversion section on /why-classbuster.
// Guarantees: the link is subtle, inside the access window, opens the public page
// in a new tab with noopener and does not change the workspace geometry or any
// existing access choice. The page CTAs open the REAL access window through two
// fixed hash deep links that never grant access, skip verification, start
// checkout or show a price. Plan claims match the repository's free plan.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {createChecker} = require('./helpers/assert.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const TYPES = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon','.jpg':'image/jpeg'};

module.exports = async function run(){
  const {check, getFailures} = createChecker();
  console.log('\n=== test-why-conversion.cjs ===');
  const index = read('index.html');
  const page = read('why-classbuster.html');
  const config = JSON.parse(read('vercel.json'));

  console.log('\n1) discovery link inside the access window');
  const modalStart = index.indexOf('<div id="licenseModalOverlay"');
  const modalEnd = index.indexOf('<script', modalStart);
  const modal = modalStart >= 0 && modalEnd > modalStart ? index.slice(modalStart, modalEnd) : '';
  const links = index.match(/<a id="accessWhyLink"[^>]*>[\s\S]*?<\/a>/g) || [];
  check('exactly one discovery link exists, inside the access window', links.length === 1 && modal.includes(links[0]));
  const link = links[0] || '';
  check('link sits directly below the existing description',
    /id="accessModalDescription">Start free, upgrade to Pro, or securely restore your access\.<\/p>\s*<p class="access-discovery"><a id="accessWhyLink"/.test(modal));
  check('link text is "New here? See why teachers use Classbuster ↗"',
    link.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() === 'New here? See why teachers use Classbuster ↗');
  check('link targets /why-classbuster in a new tab with noopener',
    /href="\/why-classbuster"/.test(link) && /target="_blank"/.test(link) && /rel="noopener"/.test(link) &&
    config.rewrites.some(r => r.source === '/why-classbuster' && r.destination === '/why-classbuster.html'));
  check('link announces that it opens a new tab', /aria-label="New here\? See why teachers use Classbuster \(opens in a new tab\)"/.test(link));
  check('every existing access choice is preserved',
    ['licenseModalCloseBtn', 'licenseModalEmail', 'licenseModalFreeBtn', 'licenseModalProEmail', 'licenseModalProBtn',
     'licenseModalRecoverEmail', 'licenseModalRecoverBtn', 'licenseModalKeyInput', 'licenseModalKeyBtn', 'licenseModalError']
      .every(id => modal.includes('id="' + id + '"')) &&
    (modal.match(/<details class="license-modal-section[^"]*" name="access-path"/g) || []).length === 3 &&
    modal.includes('href="https://kidbuster.vercel.app/#classbuster_transfer_start"') &&
    modal.includes('5 Classic reports every month. No card required.'));

  console.log('\n2) deep-link handler is open-only');
  const hStart = index.indexOf('function handleAccessDeepLink(){');
  const hEnd = index.indexOf('\nhandleAccessDeepLink();', hStart);
  const handler = hStart >= 0 && hEnd > hStart ? index.slice(hStart, hEnd) : '';
  check('handler exists and runs once at startup', !!handler && (index.match(/\nhandleAccessDeepLink\(\);/g) || []).length === 1);
  check('handler recognises only #access and #access-pro', /hash !== '#access' && hash !== '#access-pro'/.test(handler));
  check('handler never stores keys, calls APIs, starts checkout or navigates',
    !/fetch\(|localStorage\.setItem|create-checkout|startProUpgrade|location\.href\s*=|location\.assign|location\.replace/.test(handler));
  check('handler defers to an in-progress email sign-in link', /has\('access_token'\)\) return false/.test(handler));

  console.log('\n3) "Start free" conversion section');
  const tIdx = page.indexOf('id="testimonials"'), sIdx = page.indexOf('id="start-free"'), bIdx = page.indexOf('id="beta-feedback"');
  check('section follows the testimonials section and precedes beta feedback', tIdx > 0 && sIdx > tIdx && bIdx > sIdx);
  const section = sIdx > 0 ? page.slice(page.lastIndexOf('<section', sIdx), page.indexOf('</section>', sIdx)) : '';
  check('section has a labelled "Start free" heading', /aria-labelledby="startTitle"/.test(section) && /<h2 id="startTitle">Start free<\/h2>/.test(section));
  const freeLimit = /FREE_MONTHLY_LIMIT = parseInt\(process\.env\.FREE_MONTHLY_LIMIT \|\| '5', 10\)/.test(read('api/_lib/licensing.js'));
  check('plan claims match the repository free plan (5 Classic reports monthly, no card)',
    freeLimit && /Five Classic reports every month/.test(section) && /No card required/.test(section) &&
    index.includes('5 Classic reports every month. No card required.') && /come back on the 1st of next month/.test(index));
  check('no prices, discounts, trial counts or unlimited claims in the section',
    !/[$€£]|\bRSD\b|USD|\d+\s*%|per month|\/mo\b|unlimited|discount|trial/i.test(section.replace(/<[^>]+>/g, ' ')));
  const cta = id => (section.match(new RegExp('<a [^>]*id="' + id + '"[^>]*>([^<]*)</a>')) || []);
  check('primary CTA "Start free" opens the real access window', /class="why-btn why-btn-primary"/.test(cta('startFreeCta')[0] || '') && /href="\/#access"/.test(cta('startFreeCta')[0] || '') && cta('startFreeCta')[1] === 'Start free');
  check('secondary CTA "See Pro" opens the real Pro access choice', /href="\/#access-pro"/.test(cta('seeProCta')[0] || '') && cta('seeProCta')[1] === 'See Pro');
  const sectionHrefs = [...section.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  check('section links only to the app deep links (no fake route, /api, checkout or external URL)',
    sectionHrefs.length === 2 && sectionHrefs.every(h => h === '/#access' || h === '/#access-pro'));
  check('CTAs stay in the same tab (the app opens with the access window)', !/target=/.test(section));
  check('beta feedback and disclaimer remain', page.includes('id="beta-feedback"') && /class="why-disclaimer"/.test(page));

  console.log('\n4) social preview metadata');
  const meta = (attr, name) => (page.match(new RegExp('<meta ' + attr + '="' + name + '" content="([^"]+)">')) || [])[1];
  check('Open Graph title, description, type, site name and URL are present',
    meta('property', 'og:title') && meta('property', 'og:description') && meta('property', 'og:type') === 'website' &&
    meta('property', 'og:site_name') === 'Classbuster' && meta('property', 'og:url') === 'https://classbuster.com/why-classbuster');
  check('canonical link matches og:url', page.includes('<link rel="canonical" href="https://classbuster.com/why-classbuster">'));
  const img = meta('property', 'og:image') || '';
  check('og:image and twitter:image are first-party files that exist',
    /^https:\/\/classbuster\.com\/assets\//.test(img) && meta('name', 'twitter:image') === img &&
    fs.existsSync(path.join(ROOT, img.replace('https://classbuster.com/', ''))));
  check('twitter card metadata present', meta('name', 'twitter:card') === 'summary' && !!meta('name', 'twitter:title') && !!meta('name', 'twitter:description'));
  check('share text makes only the verified free-plan claim', !/unlimited|\$|€|%|trusted|rated/i.test((meta('property', 'og:description') || '') + (meta('name', 'twitter:description') || '')));

  console.log('\n5) real browser under the production headers');
  let puppeteer;
  try{ puppeteer = require('puppeteer'); }catch(e){ console.log('  SKIPPED browser part - puppeteer unavailable (' + e.message + ')'); return getFailures(); }
  const installed = process.platform === 'win32' ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'] : [];
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || installed.find(p => fs.existsSync(p));
  const headers = Object.fromEntries((config.headers.find(h => h.source === '/(.*)').headers).map(h => [h.key, h.value]));
  const apiCalls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname);
    if(rel.startsWith('/api/')){
      apiCalls.push(rel);
      if(rel === '/api/license-status'){
        res.writeHead(200, {...headers, 'content-type': 'application/json'});
        return res.end(JSON.stringify({status: 'active', plan: 'free', expired: false, freeMonthlyLimit: 5, remainingFreeReports: 5, usageCount: 0}));
      }
      res.writeHead(404, {...headers, 'content-type': 'application/json'});
      return res.end('{}');
    }
    const rewrite = config.rewrites.find(r => r.source === rel && !r.destination.includes('?'));
    if(rewrite) rel = rewrite.destination;
    if(rel === '/') rel = '/index.html';
    const file = path.join(ROOT, rel);
    if(!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()){ res.writeHead(404, headers); return res.end('nf'); }
    res.writeHead(200, {...headers, 'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({args: ['--no-sandbox'], ...(executablePath ? {executablePath} : {})});
  const KEY = 'kb_live_test_free_visitor';
  const state = () => {
    const overlay = document.getElementById('licenseModalOverlay');
    const sections = [...overlay.querySelectorAll('.license-modal-section')];
    const grid = document.querySelector('.grid') || document.querySelector('main') || document.body;
    const r = grid.getBoundingClientRect();
    const linkEl = document.getElementById('accessWhyLink');
    const dialog = overlay.querySelector('[role="dialog"]');
    const lr = linkEl.getBoundingClientRect(), dr = dialog.getBoundingClientRect();
    return {
      overlay: getComputedStyle(overlay).display,
      open: sections.map(s => s.open),
      focus: document.activeElement && document.activeElement.id,
      hash: location.hash,
      key: localStorage.getItem('kidbuster_access_key'),
      panel: getComputedStyle(document.getElementById('accountPanel')).display,
      geom: [r.left, r.top, r.width, r.height].map(n => Math.round(n * 10) / 10).join(','),
      zoom: getComputedStyle(grid).zoom + '|' + getComputedStyle(grid).transform,
      linkVisible: overlay.style.display !== 'none' ? lr.width > 0 && lr.height > 0 : null,
      linkInside: overlay.style.display !== 'none' ? lr.left >= dr.left - 0.5 && lr.right <= dr.right + 0.5 : null,
      linkFontPx: parseFloat(getComputedStyle(linkEl).fontSize),
      linkOrder: linkEl.closest('p').previousElementSibling && linkEl.closest('p').previousElementSibling.id,
      inTrap: [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])')].includes(linkEl)
    };
  };
  const open = async (url, {key = null, width = 1366, height = 900} = {}) => {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective)); });
    await p.setViewport({width, height});
    await p.goto(origin + '/ping.json');
    await p.evaluate(k => { localStorage.clear(); if(k) localStorage.setItem('kidbuster_access_key', k); }, key);
    await p.goto(origin + url, {waitUntil: 'networkidle0'});
    await new Promise(r => setTimeout(r, 300));
    const s = await p.evaluate(state);
    s.csp = await p.evaluate(() => window.__csp.slice());
    s.errors = errors;
    return {p, s};
  };
  try{
    apiCalls.length = 0;
    const plain = await open('/');
    check('plain / visit keeps the access window closed (unchanged default)', plain.s.overlay === 'none');
    const baseGeom = plain.s.geom, baseZoom = plain.s.zoom;
    await plain.p.close();

    const free = await open('/#access');
    check('/#access opens the real access window with "Start free" expanded', free.s.overlay === 'flex' && free.s.open.join() === 'true,false,false');
    check('/#access focuses the free email field and clears the hash', free.s.focus === 'licenseModalEmail' && free.s.hash === '');
    check('discovery link is visible in the window, inside it, below the description and reachable by keyboard',
      free.s.linkVisible && free.s.linkInside && free.s.linkOrder === 'accessModalDescription' && free.s.inTrap);
    check('discovery link is subtle (smaller than the description)', free.s.linkFontPx > 0 && free.s.linkFontPx <= 13.5);
    check('opening the window with the new link does not change workspace geometry or scale', free.s.geom === baseGeom && free.s.zoom === baseZoom);
    check('deep link stores no key and grants nothing', free.s.key === null);
    check('no CSP violations on the app', free.s.csp.length === 0);
    const popupAttrs = await free.p.evaluate(() => { const a = document.getElementById('accessWhyLink'); return [a.getAttribute('href'), a.target, a.rel, a.relList.contains('noopener')]; });
    check('discovery link DOM: /why-classbuster, _blank, noopener', popupAttrs.join() === '/why-classbuster,_blank,noopener,true');
    const [newTab] = await Promise.all([
      new Promise(resolve => browser.once('targetcreated', t => resolve(t))),
      free.p.click('#accessWhyLink')
    ]);
    const whyPage = await newTab.page();
    await whyPage.waitForSelector('#start-free', {timeout: 10000});
    const opener = await whyPage.evaluate(() => [location.pathname, window.opener === null]);
    check('clicking the link opens the public page in a new tab without opener access', opener[0] === '/why-classbuster' && opener[1] === true);
    const stillOpen = await free.p.evaluate(() => getComputedStyle(document.getElementById('licenseModalOverlay')).display);
    check('the access window and lesson page stay put in the original tab', stillOpen === 'flex');
    await whyPage.close();
    await free.p.close();

    const pro = await open('/#access-pro');
    check('/#access-pro opens the real access window with Pro expanded', pro.s.overlay === 'flex' && pro.s.open.join() === 'false,true,false' && pro.s.hash === '');
    check('/#access-pro focuses the checkout email field (email still required)', pro.s.focus === 'licenseModalProEmail');
    await pro.p.close();

    const signedIn = await open('/#access', {key: KEY});
    check('signed-in visitor with #access: no access window, key untouched', signedIn.s.overlay === 'none' && signedIn.s.key === KEY && signedIn.s.hash === '');
    await signedIn.p.close();
    const signedPro = await open('/#access-pro', {key: KEY});
    check('signed-in visitor with #access-pro: Account panel (real upgrade flow) opens, key untouched',
      signedPro.s.overlay === 'none' && signedPro.s.panel !== 'none' && signedPro.s.key === KEY);
    await signedPro.p.close();

    const other = await open('/#something-else');
    check('unrelated hashes do not open the access window', other.s.overlay === 'none' && other.s.hash === '#something-else');
    await other.p.close();
    check('no checkout or verification API was called by any deep link',
      !apiCalls.some(c => /create-checkout|license-verify|request-access|claim/i.test(c)));

    const mobile = await open('/#access', {width: 375, height: 760});
    const mobileOverflow = await mobile.p.evaluate(() => {
      const d = document.querySelector('#licenseModalOverlay [role="dialog"]').getBoundingClientRect();
      const l = document.getElementById('accessWhyLink').getBoundingClientRect();
      return {inside: l.left >= d.left && l.right <= d.right + 0.5, dialogFits: d.right <= window.innerWidth + 0.5};
    });
    check('mobile 375px: discovery link wraps inside the access window', mobile.s.overlay === 'flex' && mobileOverflow.inside && mobileOverflow.dialogFits);
    await mobile.p.close();

    // End to end: the public page CTAs land on the real access window.
    for(const [id, expected] of [['startFreeCta', 'true,false,false'], ['seeProCta', 'false,true,false']]){
      const p = await browser.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push(e.message));
      await p.goto(origin + '/ping.json');
      await p.evaluate(() => localStorage.clear());
      await p.setViewport({width: 375, height: 800});
      await p.goto(origin + '/why-classbuster', {waitUntil: 'networkidle0'});
      const box = await p.evaluate(sel => { const r = document.getElementById(sel).getBoundingClientRect(); return {h: r.height, w: r.width, vw: document.documentElement.clientWidth, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth}; }, id);
      check('mobile ' + id + ' is touch-sized and the page does not overflow', box.h >= 44 && box.overflow <= 0 && box.w <= box.vw);
      await Promise.all([p.waitForNavigation({waitUntil: 'networkidle0'}), p.click('#' + id)]);
      await new Promise(r => setTimeout(r, 300));
      const s = await p.evaluate(state);
      check(id + ' opens the app access window on the expected choice', s.overlay === 'flex' && s.open.join() === expected && s.key === null);
      check(id + ' causes no page errors', errs.length === 0);
      await p.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return getFailures();
};
if(require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
