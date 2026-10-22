'use strict';
const path = require('path');
const { createChecker } = require('./helpers/assert.cjs');

/**
 * Loads the REAL index.html in an actual headless browser and drives it
 * like a person would — this exists specifically because every other
 * test file in this suite extracts and tests pure logic (KidbusterCore,
 * the usage-stats block) without ever loading the page itself. That
 * approach is fast and reliable for prompt/validator logic, but it can
 * never catch a bug in the surrounding UI wiring itself — which is
 * exactly what happened once: a `const copyBtn` declared AFTER the
 * function that referenced it created a temporal-dead-zone ReferenceError
 * that silently crashed the rest of the script's top-level execution on
 * every page load. Every protocol's theme CSS variable (driven by a
 * JS-independent `:has()` fallback) kept working and looked fine, which
 * is exactly why it went unnoticed — but the Generate button's own
 * gradient (which has no such fallback) stayed stuck on the default
 * green for every protocol, and the header badge text never updated
 * again after the very first page load. No prompt/validator test could
 * ever have caught that; only actually loading the page can.
 */
const fs = require('fs');

/**
 * Returns { puppeteer, launchOptions }. Prefers a real installed
 * `puppeteer` (added as a devDependency — manages its own downloaded
 * Chromium, no extra config needed). Falls back to the copy bundled with
 * a globally-installed @mermaid-js/mermaid-cli if that's the only one
 * available (as it was in the environment this was originally written
 * in) — that fallback needs an explicit executablePath since it doesn't
 * necessarily manage its own browser cache the same way.
 */
