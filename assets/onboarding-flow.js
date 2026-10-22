/* Classbuster onboarding. Always optional, per-account and replayable. */
(() => {
  'use strict';
  const overlay = document.getElementById('classbusterOnboardingOverlay');
  const scoutOverlay = document.getElementById('classbusterScoutOverlay');
  if (!overlay || !scoutOverlay) return;
  const dialog = overlay.querySelector('[role="dialog"]');
  const body = document.getElementById('cbOnboardingBody');
  const title = document.getElementById('cbOnboardingTitle');
  const progress = document.getElementById('cbOnboardingProgress');
  const back = document.getElementById('cbOnboardingBack');
  const next = document.getElementById('cbOnboardingNext');
  const close = document.getElementById('cbOnboardingClose');
  const skip = document.getElementById('cbOnboardingSkip');
  const scoutDownload = document.getElementById('cbScoutDownload');
  const scoutReleaseState = document.getElementById('cbScoutReleaseState');
  let step = 0, replay = false, priorFocus = null, scoutPriorFocus = null;
  let checkSequence = 0, currentAccount = null, installer = null;
  let lastCheckedAccount = null;

  const screens = [
    {
      title: 'Welcome to Classbuster',
      html: '<p>Turn your lesson notes into thoughtful, professional feedback in minutes.</p>' +
        '<p>We will show you just the essentials. You can return to this guide anytime.</p>'
    },
    {
      title: 'Your first report',
      html: '<p>There are only three things to remember.</p>' +
        '<ol class="cb-step-list">' +
          '<li><b>1. Choose a style</b>Start with Classic. Explore other styles whenever you want.</li>' +
          '<li><b>2. Add lesson notes</b>Write or paste what happened during your lesson.</li>' +
          '<li><b>3. Generate and review</b>Classbuster drafts feedback. You check it before sharing.</li>' +
        '</ol>' +
        '<button class="btn-secondary" id="cbExampleToggle" type="button" aria-expanded="false" aria-controls="cbExampleNotes">Show example notes</button>' +
        '<div id="cbExampleNotes" class="cb-example" hidden>Alex practiced words for animals, used full sentences, and needed help with past tense. Homework: write three sentences about a favorite animal.</div>' +
        '<button class="btn-secondary" id="cbFullHelpGuide" type="button">Explore the full guide</button>'
    },
    {
      title: 'Meet Scout',
      html: '<p>Scout is an optional Windows companion that helps transcribe lessons and bring the notes into Classbuster.</p>' +
        '<p>You do not need to install it to use Classbuster.</p>' +
        '<div class="cb-scout-choice-actions">' +
          '<button class="generate-btn" id="cbTourInstallScout" type="button" disabled><span class="btn-label">Install Scout</span></button>' +
          '<button class="btn-secondary" id="cbTourSkipScout" type="button">Not now, continue without Scout</button>' +
          '<button class="btn-secondary" id="cbTourAboutScout" type="button">Learn about Scout</button>' +
        '</div>' +
        '<p id="cbTourReleaseNote" class="cb-release-note">Checking whether Scout is ready for public download...</p>'
    },
    {
      title: "You're ready",
      html: '<p>Start creating lesson reports whenever you are ready.</p>' +
        '<p>Scout remains available from your Classbuster workspace. You can always install it later.</p>'
    }
  ];

  function accessKey() {
    try { return typeof getStoredAccessKey === 'function' ? getStoredAccessKey() : localStorage.getItem('kidbuster_access_key'); }
    catch { return null; }
  }

  function render() {
    title.textContent = screens[step].title;
    title.setAttribute('tabindex', '-1');
    body.innerHTML = screens[step].html;
    progress.replaceChildren();
    screens.forEach((_, i) => {
      const mark = document.createElement('i');
      if (i <= step) mark.className = 'active';
      mark.setAttribute('aria-hidden', 'true');
      progress.appendChild(mark);
    });
    back.hidden = step === 0;
    skip.hidden = step !== 0;
    next.hidden = step === 2;
    next.querySelector('.btn-label').textContent =
      step === 0 ? 'Show me around' : step === 3 ? 'Enter Classbuster' : 'Continue';
    if (step === 1) {
      const toggle = body.querySelector('#cbExampleToggle'), example = body.querySelector('#cbExampleNotes');
      toggle.addEventListener('click', () => {
        example.hidden = !example.hidden;
        toggle.textContent = example.hidden ? 'Show example notes' : 'Hide example notes';
        toggle.setAttribute('aria-expanded', String(!example.hidden));
      });
      body.querySelector('#cbFullHelpGuide').addEventListener('click', () => {
        // Opening the full guide counts as leaving the first-time tour.
        finish('skipped');
        if (typeof openHelpModal === 'function') openHelpModal();
      });
    }
    if (step === 2) {
      body.querySelector('#cbTourInstallScout').addEventListener('click', () => {
        if (!installer) return;
        openScout();
      });
      body.querySelector('#cbTourSkipScout').addEventListener('click', () => { step = 3; render(); });
      body.querySelector('#cbTourAboutScout').addEventListener('click', openScout);
      showReleaseState();
      loadScoutRelease();
    }
    // Announce every step change to keyboard and screen-reader users.
    if (!overlay.hidden && document.activeElement !== title) title.focus({preventScroll:true});
  }

  function show(isReplay = false) {
    if (!overlay.hidden) return;
    const legacyGuide = document.getElementById('helpModalOverlay');
    if (legacyGuide) legacyGuide.style.display = 'none';
    replay = isReplay;
    priorFocus = document.activeElement;
    step = 0;
    overlay.hidden = false;
    document.body.classList.add('cb-modal-open');
    render();
    dialog.focus();
  }

  function hide() {
    if (!scoutOverlay.hidden) closeScout();
    overlay.hidden = true;
    document.body.classList.remove('cb-modal-open');
    if (priorFocus && typeof priorFocus.focus === 'function' && priorFocus.isConnected) priorFocus.focus();
  }

  async function persist(state) {
    const key = accessKey();
    if (!key) return;
    // Remember the decision immediately so a quick reload cannot restart the tour.
    try { localStorage.setItem('classbuster.onboarding.' + key, state); } catch {}
    try {
      const response = await fetch('/api/license-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-key': key,
          'x-installation-id': typeof getAccessInstallationId === 'function' ? getAccessInstallationId() : ''
        },
        body: JSON.stringify({state})
      });
      if (!response.ok) throw new Error('Onboarding state not saved');
    } catch {
      // A temporary network failure must not prevent using Classbuster.
      try { localStorage.setItem('classbuster.onboarding.' + key, state); } catch {}
    }
  }

  function finish(state) {
    if (!replay) {
      void persist(state);
      if (typeof updateHelpButton === 'function') updateHelpButton(true);
    }
    hide();
  }

  function showReleaseState() {
    const button = body.querySelector('#cbTourInstallScout');
    const note = body.querySelector('#cbTourReleaseNote');
    if (!button || !note) return;
    button.disabled = !installer;
    note.textContent = installer
      ? 'Scout for Windows is available to install.'
      : 'Scout is not ready for public download yet. You can still use Classbuster normally.';
  }

  async function loadScoutRelease() {
    installer = null;
    scoutDownload.hidden = true;
    scoutDownload.removeAttribute('href');
    scoutReleaseState.textContent = 'Scout is not ready for public download yet. You can use Classbuster without it.';
    try {
      const response = await fetch('/assets/scout-release.json', {cache: 'no-store', credentials: 'omit'});
      if (!response.ok) return;
      const payload = await response.json();
      const valid = window.validateScoutRelease && window.validateScoutRelease(payload);
      if (!valid) return;
      installer = valid;
      scoutDownload.href = valid.url.href;
      scoutDownload.hidden = false;
      scoutReleaseState.textContent = 'A verified Windows installer is available.';
    } catch {
      // The unverified installer must stay hidden.
    } finally {
      showReleaseState();
    }
  }

  function openScout() {
    scoutPriorFocus = document.activeElement;
    scoutOverlay.hidden = false;
    scoutOverlay.querySelector('[role="dialog"]').focus();
    document.getElementById('cbScoutCloseAction').focus();
    void loadScoutRelease();
  }
  function closeScout() {
    scoutOverlay.hidden = true;
    if (scoutPriorFocus && scoutPriorFocus.isConnected && typeof scoutPriorFocus.focus === 'function')
      scoutPriorFocus.focus();
  }

  next.addEventListener('click', () => {
    if (step === 3) return finish('completed');
    if (step < 3) { step++; render(); }
  });
  skip.addEventListener('click', () => finish('skipped'));
  back.addEventListener('click', () => { if (step > 0) { step--; render(); } });
  close.addEventListener('click', () => finish('skipped'));
  overlay.addEventListener('click', e => { if (e.target === overlay && scoutOverlay.hidden) finish('skipped'); });
  document.getElementById('cbScoutClose').addEventListener('click', closeScout);
  document.getElementById('cbScoutCloseAction').addEventListener('click', closeScout);
  scoutOverlay.addEventListener('click', e => { if (e.target === scoutOverlay) closeScout(); });

  document.addEventListener('keydown', (event) => {
    const top = !scoutOverlay.hidden ? scoutOverlay : !overlay.hidden ? overlay : null;
    if (!top) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!scoutOverlay.hidden) closeScout();
      else finish('skipped');
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = Array.from(top.querySelectorAll('button:not([disabled]),a[href],input,[tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hidden && el.getClientRects().length > 0);
    if (!elements.length) { event.preventDefault(); top.querySelector('[role="dialog"]').focus(); return; }
    const first = elements[0], last = elements[elements.length - 1];
    if (!top.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }, true);

  window.openClassbusterOnboarding = () => show(true);
  window.openScoutPanel = openScout;
  document.getElementById('cbScoutOpenWorkspace')?.addEventListener('click', openScout);
  async function checkForNewAccount() {
    const key = accessKey();
    const checkId = ++checkSequence;
    if (!key || !overlay.hidden || !scoutOverlay.hidden) return;
    try {
      const response = await fetch('/api/license-status', {
        headers: {
          'x-app-key': key,
          'x-installation-id': typeof getAccessInstallationId === 'function' ? getAccessInstallationId() : ''
        }, cache: 'no-store'
      });
      if (!response.ok) return;
      const result = await response.json();
      if (checkId !== checkSequence || key !== accessKey()) return;
      lastCheckedAccount = key;
      if (result.status !== 'active') return;
      if (result.onboarding || result.onboardingEligible !== true) {
        if (typeof updateHelpButton === 'function') updateHelpButton(true);
        return;
      }
      if (result.onboardingState !== 'never') return;
      try { if (localStorage.getItem('classbuster.onboarding.' + key)) return; } catch {}
      show(false);
    } catch {
      // No guessing about identity or persistent state during outages.
    }
  }
  document.addEventListener('kidbuster:access-key-saved', checkForNewAccount);
  window.addEventListener('storage', e => {
    if (e.key === 'kidbuster_access_key') void checkForNewAccount();
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', checkForNewAccount, {once: true});
  else void checkForNewAccount();
})();
