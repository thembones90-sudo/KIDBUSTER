'use strict';
// Public "Why Classbuster" page and consent-gated testimonials (2026-11-02).
// Guarantees: no fabricated testimonials/stats/logos; only consent-approved,
// website-scoped entries render; consent records stay out of the public file;
// quotes render as text (no XSS); empty/missing/broken data shows the benefits
// page with the beta invitation and no cards; routes and links resolve; CSP and
// existing rewrites are unchanged; mobile layout does not overflow.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const {createChecker} = require('./helpers/assert.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EXPECTED_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const TYPES = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};

function loadModule(){
  // package.json is "type":"module", so load the classic browser script in a VM
  // with a CommonJS-style module object, exactly as its UMD footer expects.
  const sandbox = {module:{exports:{}}};
  vm.runInNewContext(read('assets/why-classbuster.js'), sandbox, {filename:'why-classbuster.js'});
  return sandbox.module.exports;
}

const NOW = new Date('2026-11-02T12:00:00Z');
function approved(overrides = {}){
  const base = {
    id: 'beta-teacher-001',
    quote: 'Writing feedback after a long teaching day finally takes minutes, and the draft still sounds like me.',
    attribution: {name: 'Ana', role: 'Online ESL teacher', context: 'Beta tester'},
    consent: {status: 'approved', reference: 'CB-CONSENT-20250601-A7K2', approvedOn: '2025-06-01', expiresOn: null, channels: ['website'], anonymous: false}
  };
  const out = JSON.parse(JSON.stringify(base));
  for(const [k, v] of Object.entries(overrides)){
    if(v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') Object.assign(out[k], v);
    else out[k] = v;
  }
  return out;
}

function hrefTargets(html){
  return [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
}
function resolvesLocally(href){
  const clean = href.split('#')[0].split('?')[0];
  if(clean === '' ) return true; // same-page anchor
  if(clean === '/') return fs.existsSync(path.join(ROOT, 'index.html'));
  const rewrites = JSON.parse(read('vercel.json')).rewrites;
  const rule = rewrites.find(r => r.source === clean);
  const target = rule ? rule.destination : clean;
  return target.startsWith('/') && fs.existsSync(path.join(ROOT, target.slice(1)));
}

module.exports = async function run(){
  const {check, getFailures} = createChecker();
  console.log('\n=== test-testimonials.cjs ===');
  const T = loadModule();

  console.log('\n1) publication consent gate');
  const ok = T.validateTestimonial(approved(), NOW);
  check('a fully consented, website-scoped entry is publishable', ok.ok && ok.item.name === 'Ana' && ok.item.role === 'Online ESL teacher');
  check('the published item carries display fields only (no consent data)',
    ok.ok && Object.keys(ok.item).sort().join(',') === 'context,id,name,quote,role');
  const rejects = [
    ['pending consent', approved({consent: {status: 'pending'}})],
    ['withdrawn consent', approved({consent: {status: 'withdrawn'}})],
    ['missing consent', (() => { const e = approved(); delete e.consent; return e; })()],
    ['non-opaque consent reference', approved({consent: {reference: 'ana@example.com'}})],
    ['consent approved in the future', approved({consent: {approvedOn: '2026-12-01'}})],
    ['impossible approval date', approved({consent: {approvedOn: '2026-02-30'}})],
    ['expired consent', approved({consent: {expiresOn: '2026-11-02'}})],
    ['consent not covering the website', approved({consent: {channels: ['social']}})],
    ['private consent field (email) in public file', approved({consent: {email: 'teacher@example.com'}})],
    ['private consent field (signed form) in public file', approved({consent: {signedFormUrl: '/private/form.pdf'}})],
    ['unexpected top-level field (e.g. studentName)', approved({studentName: 'Mila'})],
    ['unexpected attribution field (e.g. photo)', approved({attribution: {photo: '/a.png'}})],
    ['missing role', approved({attribution: {role: ''}})],
    ['quote containing an email', approved({quote: 'Great tool, write to me at teacher@example.com for details please.'})],
    ['quote containing a link', approved({quote: 'Great tool, see my review at https://example.com/review for more.'})],
    ['quote containing a phone number', approved({quote: 'Great tool for my school, call me on +381 64 123 4567 anytime.'})],
    ['quote containing control characters', approved({quote: 'Great tool for reports\u0007 and my lesson notes every day.'})],
    ['quote containing bidi override characters', approved({quote: 'Great tool for reports \u202Ereversed text and lesson notes.'})],
    ['quote too short', approved({quote: 'Great!'})],
    ['quote too long', approved({quote: 'a'.repeat(601)})],
    ['invalid id', approved({id: '<b>x</b>'})],
    ['non-boolean anonymous flag', approved({consent: {anonymous: 'yes'}})]
  ];
  for(const [label, entry] of rejects){
    const r = T.validateTestimonial(entry, NOW);
    check('rejects ' + label, r.ok === false && r.reasons.length > 0);
  }
  const anon = T.validateTestimonial(approved({consent: {anonymous: true}}), NOW);
  check('anonymous consent hides the name even if one is present', anon.ok && anon.item.name === 'Classbuster beta teacher');
  const unexpiring = T.validateTestimonial(approved({consent: {expiresOn: '2027-01-01'}}), NOW);
  check('consent with a future expiry is publishable until then', unexpiring.ok);

  console.log('\n2) missing, empty and malformed data never produce cards');
  for(const [label, data] of [['null', null], ['undefined', undefined], ['string', 'x'], ['empty object', {}],
    ['wrong schema version', {schemaVersion: 2, testimonials: [approved()]}], ['non-array list', {schemaVersion: 1, testimonials: {}}],
    ['empty list', {schemaVersion: 1, testimonials: []}], ['list of junk', {schemaVersion: 1, testimonials: [null, 3, 'q', []]}],
    ['only unapproved entries', {schemaVersion: 1, testimonials: [approved({consent: {status: 'pending'}})]}]]){
    let out; try{ out = T.selectPublishable(data, NOW); }catch(e){ out = e; }
    check('selectPublishable(' + label + ') returns []', Array.isArray(out) && out.length === 0);
  }
  const many = {schemaVersion: 1, testimonials: Array.from({length: 20}, (_, i) => approved({id: 'teacher-' + String(i).padStart(3, '0')}))};
  check('at most MAX_CARDS entries are shown', T.selectPublishable(many, NOW).length === T.MAX_CARDS);
  const dup = {schemaVersion: 1, testimonials: [approved(), approved({quote: 'A second quote with the same id must not appear twice anywhere.'})]};
  check('duplicate ids are shown once', T.selectPublishable(dup, NOW).length === 1);

  console.log('\n3) shipped public data file and schema');
  let shipped = null;
  try{ shipped = JSON.parse(read('assets/testimonials/testimonials.json')); }catch{}
  check('testimonials.json is valid JSON with schemaVersion 1 and a list', !!shipped && shipped.schemaVersion === 1 && Array.isArray(shipped.testimonials));
  check('every shipped entry passes the consent gate (nothing unapproved is published)',
    !!shipped && shipped.testimonials.every(e => T.validateTestimonial(e, new Date()).ok));
  const shippedText = read('assets/testimonials/testimonials.json');
  check('the public file contains no email addresses or private consent fields',
    !/@/.test(shippedText) && !/"(email|signature|signedForm\w*|notes|phone|studentName)"\s*:/i.test(shippedText));
  const schema = JSON.parse(read('assets/testimonials/testimonials.schema.json'));
  const item = schema.properties.testimonials.items;
  check('schema and runtime gate agree on allowed fields',
    Object.keys(item.properties).sort().join() === 'attribution,consent,id,quote' &&
    Object.keys(item.properties.attribution.properties).sort().join() === 'context,name,role' &&
    Object.keys(item.properties.consent.properties).sort().join() === 'anonymous,approvedOn,channels,expiresOn,reference,status' &&
    item.additionalProperties === false && item.properties.consent.additionalProperties === false &&
    item.properties.consent.properties.status.const === 'approved' && schema.properties.testimonials.maxItems === T.MAX_CARDS);

  console.log('\n4) page content: honest, private, CSP-safe');
  const page = read('why-classbuster.html');
  const js = read('assets/why-classbuster.js');
  check('page has accessible structure (lang, skip link, main, one h1, labelled sections)',
    page.startsWith('<!doctype html>') && page.includes('<html lang="en">') && page.includes('class="skip-link"') &&
    page.includes('<main id="content">') && (page.match(/<h1\b/g) || []).length === 1 && /<title>[^<]+Classbuster<\/title>/.test(page));
  check('testimonials section is hidden by default and contains no static cards',
    /<section[^>]*id="testimonials"[^>]*\shidden>/.test(page) && !/quote-card|<blockquote/i.test(page) && /<ul[^>]*id="testimonialList"[^>]*><\/ul>/.test(page));
  check('beta feedback invitation is always present with a consent promise and privacy warning',
    page.includes('id="beta-feedback"') && /mailto:thembones90@gmail\.com\?subject=/.test(page) && /written permission/.test(page) && /student names/.test(page));
  check('no fabricated stats, ratings, logos, prices or endorsements',
    !/\d+\s*%|\b\d{2,}[,.]?\d*\+?\s*(teachers|schools|reports|users)|★|☆|\d(\.\d)?\s*\/\s*5|trusted by|as seen|RSD|US\$|\$\d|€|per month|<img\b|<video\b|<iframe\b/i.test(page));
  check('page has no inline scripts, inline handlers, javascript: links or third-party URLs',
    !/<script(?![^>]*\bsrc="\/assets\/why-classbuster\.js")/i.test(page) && !/\son[a-z]+=/i.test(page) && !/javascript:/i.test(page) && !/(src|href)="https?:/i.test(page));
  check('renderer never uses HTML sinks or eval', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/.test(js));
  check('renderer fetches only the same-origin data file without credentials',
    T.DATA_URL === '/assets/testimonials/testimonials.json' && (js.match(/fetchImpl\(/g) || []).length === 1 && /credentials: 'omit'/.test(js));
  check('page states platform independence (no implied endorsement)', /do not imply sponsorship, partnership or endorsement/.test(page));

  console.log('\n5) routes, navigation and preserved configuration');
  const config = JSON.parse(read('vercel.json'));
  const csp = ((config.headers || []).find(h => h.source === '/(.*)')?.headers || []).find(h => h.key === 'Content-Security-Policy')?.value;
  check('CSP is unchanged', csp === EXPECTED_CSP);
  check('/why-classbuster and /testimonials rewrite to the page',
    ['/why-classbuster', '/testimonials'].every(s => config.rewrites.some(r => r.source === s && r.destination === '/why-classbuster.html')));
  check('existing rewrites are preserved',
    [['/privacy', '/privacy-policy.html'], ['/terms', '/terms-of-use.html'], ['/api/radar-van-session', '/api/feedback?radar=session'],
     ['/api/radar-van-download', '/api/feedback?radar=download'], ['/api/radar-van-ingest', '/api/feedback?radar=ingest'], ['/api/ping', '/ping.json']]
      .every(([s, d]) => config.rewrites.some(r => r.source === s && r.destination === d)));
  check('new rewrites never touch /api or the root', config.rewrites.filter(r => /why-classbuster/.test(r.destination)).every(r => !r.source.startsWith('/api') && r.source !== '/'));
  const index = read('index.html');
  const appLinks = index.match(/<a id="accountWhyLink"[^>]*>/g) || [];
  check('the app Account panel has exactly one link to the page, opening safely in a new tab (lesson notes are kept)',
    appLinks.length === 1 && /href="\/why-classbuster\.html"/.test(appLinks[0]) && /target="_blank"/.test(appLinks[0]) && /rel="noopener"/.test(appLinks[0]) && /aria-label="[^"]*new tab/.test(appLinks[0]));
  const legal = ['privacy-policy.html', 'terms-of-use.html', 'disclaimers.html'];
  check('legal page footers link to the page', legal.every(f => read(f).includes('<a href="/why-classbuster.html">Why Classbuster</a>')));
  const broken = [];
  for(const file of ['why-classbuster.html', ...legal]){
    for(const href of hrefTargets(read(file))){
      if(/^mailto:/.test(href)) continue;
      if(/^https?:/.test(href)){ if(file === 'why-classbuster.html') broken.push(file + ' external ' + href); continue; }
      if(href.startsWith('#')){ if(!read(file).includes('id="' + href.slice(1) + '"')) broken.push(file + ' ' + href); continue; }
      if(!resolvesLocally(href)) broken.push(file + ' ' + href);
    }
  }
  check('every internal link on the page and legal pages resolves' + (broken.length ? ' (broken: ' + broken.join(', ') + ')' : ''), broken.length === 0);
  check('page assets exist', ['legal.css', 'assets/why-classbuster.css', 'assets/why-classbuster.js'].every(f => fs.existsSync(path.join(ROOT, f))));

  console.log('\n6) real browser under the production headers');
  let puppeteer;
  try{ puppeteer = require('puppeteer'); }catch(e){ console.log('  SKIPPED browser part - puppeteer unavailable (' + e.message + ')'); return getFailures(); }
  const installed = process.platform === 'win32' ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'] : [];
  const executablePath = installed.find(p => fs.existsSync(p));
  const headers = Object.fromEntries((config.headers.find(h => h.source === '/(.*)').headers).map(h => [h.key, h.value]));
  let dataOverride = null; // {status, body}
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rewrite = config.rewrites.find(r => r.source === rel && !r.destination.includes('?'));
    if(rewrite) rel = rewrite.destination;
    if(rel === '/') rel = '/index.html';
    if(rel === '/assets/testimonials/testimonials.json' && dataOverride){
      res.writeHead(dataOverride.status, {...headers, 'content-type': 'application/json'});
      return res.end(dataOverride.body);
    }
    const file = path.join(ROOT, rel);
    if(!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()){ res.writeHead(404, headers); return res.end('nf'); }
    res.writeHead(200, {...headers, 'content-type': TYPES[path.extname(file)] || 'application/octet-stream'});
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({args: ['--no-sandbox'], ...(executablePath ? {executablePath} : {})});
  try{
    const open = async (url, width = 1280) => {
      const page = await browser.newPage();
      const errors = [], external = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if(/Content Security Policy|Refused to/i.test(m.text())) errors.push('CSP ' + m.text()); });
      await page.setRequestInterception(true);
      page.on('request', r => { const u = r.url(); if(!u.startsWith(origin) && !u.startsWith('data:')){ external.push(u); return r.abort(); } r.continue(); });
      await page.evaluateOnNewDocument(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective)); });
      await page.setViewport({width, height: 900});
      const response = await page.goto(origin + url, {waitUntil: 'networkidle0'});
      await page.waitForFunction(() => !!window.ClassbusterTestimonials);
      await new Promise(r => setTimeout(r, 150));
      const state = await page.evaluate(() => ({
        hidden: document.getElementById('testimonials').hidden,
        cards: document.querySelectorAll('#testimonialList .quote-card').length,
        betaVisible: !!document.getElementById('beta-feedback').offsetParent,
        csp: window.__csp.slice(),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        minButton: Math.min(...[...document.querySelectorAll('.why-btn')].map(b => b.getBoundingClientRect().height)),
        xss: window.__xss,
        listImgs: document.querySelectorAll('#testimonialList img, #testimonialList script').length,
        listText: document.getElementById('testimonialList').textContent
      }));
      await page.close();
      return {status: response.status(), state, errors, external};
    };

    const empty = await open('/why-classbuster');
    check('/why-classbuster serves the page (HTTP 200)', empty.status === 200);
    check('with no approvals: no cards, testimonials hidden, beta invitation visible',
      empty.state.cards === 0 && empty.state.hidden === true && empty.state.betaVisible);
    check('no CSP violations, page errors or third-party requests', empty.state.csp.length === 0 && empty.errors.length === 0 && empty.external.length === 0);
    check('/testimonials alias serves the page too', (await open('/testimonials')).status === 200);

    const mobile = await open('/why-classbuster.html', 375);
    check('mobile 375px: no horizontal overflow and touch-sized buttons', mobile.state.overflow <= 0 && mobile.state.minButton >= 44);

    dataOverride = {status: 200, body: JSON.stringify({schemaVersion: 1, testimonials: [
      approved({id: 'xss-quote', quote: 'Lovely <img src=x onerror="window.__xss=1"> drafts <script>window.__xss=2</script> every day.',
        attribution: {name: '<script>window.__xss=3</script>', role: '<b>ESL</b> teacher', context: '"><svg onload=window.__xss=4>'}}),
      approved({id: 'pending-quote', consent: {status: 'pending'}}),
      approved({id: 'no-website', consent: {channels: ['newsletter']}})
    ]})};
    const xss = await open('/why-classbuster.html');
    check('only the consented entry renders as a card', xss.state.cards === 1 && xss.state.hidden === false);
    check('markup in quotes and attribution is shown as text, never executed',
      xss.state.xss === undefined && xss.state.listImgs === 0 && xss.state.listText.includes('<img src=x') && xss.state.listText.includes('<script>window.__xss=3</script>'));
    check('rendering approved data causes no CSP violations or errors', xss.state.csp.length === 0 && xss.errors.length === 0);

    for(const [label, override] of [['missing data file (404)', {status: 404, body: 'nf'}], ['malformed JSON', {status: 200, body: '{"schemaVersion":1,"testimonials":['}], ['empty body', {status: 200, body: ''}]]){
      dataOverride = override;
      const r = await open('/why-classbuster.html');
      check(label + ': no cards, section hidden, no uncaught errors', r.state.cards === 0 && r.state.hidden === true && r.errors.length === 0);
    }
    dataOverride = null;

    const linkStatus = await (async () => {
      const page = await browser.newPage();
      await page.goto(origin + '/why-classbuster.html', {waitUntil: 'domcontentloaded'});
      const statuses = await page.evaluate(async () => {
        const urls = [...new Set([...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href').split('#')[0]))];
        return Promise.all(urls.map(u => fetch(u).then(r => [u, r.status])));
      });
      await page.close();
      return statuses;
    })();
    check('every same-origin link on the live page returns 200', linkStatus.length > 3 && linkStatus.every(([, s]) => s === 200));
  } finally {
    await browser.close();
    server.close();
  }
  return getFailures();
};
if(require.main === module) module.exports().then(f => process.exit(f ? 1 : 0));
