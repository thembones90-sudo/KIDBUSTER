'use strict';
// Visual pass 2026-10-16: generation summary (protocol · rating · length),
// mobile Generate bar, example-style placeholders, quiet privacy note.
const fs = require('fs');
const path = require('path');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-visual-pass.cjs ===');
  const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  if(!executablePath){ console.log('  SKIP  no local Chrome/Edge'); return 0; }
  const browser = await require('puppeteer').launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  const url = 'file://' + path.join(__dirname, '..', 'index.html');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try{
    console.log('\n1) desktop summary line');
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url);
    await sleep(300);
    const before = await page.evaluate(() => {
      const line = document.getElementById('generateSummary');
      const r = line.getBoundingClientRect();
      return { text: line.textContent, hasPick: !!line.querySelector('button'), inView: r.top >= 0 && r.bottom <= innerHeight };
    });
    check('summary names the protocol and asks for a rating when none is picked', before.text.startsWith('Classic') && before.hasPick);
    check('summary is visible above the fold on a 1440x900 desktop', before.inView);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#ratingTrack button, #ratingTrack [data-value]')].find(x => /^4$/.test(x.textContent.trim())); b && b.click(); });
    await sleep(150);
    const after = await page.evaluate(() => document.getElementById('generateSummary').textContent);
    check('summary shows the chosen rating and length', /Classic · 4★ · Long/.test(after));
    await page.click('input[name="protocol"][value="FAIRY"]'); await sleep(200);
    check('summary follows a protocol change', (await page.evaluate(() => document.getElementById('generateSummary').textContent)).startsWith('Fairy'));
    const bar = await page.evaluate(() => getComputedStyle(document.getElementById('mobileGenerateBar')).display);
    check('mobile Generate bar never shows on desktop', bar === 'none');
    const styles = await page.evaluate(() => ({
      remarks: document.getElementById('specialRemarks').placeholder,
      noteFont: getComputedStyle(document.querySelector('.small-note')).fontFamily,
      noteColor: getComputedStyle(document.querySelector('.small-note')).color
    }));
    check('special remarks placeholder reads as an example', styles.remarks.startsWith('e.g.'));
    check('privacy note is no longer monospace or bright white', !/mono/i.test(styles.noteFont) && styles.noteColor !== 'rgb(255, 255, 255)');
    check('no page errors on desktop', errors.length === 0);
    await page.close();

    console.log('\n2) mobile Generate bar');
    const m = await browser.newPage();
    const mErrors = []; m.on('pageerror', e => mErrors.push(e.message));
    await m.setViewport({ width: 390, height: 844, isMobile: true });
    await m.goto(url);
    await m.evaluate(() => localStorage.clear()); // drop the desktop page's saved draft
    await m.reload();
    await sleep(400);
    const top = await m.evaluate(() => {
      const bar = document.getElementById('mobileGenerateBar');
      return { hidden: bar.hidden, display: getComputedStyle(bar).display, summary: document.getElementById('mobileGenerateSummary').textContent,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    check('bar is shown at the top of the page on a phone', !top.hidden && top.display === 'flex');
    check('bar names the protocol and rating state', top.summary === 'Classic · no rating yet');
    check('bar causes no horizontal overflow', !top.overflow);
    const pressed = await m.evaluate(async () => {
      let clicks = 0; const main = document.getElementById('generateBtn');
      main.addEventListener('click', e => { clicks++; e.stopImmediatePropagation(); }, { capture: true, once: true });
      document.getElementById('mobileGenerateBtn').click();
      return clicks;
    });
    check('bar presses the real Generate button (same validation and flow)', pressed === 1);
    await m.evaluate(() => document.getElementById('generateBtn').scrollIntoView({ block: 'center' }));
    await sleep(400);
    check('bar hides while the real Generate button is on screen', await m.evaluate(() => document.getElementById('mobileGenerateBar').hidden));
    await m.evaluate(() => { window.scrollTo(0, 0); document.getElementById('generateBtn').disabled = true; });
    await sleep(400);
    check('bar mirrors the disabled (generating) state', await m.evaluate(() => document.getElementById('mobileGenerateBtn').disabled));
    check('no page errors on mobile', mErrors.length === 0);
  }finally{
    await browser.close();
  }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