function loadPuppeteer(){
  try {
    const puppeteer = require('puppeteer');
    const installedBrowsers = process.platform === 'win32' ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ] : [];
    const executablePath = installedBrowsers.find(p => fs.existsSync(p));
    return { puppeteer, launchOptions: executablePath ? { executablePath } : {} };
  } catch (e) {
    const fallbackModulePath = '/usr/local/lib/node_modules_global/@mermaid-js/mermaid-cli/node_modules/puppeteer';
    const puppeteer = require(fallbackModulePath); // absolute path — bypasses mermaid-cli's package.json "exports" map, which blocks a deep subpath require() by name
    const cacheDirsToCheck = [
      `${process.env.HOME || ''}/.cache/puppeteer/chrome`,
      '/root/.cache/puppeteer/chrome',
      '/home/claude/.cache/puppeteer/chrome'
    ];
    const candidateChromePaths = [];
    cacheDirsToCheck.forEach(dir => {
      if(fs.existsSync(dir)){
        fs.readdirSync(dir).forEach(v => candidateChromePaths.push(`${dir}/${v}/chrome-linux64/chrome`));
      }
    });
    const executablePath = candidateChromePaths.find(p => fs.existsSync(p));
    if(!executablePath){
      throw new Error('found a bundled puppeteer but no downloaded Chrome binary alongside it');
    }
    return { puppeteer, launchOptions: { executablePath } };
  }
}

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-browser-smoke.cjs ===');

  let puppeteer, launchOptions;
  try {
    ({ puppeteer, launchOptions } = loadPuppeteer());
  } catch (e) {
    console.log('  SKIPPED — no usable puppeteer + Chrome install found in this environment (' + e.message + ').');
    console.log('  This is the one test file that requires an actual browser; every other file in');
    console.log('  this suite still runs and covers the app\'s logic without it.');
    return 0; // don't fail the whole suite just because this optional browser test can't run here
  }

  const indexPath = 'file://' + path.join(__dirname, '..', 'index.html');
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], ...launchOptions });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto(indexPath);
  await page.evaluate(() => {
    try{ localStorage.removeItem(ACCESS_KEY_STORAGE); }catch(e){ /* ignore */ }
  });
  await new Promise(r => setTimeout(r, 150));

  console.log('\n1) Page loads with zero uncaught JavaScript errors');
  check('no page errors on initial load', pageErrors.length === 0);
  if(pageErrors.length){ console.log('    errors seen:', pageErrors); }
  const accountFlow=await page.evaluate(()=>{
    localStorage.removeItem(ACCESS_KEY_STORAGE);
    document.getElementById('accountBtn').click();
    const newcomer=getComputedStyle(document.getElementById('licenseModalOverlay')).display!=='none'&&getComputedStyle(document.getElementById('accountPanel')).display==='none';
    document.getElementById('licenseModalCloseBtn').click();
    localStorage.setItem(ACCESS_KEY_STORAGE,'synthetic-account-ui');
    document.getElementById('accountBtn').click();
    const returning=getComputedStyle(document.getElementById('accountPanel')).display!=='none'&&!document.querySelector('.account-support').open;
    document.getElementById('accountSignOutBtn').click();
    return {newcomer,returning,signedOut:!localStorage.getItem(ACCESS_KEY_STORAGE)&&getComputedStyle(document.getElementById('accountPanel')).display==='none'};
  });
  check('Account routes newcomers to sign-in, collapses support details, and signs out locally',accountFlow.newcomer&&accountFlow.returning&&accountFlow.signedOut);
  const fonts = await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('700 22px Manrope'),
      document.fonts.load('400 16px Inter'),
      document.fonts.load('600 12px "JetBrains Mono"')
    ]);
    return {
      manrope: document.fonts.check('700 22px Manrope'),
      inter: document.fonts.check('400 16px Inter'),
      mono: document.fonts.check('600 12px "JetBrains Mono"'),
      externalGoogleImport: [...document.styleSheets].some(sheet => String(sheet.href || '').includes('fonts.googleapis.com'))
    };
  });
  check('Manrope, Inter, and JetBrains Mono load from the local font bundle',fonts.manrope&&fonts.inter&&fonts.mono&&!fonts.externalGoogleImport);

  console.log('\n1a) V2 workflow onboarding lives in Help, not the workspace');
  {
    const workflow=await page.evaluate(()=>({
      title:document.getElementById('helpModalTitle')?.textContent||'',
      steps:document.querySelectorAll('.first-guide-step').length,
      workspaceStrips:document.querySelectorAll('.experience-bar').length,
      zoom:getComputedStyle(document.body).zoom
    }));
    check('onboarding workflow lives in Help and leaves workspace clear',workflow.title.includes('first report')&&workflow.steps===3&&workflow.workspaceStrips===0);
    check('global browser zoom hack is removed',workflow.zoom==='1');
    await page.setViewport({width:390,height:844,deviceScaleFactor:1});
    const mobile=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
    check('390px mobile layout has no horizontal overflow',mobile.scroll===mobile.client);
    for(const width of [768,900,980]){
      await page.setViewport({width,height:844,deviceScaleFactor:1});
      const tablet=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
      check(width+'px tablet layout has no horizontal overflow',tablet.scroll===tablet.client);
    }
    const onboardingText=await page.evaluate(()=>({
      promise:parseFloat(getComputedStyle(document.querySelector('.first-guide-intro p')).fontSize),
      label:parseFloat(getComputedStyle(document.querySelector('.first-guide-step strong')).fontSize),
      detail:parseFloat(getComputedStyle(document.querySelector('.first-guide-step p')).fontSize)
    }));
    check('onboarding instructions use readable font sizes',onboardingText.promise>=13&&onboardingText.label>=13&&onboardingText.detail>=13);
    const details=await page.evaluate(()=>({
      protocolFont:parseFloat(getComputedStyle(document.querySelector('.protocol-select')).fontSize),
      hintFont:parseFloat(getComputedStyle(document.querySelector('.field-hint')).fontSize),
      recoveryNoteFont:parseFloat(getComputedStyle(document.querySelector('.license-modal-step-note')).fontSize),
      focusOutline:getComputedStyle(document.querySelector('.info-icon'),':focus-visible').outlineStyle
    }));
    check('protocol selector labels use at least 15px text',details.protocolFont>=15);
    const armory=await page.evaluate(()=>({
      protocolCards:document.querySelectorAll('#protocolSelect>label').length,
      lengthTiles:document.querySelectorAll('#lengthFormatSelect>label').length,
      protocolDisplay:getComputedStyle(document.getElementById('protocolSelect')).display,
      lengthDisplay:getComputedStyle(document.getElementById('lengthFormatSelect')).display,
      helpLabel:document.getElementById('helpBtn').textContent.trim(),
      nativeRadios:document.querySelectorAll('#protocolSelect input[type="radio"][name="protocol"]').length
    }));
    check('protocol armory retains seven native radio cards',armory.protocolCards===7&&armory.nativeRadios===7&&armory.protocolDisplay==='grid');
    const balanced=await page.evaluate(()=>{const cards=[...document.querySelectorAll('#protocolSelect>label')];const preply=cards[6];const of=cards[5];const grid=getComputedStyle(document.getElementById('protocolSelect'));return {preplySpan:getComputedStyle(preply).gridColumnEnd,preplyWidth:Math.round(preply.getBoundingClientRect().width),gridWidth:Math.round(document.getElementById('protocolSelect').getBoundingClientRect().width),ofTitle:of.textContent.replace('?', '').trim(),columns:grid.gridTemplateColumns.split(' ').length}});
    check('seven protocols form a balanced 2-2-2-1 card layout',balanced.columns===2&&balanced.preplyWidth>=balanced.gridWidth-2);
    check('Lingo Ace has a compact visible title',balanced.ofTitle==='Lingo Ace');
    check('report-length armory retains three native radio tiles',armory.lengthTiles===3&&armory.lengthDisplay==='grid');
    check('amber onboarding entry is clearly labeled',armory.helpLabel==='New here? Start here');
    const onboarding=await page.evaluate(async()=>{
      localStorage.removeItem(HELP_COMPLETED_KEY);
      updateHelpButton(false);
      openHelpModal();closeHelpModal();
      const dismissed=localStorage.getItem(HELP_COMPLETED_KEY)===null&&helpEls.btn.textContent==='New here? Start here';
      openHelpModal();document.getElementById('firstGuideStart').click();
      const completed=localStorage.getItem(HELP_COMPLETED_KEY)==='1'&&helpEls.btn.textContent==='Help & guide';
      openHelpModal();
      const accessible=getComputedStyle(helpEls.overlay).display!=='none';
      closeHelpModal();
      localStorage.removeItem(HELP_COMPLETED_KEY);updateHelpButton(false);
      return {dismissed,completed,accessible};
    });
    check('guide dismissal preserves newcomer mode; explicit completion saves it and keeps Help available',onboarding.dismissed&&onboarding.completed&&onboarding.accessible);
    for(const [fitWidth,fitHeight] of [[1400,900],[1280,800],[1280,720],[900,800],[390,844]]){
      await page.setViewport({width:fitWidth,height:fitHeight,deviceScaleFactor:1});
      await page.reload({waitUntil:'domcontentloaded'});
      const fit=await page.evaluate(()=>({
        pageWidth:document.documentElement.scrollWidth,
        zoom:parseFloat(getComputedStyle(document.querySelector('.wrap')).zoom),
        ratingExists:document.getElementById('ratingTrack').getBoundingClientRect().height>0,
        sidebarWidth:document.querySelector('.grid>div:first-child').getBoundingClientRect().width,
        viewport:innerWidth
      }));
      check('native size and unclipped layout at '+fitWidth+'x'+fitHeight,fit.zoom===1&&fit.pageWidth<=fitWidth+1&&fit.ratingExists&&fit.sidebarWidth<=fit.viewport);
    }
    await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
    await page.reload({waitUntil:'domcontentloaded'});
    const cardColors=await page.evaluate(()=>[...document.querySelectorAll('#protocolSelect>label')].map(e=>getComputedStyle(e).backgroundColor));
    check('all seven protocol cards have individualized tints',new Set(cardColors).size===7);
    check('workspace field hints use at least 14px text',details.hintFont>=14);
    check('payment recovery instructions use at least 14px text',details.recoveryNoteFont>=14);
    const polish=await page.evaluate(()=>({
      placeholder:getComputedStyle(document.querySelector('#krispNotes'),'::placeholder').color,
      counter:parseFloat(getComputedStyle(document.querySelector('#krispCounter')).fontSize),
      note:parseFloat(getComputedStyle(document.querySelector('.small-note')).fontSize),
      logo:document.querySelector('.kb-logo').getBoundingClientRect().height,
      onboardingAlign:getComputedStyle(document.querySelector('.first-guide-steps')).display
    }));
    check('notes placeholder uses intentionally legible styling',polish.placeholder==='rgb(174, 184, 195)');
    check('counter and output guidance remain readable',polish.counter>=13&&polish.note>=13);
    check('Pathfinder logo is visible',polish.logo>=44);
    check('onboarding guide retains its structured learning steps',polish.onboardingAlign!=='none');
    await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
  }

  console.log('\n1b) Pathfinder logo acts as a real reload/reset button');
  {
    const clickResult = await page.evaluate(() => {
      window.__kidbusterReloadCalled = false;
      window.__kidbusterReloadForTests = () => { window.__kidbusterReloadCalled = true; };
      const logo = document.getElementById('kbLogo');
      logo.click();
      return {
        reloadCalled: window.__kidbusterReloadCalled === true,
        role: logo.getAttribute('role'),
        tabindex: logo.getAttribute('tabindex'),
        aria: logo.getAttribute('aria-label'),
        title: logo.getAttribute('title')
      };
    });
    check('logo click triggers the reload/reset path', clickResult.reloadCalled === true);
    check(
      'logo is exposed as an accessible reload button',
      clickResult.role === 'button' &&
      clickResult.tabindex === '0' &&
      clickResult.aria === 'Reload Classbuster' &&
      clickResult.title === 'Reload Classbuster'
    );

    const keyResult = await page.evaluate(() => {
      window.__kidbusterReloadCalled = false;
      const logo = document.getElementById('kbLogo');
      logo.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true }));
      const enterReloaded = window.__kidbusterReloadCalled === true;
      window.__kidbusterReloadCalled = false;
      logo.dispatchEvent(new KeyboardEvent('keydown', { key:' ', bubbles:true }));
      const spaceReloaded = window.__kidbusterReloadCalled === true;
      delete window.__kidbusterReloadForTests;
      return { enterReloaded, spaceReloaded };
    });
    check('logo reload supports Enter and Space', keyResult.enterReloaded && keyResult.spaceReloaded);
  }

  console.log('\n2) Every protocol correctly sets its own body class AND its own button gradient — not just its :has()-driven panel colors');
  console.log('\n1c) Classbuster Help replays onboarding, with the detailed guide one click away');
  await page.click('#helpBtn');
  await new Promise(r=>setTimeout(r,80));
  const guideOpen=await page.evaluate(()=>({
    tour: !document.getElementById('classbusterOnboardingOverlay').hidden,
    heading: document.getElementById('cbOnboardingTitle').textContent,
    oldClosed: getComputedStyle(document.getElementById('helpModalOverlay')).display==='none'
  }));
  check('Help button opens exactly the new onboarding guide', guideOpen.tour&&guideOpen.oldClosed&&guideOpen.heading==='Welcome to Classbuster');
  await page.click('#cbOnboardingNext');
  check('new guide explains the basic three-step workflow',await page.$eval('#cbOnboardingBody',el=>['Choose a style','Add lesson notes','Generate and review'].every(t=>el.textContent.includes(t))));
  await page.click('#cbFullHelpGuide');
  const detailed=await page.evaluate(()=>{const el=document.getElementById('helpModalOverlay');return getComputedStyle(el).display!=='none'&&el.textContent.includes('Manage billing')&&el.textContent.includes('PayPal')});
  check('original full detailed guide stays accessible',detailed);
  await page.click('#helpModalCloseBtn');
  check('detailed guide closes from its button',await page.$eval('#helpModalOverlay',el=>getComputedStyle(el).display==='none'));
  await page.click('#helpBtn');
  await page.keyboard.press('Escape');
  check('new Help tour closes with Escape',await page.$eval('#classbusterOnboardingOverlay',el=>el.hidden));
  await page.click('#helpBtn');
  await page.click('#cbOnboardingClose');
  check('visible X closes onboarding',await page.$eval('#classbusterOnboardingOverlay',el=>el.hidden));
  await page.click('#helpBtn');
  await page.$eval('#classbusterOnboardingOverlay',el=>el.click());
  check('clicking tour backdrop closes onboarding',await page.$eval('#classbusterOnboardingOverlay',el=>el.hidden));
  const protocols = [
    { value: 'MA',    bodyClass: null, label: 'Classic' }, // MA is the default theme — no body class of its own
    { value: 'MS',    bodyClass: 'protocol-ms', label: 'Sugarcoat' },
    { value: 'FAIRY', bodyClass: 'protocol-fairy', label: 'Fairy' },
    { value: 'BLITZ', bodyClass: 'protocol-blitz', label: 'BLITZ', hasBolt: true },
    { value: 'BEIDA', bodyClass: 'protocol-beida', label: 'Beida 🦁' },
    { value: 'OF',    bodyClass: 'protocol-of', label: 'Lingo Ace (Trial Evaluation)' }
  ];

  const seenBackgrounds = new Set();
  for(const proto of protocols){
    await page.click(`input[name="protocol"][value="${proto.value}"]`);
    await new Promise(r => setTimeout(r, 80));

    const result = await page.evaluate(() => {
      const btn = document.querySelector('.generate-btn');
      return {
        bodyClassList: Array.from(document.body.classList),
        background: getComputedStyle(btn).backgroundImage,
        badgeText: document.getElementById('protocolBadge').textContent,
        hasBolt: Boolean(document.querySelector('#protocolBadge .blitz-bolt'))
      };
    });

    if(proto.bodyClass){
      check(proto.value + ': body has "' + proto.bodyClass + '" class', result.bodyClassList.includes(proto.bodyClass));
    }else{
      check(proto.value + ': body has no protocol-specific class (uses the default theme)', result.bodyClassList.every(c => !c.startsWith('protocol-')));
    }
    check(proto.value + ': header badge text updates to match ("' + proto.label + '")', result.badgeText.includes(proto.label));
    if(proto.hasBolt){
      check(proto.value + ': header badge includes the Blitz bolt image', result.hasBolt);
    }
    check(proto.value + ": Generate button's own background is a genuinely distinct gradient, not stuck on another theme's", proto.sharesThemeWith || !seenBackgrounds.has(result.background));
    seenBackgrounds.add(result.background);
  }

  console.log('\n3) License modal: shows Pro/Free/existing-key paths, validates client-side, stores a pasted key without needing a live backend');
  {
    await page.evaluate(() => {
      window.fetch = async (url, options = {}) => {
        if(String(url).includes('/api/create-checkout-session')){
          return new Response(JSON.stringify({
            url: window.location.href.split('#')[0] + '#checkout',
            licenseKey: 'kb_live_checkout_saved'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        // Pasted keys are now verified before sign-in: one active, one rejected.
        if(String(url).includes('/api/license-status')){
          const key = (options.headers || {})['x-app-key'];
          const active = key === 'kb_live_test_pasted_key';
          return new Response(JSON.stringify(active ? { status:'active', plan:'free' } : { error:'This access key is not active or was not recognized.' }),
            { status: active ? 200 : 404, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error('Unexpected browser-smoke fetch: ' + url);
      };
    });

    const modalShown = await page.evaluate(() => {
      window.__testModalPromise = promptForAccessKey();
      const overlay = document.getElementById('licenseModalOverlay');
      return {
        visible: getComputedStyle(overlay).display !== 'none',
        title: overlay.querySelector('.license-modal-title').textContent,
        hasPro: !!document.getElementById('licenseModalProBtn'),
        hasFree: !!document.getElementById('licenseModalFreeBtn'),
        hasProviderPaymentCopy: overlay.textContent.includes('PayPal') && overlay.textContent.includes('Lemon Squeezy'),
        hasDirectPaypal: !!document.getElementById('licenseModalPaypalBtn'),
        hasKey: !!document.getElementById('licenseModalKeyBtn'),
        hasRecover: !!document.getElementById('licenseModalRecoverBtn'),
        recoverLabel: document.getElementById('licenseModalRecoverBtnLabel')?.textContent || '',
        keyButtonLabel: document.getElementById('licenseModalKeyBtn')?.textContent || ''
      };
    });
    check('calling promptForAccessKey() shows the modal', modalShown.visible);
    check(
      'modal shows the simplified access choices',
      modalShown.title === 'Choose how to continue' &&
      modalShown.hasPro &&
      modalShown.hasFree &&
      modalShown.hasProviderPaymentCopy &&
      !modalShown.hasDirectPaypal &&
      modalShown.hasKey &&
      modalShown.hasRecover &&
      modalShown.recoverLabel === 'Email sign-in link' &&
      modalShown.keyButtonLabel === 'Use key'
    );

    check('PayPal is offered only through the automated Lemon Squeezy checkout path',
      modalShown.hasProviderPaymentCopy && !modalShown.hasDirectPaypal);

    await page.click('.license-modal-section.pro > .license-modal-choice');
    await page.click('#licenseModalProBtn');
    await new Promise(r => setTimeout(r, 80));
    const emptyProEmailError = await page.evaluate(() => {
      const err = document.getElementById('licenseModalError');
      return { visible: err.style.display !== 'none', text: err.textContent };
    });
    check('empty Pro checkout email -> client-side validation error shown, no crash', emptyProEmailError.visible && emptyProEmailError.text.includes('checkout'));

    await page.type('#licenseModalProEmail', 'buyer@example.com');
    await page.click('#licenseModalProBtn');
    await new Promise(r => setTimeout(r, 80));
    const checkoutKeySaved = await page.evaluate(() => localStorage.getItem(ACCESS_KEY_STORAGE));
    check('Pro checkout stores the generated key before redirecting to the provider', checkoutKeySaved === 'kb_live_checkout_saved');

    // Clicking "Get my free key" with no email entered should show a
    // client-side validation error WITHOUT attempting any network call
    // (there's no live backend for this file:// test to talk to).
    await page.click('.license-modal-section.primary > .license-modal-choice');
    await page.click('#licenseModalFreeBtn');
    await new Promise(r => setTimeout(r, 80));
    const emptyEmailError = await page.evaluate(() => {
      const err = document.getElementById('licenseModalError');
      return { visible: err.style.display !== 'none', text: err.textContent };
    });
    check('empty email -> client-side validation error shown, no crash', emptyEmailError.visible && emptyEmailError.text.length > 0);

    await page.click('.license-modal-section:not(.primary):not(.pro) > .license-modal-choice');
    await page.click('#licenseModalRecoverBtn');
    await new Promise(r => setTimeout(r, 80));
    const emptyRecoverEmailError = await page.evaluate(() => {
      const err = document.getElementById('licenseModalError');
      return { visible: err.style.display !== 'none', text: err.textContent };
    });
    check('empty recover email -> client-side validation error shown, no crash', emptyRecoverEmailError.visible && emptyRecoverEmailError.text.includes('email'));

    // A pasted key is verified with /api/license-status before sign-in. The
    // existing-key section may already be open; never toggle it shut.
    await page.evaluate(() => { const d = document.querySelector('.license-modal-advanced'); if(d) d.open = true; });
    await page.type('#licenseModalKeyInput', 'kb_live_rejected_key');
    await page.click('#licenseModalKeyBtn');
    await new Promise(r => setTimeout(r, 120));
    const rejectedPaste = await page.evaluate(() => {
      const err = document.getElementById('licenseModalError');
      let stored = null; try{ stored = localStorage.getItem(ACCESS_KEY_STORAGE); }catch(e){}
      return { errorVisible: err.style.display !== 'none' && /not active|not recognized/i.test(err.textContent),
        overlayOpen: getComputedStyle(document.getElementById('licenseModalOverlay')).display !== 'none', stored };
    });
    check('a rejected pasted key shows an error and does not sign in', rejectedPaste.errorVisible && rejectedPaste.overlayOpen && rejectedPaste.stored !== 'kb_live_rejected_key');
    await page.evaluate(() => { document.getElementById('licenseModalKeyInput').value = ''; });
    await page.type('#licenseModalKeyInput', 'kb_live_test_pasted_key');
    await page.click('#licenseModalKeyBtn');
    await new Promise(r => setTimeout(r, 120));

    const afterPaste = await page.evaluate(async () => {
      const resolvedKey = await window.__testModalPromise;
      const overlay = document.getElementById('licenseModalOverlay');
      let stored = null;
      try{ stored = localStorage.getItem(ACCESS_KEY_STORAGE); }catch(e){ /* ignore */ }
      return {
        resolvedKey,
        overlayHidden: getComputedStyle(overlay).display === 'none',
        stored
      };
    });
    check('promptForAccessKey() resolves with the pasted key', afterPaste.resolvedKey === 'kb_live_test_pasted_key');
    check('modal hides itself after a successful entry', afterPaste.overlayHidden);
    check('the key is persisted to localStorage under ACCESS_KEY_STORAGE', afterPaste.stored === 'kb_live_test_pasted_key');

    const checkoutPanel = await page.evaluate(() => {
      renderCheckoutSuccess('kb_live_checkout_visible');
      const key = document.getElementById('checkoutSuccessKey');
      const copyBtn = document.getElementById('checkoutCopyKeyBtn');
      const continueBtn = document.getElementById('checkoutContinueBtn');
      return {
        outputText: document.getElementById('outputBox').textContent,
        keyText: key ? key.textContent : '',
        hasCopy: Boolean(copyBtn),
        hasContinue: Boolean(continueBtn),
        continueText: continueBtn ? continueBtn.textContent : ''
      };
    });
    check('checkout success panel clearly shows the Pro access key', checkoutPanel.keyText === 'kb_live_checkout_visible' && checkoutPanel.outputText.includes('Your Pro key is ready'));
    check('checkout success panel offers Copy code and Continue to app actions', checkoutPanel.hasCopy && checkoutPanel.hasContinue && checkoutPanel.continueText === 'Continue to app');

    const feedbackFlow = await page.evaluate(async () => {
      const sent = [];
      const realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if(String(url).includes('/api/feedback')){ sent.push(JSON.parse(opts.body)); return new Response('{"status":"ok"}', { status: 200 }); }
        return realFetch(url, opts);
      };
      try{
        showFeedbackCard('MA', '4', null, null, '0123456789abcdef');
        const submit = document.getElementById('feedbackSubmitBtn');
        const tab = c => document.querySelector('.feedback-tab[data-category="' + c + '"]');
        const r = { tabs: document.querySelectorAll('.feedback-tab').length, disabledAtStart: submit.disabled };
        document.querySelector('.feedback-star[data-score="2"]').click();
        r.enabledAfterStar = !submit.disabled;
        submit.click(); await new Promise(res => setTimeout(res, 50));
        tab('bug').click();
        r.bugNeedsText = submit.disabled;
        const box = document.getElementById('feedbackComment');
        box.value = 'Copy button did nothing'; box.dispatchEvent(new Event('input'));
        r.bugEnabledWithText = !submit.disabled;
        submit.click(); await new Promise(res => setTimeout(res, 50));
        tab('idea').click();
        r.ideaHidesStars = getComputedStyle(document.getElementById('feedbackStarsRow')).display === 'none';
        r.sent = sent;
        return r;
      }finally{ window.fetch = realFetch; }
    });
    check('feedback card offers Rate report, Report a bug and Suggest an idea', feedbackFlow.tabs === 3);
    check('a quality rating needs a star before Submit is enabled', feedbackFlow.disabledAtStart && feedbackFlow.enabledAfterStar);
    check('a bug report needs a description before Submit is enabled', feedbackFlow.bugNeedsText && feedbackFlow.bugEnabledWithText);
    check('ideas hide the star row', feedbackFlow.ideaHidesStars);
    check('feedback carries the category and the report reference',
      feedbackFlow.sent.length === 2 && feedbackFlow.sent[0].category === 'quality' && feedbackFlow.sent[0].score === 2 &&
      feedbackFlow.sent[0].generationRef === '0123456789abcdef' && feedbackFlow.sent[1].category === 'bug' && feedbackFlow.sent[1].comment === 'Copy button did nothing');

    await page.click('#accountBtn');
    await new Promise(r => setTimeout(r, 120));
    const accountPanel = await page.evaluate(() => {
      const panel = document.getElementById('accountPanel');
      return {
        visible: getComputedStyle(panel).display !== 'none',
        keyText: document.getElementById('accountKey').textContent,
        planText: document.getElementById('accountPlan').textContent
      };
    });
    check('Access panel opens from the header', accountPanel.visible);
    check('Access panel shows the saved access code in masked form (last 4 only)', accountPanel.keyText === '••••_key');
    check('Access panel never shows the key prefix', !accountPanel.keyText.includes('kb_live'));
    check('Access panel renders a usable local/server status', accountPanel.planText.length > 0);

    const duplicateUx = await page.evaluate(async () => {
      let sentGenerationId = '';
      window.fetch = async (url, options = {}) => {
        if(String(url).includes('/api/generate')){
          sentGenerationId = options.headers && options.headers['x-generation-id'];
          return new Response(JSON.stringify({
            error: 'This generation request is already in progress.',
            reason: 'duplicate_in_progress'
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error('Unexpected browser-smoke fetch: ' + url);
      };
      let message = '';
      try{
        await callClaude({
          teacherName: 'Layne', studentName: 'Test Student',
          notes: 'Practised reading.', rating: '4', protocol: 'MA'
        });
      }catch(err){ message = err.message; }
      return { sentGenerationId, message };
    });
    check('generation requests carry a unique server idempotency identifier',
      /^[A-Za-z0-9_-]{16,128}$/.test(duplicateUx.sentGenerationId));
    check('duplicate generation state has clear retry guidance and preserves notes',
      duplicateUx.message.includes('already generating') && duplicateUx.message.includes('lesson notes'));

    const timeoutUx = await page.evaluate(async () => {
      window.fetch = async url => {
        if(String(url).includes('/api/generate')){
          return new Response(JSON.stringify({
            error: 'Report generation timed out. Your lesson notes are safe; please try again.',
            reason: 'generation_timeout'
          }), { status: 504, headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error('Unexpected browser-smoke fetch: ' + url);
      };
      try{
        await callClaude({
          teacherName: 'Layne', studentName: 'Test Student',
          notes: 'Practised reading.', rating: '4', protocol: 'MA'
        });
      }catch(err){ return err.message; }
      return '';
    });
    check('provider timeout explains when to retry and that lesson notes remain safe',
      timeoutUx.includes('took too long') && timeoutUx.includes('lesson notes') && timeoutUx.includes('try again'));

    const lostResponseRecovery = await page.evaluate(async () => {
      sessionStorage.clear();
      const ids = [];
      let call = 0;
      window.fetch = async (_url, options = {}) => {
        ids.push(options.headers && options.headers['x-generation-id']);
        call++;
        if(call === 1) throw new Error('synthetic response loss');
        if(call === 2) return new Response(JSON.stringify({
          error: 'This generation request was already completed.',
          reason: 'duplicate_completed'
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        return new Response(JSON.stringify({text:'A deliberately new report'}), {
          status: 200, headers: { 'Content-Type': 'application/json' }
        });
      };
      const generation = {
        teacherName: 'Layne', studentName: 'Private Student',
        notes: 'Private lesson evidence.', rating: '4', protocol: 'MA'
      };
      let storedAfterLoss = '', duplicateMessage = '';
      try{ await callClaude(generation); }catch(_err){
        storedAfterLoss = sessionStorage.getItem('pathfinder_pending_generation_v1') || '';
      }
      try{ await callClaude(generation); }catch(err){ duplicateMessage = err.message; }
      const storedAfterCompleted = sessionStorage.getItem('pathfinder_pending_generation_v1');
      clearGenerationAttempt(JSON.parse(storedAfterCompleted)); // explicit teacher-approved regeneration path
      const final = await callClaude(generation);
      const storedAfterSuccess = sessionStorage.getItem('pathfinder_pending_generation_v1');
      return {ids,storedAfterLoss,storedAfterCompleted,storedAfterSuccess,duplicateMessage,finalText:final.text};
    });
    check('ambiguous network retry reuses the exact pending generation identity',
      lostResponseRecovery.ids[0] === lostResponseRecovery.ids[1]);
    check('pending browser marker contains only opaque id and digest, never lesson content',
      lostResponseRecovery.storedAfterLoss.includes('fingerprint') &&
      !lostResponseRecovery.storedAfterLoss.includes('Private Student') &&
      !lostResponseRecovery.storedAfterLoss.includes('Private lesson evidence'));
    check('completed replay becomes a tombstone and requires explicit regeneration',
      lostResponseRecovery.storedAfterCompleted.includes('completed_without_result') &&
      lostResponseRecovery.duplicateMessage.includes('could not be recovered'));
    check('a later deliberate generation uses a new identity and clears it on success',
      lostResponseRecovery.ids[2] !== lostResponseRecovery.ids[1] &&
      lostResponseRecovery.storedAfterSuccess === null && lostResponseRecovery.finalText === 'A deliberately new report');

    const pendingStateEdges = await page.evaluate(async () => {
      const a = {teacherName:'Layne',studentName:'Mia',notes:'Same evidence',rating:'4',protocol:'MA'};
      const b = {protocol:'MA',rating:'4',notes:'Same evidence',studentName:'Mia',teacherName:'Layne'};
      const canonicalA = await generationFingerprint(a,'kb_live_test_pasted_key');
      const canonicalB = await generationFingerprint(b,'kb_live_test_pasted_key');

      sessionStorage.clear();
      const timeoutIds=[];
      let timeoutCall=0;
      window.fetch=async(_url,options={})=>{
        timeoutIds.push(options.headers['x-generation-id']);
        timeoutCall++;
        if(timeoutCall===1)return new Response(JSON.stringify({reason:'generation_timeout'}),{status:504,headers:{'Content-Type':'application/json'}});
        return new Response(JSON.stringify({text:'Retry delivered'}),{status:200,headers:{'Content-Type':'application/json'}});
      };
      try{await callClaude(a);}catch(_err){/* expected */}
      await callClaude(a);

      sessionStorage.clear();
      document.querySelector('input[name="protocol"][value="MA"]').click();
      document.getElementById('studentName').value='Mia';
      document.getElementById('krispNotes').value='Submitted evidence';
      window.fetch=async()=>{
        await new Promise(resolve=>setTimeout(resolve,30));
        return new Response(JSON.stringify({text:'Delivered while editing'}),{status:200,headers:{'Content-Type':'application/json'}});
      };
      const running=generate();
      await new Promise(resolve=>setTimeout(resolve,5));
      document.getElementById('krispNotes').value='New notes typed during generation';
      await running;
      return {canonicalA,canonicalB,timeoutIds,editedNotes:document.getElementById('krispNotes').value};
    });
    check('canonical fingerprint ignores object property insertion order',pendingStateEdges.canonicalA===pendingStateEdges.canonicalB);
    check('server-confirmed timeout clears pending identity before retry',pendingStateEdges.timeoutIds[0]!==pendingStateEdges.timeoutIds[1]);
    check('notes edited during generation are never erased by the earlier success',pendingStateEdges.editedNotes==='New notes typed during generation');
  }

  console.log('\n4) No new page errors accumulated from clicking through every protocol and the license modal');
  check('still zero page errors after full interaction', pageErrors.length === 0);

  await browser.close();
  return getFailures();
};

if(require.main === module){
  module.exports().then(failures => {
    console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
  });
}
