'use strict';
// Browser regression for the optional testimonial invitation (2026-11-02):
// confirmed feedback save -> invitation; all ratings; bug reports skipped;
// stored:false and failures never invite; Escape/Not now dismissal with a
// persisted, content-free frequency cap; editable draft; consent required;
// idempotent retry after a failure; focus trap and return; mobile fit; and
// unchanged fitted-workspace geometry.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url');
module.exports = async function(){
  const browser = await require('puppeteer').launch({ headless: true, executablePath: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync), args: ['--no-sandbox'] });
  const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
  const STORE = 'classbuster.testimonialInvite.v1';
  try{
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    async function open(prefs){
      await page.goto(url);
      await page.evaluate((STORE, prefs) => {
        localStorage.setItem('kidbuster_access_key', 'synthetic-testimonial-test');
        if(prefs) localStorage.setItem(STORE, JSON.stringify(prefs)); else localStorage.removeItem(STORE);
        window.fbStored = true; window.tpMode = 'ok'; window.fbRequests = []; window.tpRequests = [];
        window.fetch = async (u, o) => {
          if(u === '/api/feedback'){ window.fbRequests.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ status: 'ok', stored: window.fbStored, feedbackId: 41, sheet: 'not_configured' }) }; }
          if(u === '/api/feedback?kind=testimonial'){
            window.tpRequests.push({ headers: o.headers, body: JSON.parse(o.body) });
            if(window.tpMode === 'fail') return { ok: false, status: 503, json: async () => ({ error: 'Could not save your story right now' }) };
            return { ok: true, json: async () => ({ status: 'received_private', id: 9, duplicate: false, published: false }) };
          }
          return { ok: false, status: 404, json: async () => ({}) };
        };
        showFeedbackCard('MA', '4', null, null, '0123456789abcdef');
      }, STORE, prefs || null);
    }
    const geometry = () => page.evaluate(() => { const w = document.querySelector('.wrap'); const r = w.getBoundingClientRect(); return [w.style.zoom, r.width, r.height, r.left].join('|'); });
    const visible = () => page.evaluate(() => { const o = document.getElementById('testimonialInviteOverlay'); return !!o && !o.hidden; });
    async function rate(score, comment){
      await page.click('#feedbackStars button[data-score="' + score + '"]');
      if(comment) await page.type('#feedbackComment', comment);
      await page.click('#feedbackSubmitBtn');
      await page.waitForFunction(() => document.getElementById('feedbackStatus').classList.contains('sent'));
    }
    const settle = () => page.evaluate(() => new Promise(r => setTimeout(r, 600)));
    const prefs = () => page.evaluate(STORE => JSON.parse(localStorage.getItem(STORE) || '{}'), STORE);

    // 1) Low rating still invites; feedback is saved first; geometry unchanged.
    await open();
    await rate(2, 'Helpful, though the reports run a little long');
    const before = await geometry(); // measured before the deferred invitation opens
    assert.equal(await page.evaluate(() => window.fbRequests.length), 1, 'feedback saved before any invitation');
    await page.waitForFunction(() => { const o = document.getElementById('testimonialInviteOverlay'); return o && !o.hidden; });
    const dlg = await page.$eval('#testimonialInviteOverlay [role="dialog"]', d => ({ modal: d.getAttribute('aria-modal'), label: document.getElementById(d.getAttribute('aria-labelledby')).textContent }));
    assert.equal(dlg.modal, 'true');
    assert.equal(dlg.label, 'Help other teachers discover Classbuster');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tiShareBtn', 'focus moves into the dialog');
    assert.equal(await page.$eval('#tiShareBtn', e => e.textContent), 'Share my story');
    assert.equal(await page.$eval('#tiNotNowBtn', e => e.textContent), 'Not now');
    assert.equal(await geometry(), before, 'workspace geometry unchanged with invitation open');
    // Focus trap: Tab and Shift+Tab never leave the dialog.
    for(let i = 0; i < 6; i++){ await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.getElementById('testimonialInviteOverlay').contains(document.activeElement)), 'Tab stays inside'); }
    await page.keyboard.down('Shift'); for(let i = 0; i < 6; i++){ await page.keyboard.press('Tab'); assert.ok(await page.evaluate(() => document.getElementById('testimonialInviteOverlay').contains(document.activeElement)), 'Shift+Tab stays inside'); } await page.keyboard.up('Shift');
    // Escape = immediate, non-punitive Not now.
    await page.keyboard.press('Escape');
    assert.equal(await visible(), false, 'Escape closes immediately');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'feedbackComment', 'focus returns to the feedback area');
    let p = await prefs();
    assert.equal(p.notNow, 1); assert.ok(p.lastShown > 0);
    assert.deepEqual(Object.keys(p).sort(), ['lastShown', 'notNow', 'sentAt'], 'preference stores no content');
    assert.equal(await page.evaluate(() => window.tpRequests.length), 0, 'dismissal sends nothing');
    assert.equal(await geometry(), before, 'workspace geometry unchanged after close');
    // Same page, another rating: never re-invited (idempotent per page).
    await rate(5, 'Great');
    await settle();
    assert.equal(await visible(), false, 'no second invitation in the same page');

    // 2) Persisted frequency cap across reloads.
    await open({ lastShown: Date.now() - 2 * 86400000, notNow: 1, sentAt: 0 });
    await rate(5); await settle();
    assert.equal(await visible(), false, 'rests for 21 days after Not now');
    await open({ lastShown: Date.now() - 30 * 86400000, notNow: 3, sentAt: 0 });
    await rate(5); await settle();
    assert.equal(await visible(), false, 'three Not now answers rest for 180 days');
    await open({ lastShown: Date.now() - 30 * 86400000, notNow: 0, sentAt: Date.now() - 30 * 86400000 });
    await rate(5); await settle();
    assert.equal(await visible(), false, 'no invitation after a story was sent');

    // 3) Never invited for a bug report or an unconfirmed save.
    await open();
    await page.click('#feedbackTabs button[data-category="bug"]');
    await page.type('#feedbackComment', 'Copy button did nothing');
    await page.click('#feedbackSubmitBtn');
    await page.waitForFunction(() => document.getElementById('feedbackStatus').classList.contains('sent'));
    await settle();
    assert.equal(await visible(), false, 'bug reports are not followed by an invitation');
    await open();
    await page.evaluate(() => { window.fbStored = false; });
    await rate(4); await settle();
    assert.equal(await visible(), false, 'stored:false never invites');

    // 4) Share my story: editable draft, consent, failure then idempotent retry.
    await open();
    await rate(3, 'Saves me about an hour a day on reports');
    const before4 = await geometry();
    await page.waitForFunction(() => { const o = document.getElementById('testimonialInviteOverlay'); return o && !o.hidden; });
    await page.click('#tiShareBtn');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tiStory');
    assert.equal(await page.$eval('#tiStory', e => e.value), 'Saves me about an hour a day on reports', 'comment offered as an editable draft');
    assert.match(await page.$eval('#tiPrivacy', e => e.textContent), /not published[\s\S]*not sent to analytics[\s\S]*student names/);
    await page.$eval('#tiStory', e => { e.value = ''; });
    await page.type('#tiStory', 'Classbuster gives me back an hour every teaching day.');
    await page.click('#tiSendBtn');
    assert.match(await page.$eval('#tiStatus', e => e.textContent), /tick the box/);
    assert.equal(await page.evaluate(() => window.tpRequests.length), 0, 'nothing sent without contact permission');
    await page.click('#tiConsent');
    await page.evaluate(() => { window.tpMode = 'fail'; });
    await page.click('#tiSendBtn');
    await page.waitForFunction(() => document.getElementById('tiStatus').classList.contains('ti-error') && /not sent/.test(document.getElementById('tiStatus').textContent));
    assert.equal(await page.$eval('#tiDoneStep', e => e.hidden), true, 'failure never shows success');
    assert.equal((await prefs()).sentAt, 0, 'failure does not record a sent story');
    assert.equal(await page.$eval('#tiStory', e => e.value), 'Classbuster gives me back an hour every teaching day.', 'draft kept for retry');
    await page.evaluate(() => { window.tpMode = 'ok'; });
    await page.click('#tiSendBtn');
    await page.waitForFunction(() => !document.getElementById('tiDoneStep').hidden);
    const sent = await page.evaluate(() => window.tpRequests.map(r => r.body));
    assert.equal(sent.length, 2);
    assert.match(sent[0].proposalId, /^[a-f0-9]{16}$/);
    assert.equal(sent[1].proposalId, sent[0].proposalId, 'retry reuses the proposal id (server idempotence)');
    assert.equal(sent[1].story, 'Classbuster gives me back an hour every teaching day.', 'edited text is what is sent');
    assert.equal(sent[1].feedbackId, 41); assert.equal(sent[1].contactOk, true);
    assert.equal(await page.evaluate(() => window.tpRequests[1].headers['x-app-key']), 'synthetic-testimonial-test', 'authenticated request');
    assert.match(await page.$eval('#tiDoneText', e => e.textContent), /sent privately[\s\S]*Nothing will be published/);
    assert.ok((await prefs()).sentAt > 0);
    assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('hour every teaching day'), 'story is never stored in the browser');
    await page.keyboard.press('Escape');
    assert.equal(await visible(), false);
    assert.equal(await page.$eval('#tiStory', e => e.value), '', 'draft dropped from memory on close');
    assert.equal(await geometry(), before4, 'workspace geometry unchanged after the full flow');

    // 5) Not now button and mobile layout.
    for(const width of [390, 320]){
      await page.setViewport({ width, height: 760 });
      await open();
      await rate(1, 'Not great today');
      await page.waitForFunction(() => { const o = document.getElementById('testimonialInviteOverlay'); return o && !o.hidden; });
      await page.click('#tiShareBtn');
      const box = await page.$eval('#testimonialInviteOverlay .ti-dialog', d => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, fits: d.scrollWidth <= d.clientWidth + 1 }; });
      assert.ok(box.l >= 0 && box.r <= width && box.fits, 'dialog fits ' + width);
      for(const id of ['tiSendBtn', 'tiDiscardBtn', 'tiCloseBtn']) assert.ok(await page.$eval('#' + id, e => e.offsetHeight >= 44), id + ' is a 44px target at ' + width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.click('#tiDiscardBtn');
      assert.equal(await visible(), false, 'Discard closes immediately');
      assert.equal(await page.evaluate(() => window.tpRequests.length), 0, 'Discard sends nothing');
    }
    console.log('PASS testimonial invitation: confirmed-save trigger, all ratings, frequency cap, dismissal, editable draft, consent, idempotent retry, focus trap, mobile and unchanged geometry');
    return 0;
  }finally{ await browser.close(); }
};
if(require.main === module) module.exports().catch(e => { console.error(e); process.exitCode = 1; });
