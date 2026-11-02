// Optional testimonial invitation (owner-approved 2026-11-02).
//
// Appears only AFTER the existing post-report feedback has been confirmed as
// saved by the server (index.html dispatches `classbuster:feedback-saved`
// only when /api/feedback answers stored:true). It never blocks generation,
// copying or feedback, and it never publishes anything: a story is sent as a
// PRIVATE proposal to POST /api/feedback?kind=testimonial for the owner to
// review. Publication needs separately approved wording and consent.
//
// Frequency cap (this browser only, no content stored): after "Not now" the
// invitation rests for 21 days; after three "Not now" answers, or after a
// story was sent, it rests for 180 days. It appears at most once per page.
(function(){
  'use strict';
  var STORE = 'classbuster.testimonialInvite.v1';
  var DAY = 24 * 60 * 60 * 1000;
  var REST_AFTER_NOT_NOW = 21 * DAY;
  var LONG_REST = 180 * DAY;
  var STORY_MAX = 800;
  var IN_PROGRESS_RETRY_MS = 1500;
  var shownThisPage = false;
  var overlay = null, state = null;

  function readPrefs(){
    try{
      var raw = JSON.parse(localStorage.getItem(STORE) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    }catch(e){ return {}; }
  }
  function writePrefs(prefs){
    // Only timestamps and a counter: never the story, comment or name.
    var safe = { lastShown: Number(prefs.lastShown) || 0, notNow: Number(prefs.notNow) || 0, sentAt: Number(prefs.sentAt) || 0 };
    try{ localStorage.setItem(STORE, JSON.stringify(safe)); }catch(e){ /* storage unavailable: page cap still applies */ }
  }
  function mayInvite(now){
    if(shownThisPage) return false;
    var p = readPrefs();
    if(p.sentAt && now - p.sentAt < LONG_REST) return false;
    if(p.notNow >= 3 && now - (p.lastShown || 0) < LONG_REST) return false;
    if(p.lastShown && now - p.lastShown < REST_AFTER_NOT_NOW) return false;
    return true;
  }
  function randomId(){
    var bytes = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function accessKey(){
    try{ return localStorage.getItem('kidbuster_access_key') || ''; }catch(e){ return ''; }
  }
  function hasContactDetails(text){
    var t = String(text).replace(/\bclassbuster\.com\b/gi, 'Classbuster');
    return /[^\s@]+@[^\s@]+\.[a-z]{2,}|https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|cn|edu|co)\b|(?:\+?\d[\s().-]?){9,}/i.test(t);
  }

  function el(tag, attrs, text){
    var n = document.createElement(tag);
    if(attrs) Object.keys(attrs).forEach(function(k){ n.setAttribute(k, attrs[k]); });
    if(text != null) n.textContent = text;
    return n;
  }

  function build(){
    overlay = el('div', { id: 'testimonialInviteOverlay', class: 'ti-overlay', hidden: '' });
    var dialog = el('div', { class: 'ti-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tiTitle', 'aria-describedby': 'tiIntro' });
    var close = el('button', { type: 'button', class: 'ti-close', id: 'tiCloseBtn', 'aria-label': 'Not now, close' }, '×');
    var kicker = el('p', { class: 'ti-kicker' }, 'Optional · takes a minute');
    var title = el('h2', { id: 'tiTitle', class: 'ti-title', tabindex: '-1' }, 'Help other teachers discover Classbuster');
    var intro = el('p', { id: 'tiIntro', class: 'ti-intro' },
      'Most teachers find Classbuster through other teachers. If it has made your reports easier, a few honest words could help someone decide whether to try it. Any experience is welcome, not only glowing ones. Saying no changes nothing about your account or reports.');

    var invite = el('div', { class: 'ti-step', id: 'tiInviteStep' });
    var inviteActions = el('div', { class: 'ti-actions' });
    var share = el('button', { type: 'button', class: 'ti-primary', id: 'tiShareBtn' }, 'Share my story');
    var notNow = el('button', { type: 'button', class: 'ti-secondary', id: 'tiNotNowBtn' }, 'Not now');
    inviteActions.append(share, notNow);
    invite.append(inviteActions);

    var form = el('form', { class: 'ti-step', id: 'tiFormStep', hidden: '', novalidate: '' });
    var storyLabel = el('label', { for: 'tiStory', class: 'ti-label' }, 'Your story');
    var storyHint = el('p', { id: 'tiStoryHint', class: 'ti-hint' });
    var story = el('textarea', { id: 'tiStory', class: 'ti-story', rows: '5', maxlength: String(STORY_MAX), 'aria-describedby': 'tiStoryHint tiPrivacy' });
    var counter = el('p', { id: 'tiCounter', class: 'ti-counter', 'aria-live': 'off' });
    var nameLabel = el('label', { for: 'tiName', class: 'ti-label' }, 'How you would like to be named (optional)');
    var name = el('input', { id: 'tiName', class: 'ti-input', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: 'e.g. first name only, or leave blank to stay anonymous' });
    var roleLabel = el('label', { for: 'tiRole', class: 'ti-label' }, 'Your teaching context (optional)');
    var role = el('input', { id: 'tiRole', class: 'ti-input', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: 'e.g. Online ESL teacher' });
    var privacy = el('div', { id: 'tiPrivacy', class: 'ti-privacy' });
    privacy.append(
      el('strong', null, 'Private until you approve. '),
      document.createTextNode('Your story goes privately to the Classbuster owner and is kept for up to 180 days. It is not published, not shown to other users and not sent to analytics. Before anything appears on classbuster.com we will ask you to approve the exact wording and how you are named, and you can withdraw at any time. Please leave out student names, lesson details and transcript content. ')
    );
    privacy.append(el('a', { href: '/privacy-policy.html#testimonial-proposals', target: '_blank', rel: 'noopener', class: 'ti-privacy-link' }, 'How we handle stories (Privacy Policy)'));
    var consentRow = el('label', { class: 'ti-consent', for: 'tiConsent' });
    var consent = el('input', { id: 'tiConsent', type: 'checkbox' });
    consentRow.append(consent, el('span', null, 'Classbuster may email me at my account address to ask permission before publishing anything.'));
    var status = el('p', { id: 'tiStatus', class: 'ti-status', role: 'status', 'aria-live': 'polite' });
    var formActions = el('div', { class: 'ti-actions' });
    var send = el('button', { type: 'submit', class: 'ti-primary', id: 'tiSendBtn' }, 'Send privately');
    var discard = el('button', { type: 'button', class: 'ti-secondary', id: 'tiDiscardBtn' }, 'Discard');
    formActions.append(send, discard);
    form.append(storyLabel, storyHint, story, counter, nameLabel, name, roleLabel, role, privacy, consentRow, status, formActions);

    var done = el('div', { class: 'ti-step', id: 'tiDoneStep', hidden: '' });
    var doneText = el('p', { class: 'ti-done', id: 'tiDoneText', tabindex: '-1' }, 'Thank you. Your story was sent privately. Nothing will be published unless you approve the exact wording.');
    var doneActions = el('div', { class: 'ti-actions' });
    doneActions.append(el('button', { type: 'button', class: 'ti-primary', id: 'tiDoneBtn' }, 'Close'));
    done.append(doneText, doneActions);

    dialog.append(close, kicker, title, intro, invite, form, done);
    overlay.append(dialog);
    document.body.appendChild(overlay);

    close.addEventListener('click', function(){ dismiss(); });
    notNow.addEventListener('click', function(){ dismiss(); });
    discard.addEventListener('click', function(){ dismiss(); });
    document.getElementById('tiDoneBtn').addEventListener('click', function(){ hide(); });
    share.addEventListener('click', openForm);
    story.addEventListener('input', updateCounter);
    form.addEventListener('submit', function(event){ event.preventDefault(); submit(); });
    overlay.addEventListener('pointerdown', function(event){ if(event.target === overlay && !(state && state.sending)) dismiss(); });
    overlay.addEventListener('keydown', onKey);
  }

  function updateCounter(){
    var story = document.getElementById('tiStory');
    document.getElementById('tiCounter').textContent = story.value.length + ' / ' + STORY_MAX;
  }

  function step(id){
    ['tiInviteStep', 'tiFormStep', 'tiDoneStep'].forEach(function(s){ document.getElementById(s).hidden = s !== id; });
  }

  function focusables(){
    return Array.prototype.filter.call(
      overlay.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function(n){ return n.offsetParent !== null; });
  }

  function onKey(event){
    if(!state) return;
    if(event.key === 'Escape'){
      event.preventDefault(); event.stopPropagation();
      if(!state.sending){ if(state.sent) hide(); else dismiss(); }
      return;
    }
    if(event.key !== 'Tab') return;
    var list = focusables();
    if(!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if(event.shiftKey && (document.activeElement === first || !overlay.contains(document.activeElement))){ event.preventDefault(); last.focus(); }
    else if(!event.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))){ event.preventDefault(); first.focus(); }
  }

  // Keep focus inside the dialog even if something outside grabs it.
  function onFocusIn(event){
    if(state && overlay && !overlay.contains(event.target)){
      var list = focusables(); if(list.length) list[0].focus();
    }
  }

  function show(detail){
    if(!overlay) build();
    var now = Date.now();
    shownThisPage = true;
    var prefs = readPrefs(); prefs.lastShown = now; writePrefs(prefs);
    state = { proposalId: randomId(), feedbackId: detail.feedbackId, draft: String(detail.comment || '').slice(0, STORY_MAX), sending: false, sent: false, returnFocus: document.activeElement };
    var story = document.getElementById('tiStory');
    story.value = state.draft;
    document.getElementById('tiStoryHint').textContent = state.draft
      ? 'We started with the feedback you just sent. Change it, shorten it or replace it completely. Nothing is sent until you press Send privately.'
      : 'In a sentence or two: how has Classbuster helped you? Nothing is sent until you press Send privately.';
    document.getElementById('tiName').value = '';
    document.getElementById('tiRole').value = '';
    document.getElementById('tiConsent').checked = false;
    setStatus('', false);
    updateCounter();
    step('tiInviteStep');
    overlay.hidden = false;
    document.addEventListener('focusin', onFocusIn);
    document.getElementById('tiShareBtn').focus();
  }

  function hide(){
    if(!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.removeEventListener('focusin', onFocusIn);
    var back = state && state.returnFocus;
    state = null;
    // Drop the in-memory draft as soon as the dialog closes.
    document.getElementById('tiStory').value = '';
    // The feedback Send button is disabled after a successful send, so fall
    // back to the feedback comment box rather than losing focus to <body>.
    if(!back || back.disabled || !document.contains(back) || back === document.body) back = document.getElementById('feedbackComment');
    if(back && typeof back.focus === 'function'){
      try{ back.focus({ preventScroll: true }); }catch(e){ back.focus(); }
    }
  }

  function dismiss(){
    if(!state || state.sending) return;
    if(!state.sent){ var p = readPrefs(); p.notNow = (Number(p.notNow) || 0) + 1; writePrefs(p); }
    hide();
  }

  function openForm(){
    step('tiFormStep');
    var story = document.getElementById('tiStory');
    story.focus();
    try{ story.setSelectionRange(story.value.length, story.value.length); }catch(e){ /* not critical */ }
  }

  function setStatus(text, isError){
    var s = document.getElementById('tiStatus');
    s.textContent = text;
    s.className = 'ti-status' + (isError ? ' ti-error' : '');
    s.setAttribute('role', isError ? 'alert' : 'status');
  }

  function setBusy(busy){
    ['tiSendBtn', 'tiDiscardBtn', 'tiCloseBtn', 'tiStory', 'tiName', 'tiRole', 'tiConsent'].forEach(function(id){ document.getElementById(id).disabled = busy; });
  }

  async function submit(){
    if(!state || state.sending || state.sent) return;
    var storyText = document.getElementById('tiStory').value.trim();
    var name = document.getElementById('tiName').value.trim();
    var role = document.getElementById('tiRole').value.trim();
    if(storyText.length < 10){ setStatus('Please write a sentence or two, or press Discard.', true); document.getElementById('tiStory').focus(); return; }
    if(hasContactDetails(storyText) || hasContactDetails(name) || hasContactDetails(role)){
      setStatus('Please leave out email addresses, links and phone numbers.', true); return;
    }
    if(!document.getElementById('tiConsent').checked){
      setStatus('Please tick the box so we can ask you before anything is published.', true);
      document.getElementById('tiConsent').focus(); return;
    }
    var key = accessKey();
    if(!key){ setStatus('Please sign in to your Classbuster account first. Your story was not sent.', true); return; }
    state.sending = true; setBusy(true); setStatus('Sending privately…', false);
    var ok = false, message = 'Could not send your story. Nothing was saved; please try again.';
    try{
      var body = JSON.stringify({ proposalId: state.proposalId, feedbackId: state.feedbackId, story: storyText, displayName: name, role: role, contactOk: true });
      // 409 in_progress means an earlier send of this SAME proposal is still
      // being stored: wait briefly and ask again (same proposalId, idempotent).
      for(var attempt = 0; attempt < 3; attempt++){
        if(attempt) await new Promise(function(r){ setTimeout(r, IN_PROGRESS_RETRY_MS); });
        if(!state) return;
        var response = await fetch('/api/feedback?kind=testimonial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-app-key': key },
          body: body
        });
        var data = null;
        try{ data = await response.json(); }catch(e){ data = null; }
        // Success only when the server confirms a stored private record id.
        ok = !!(response.ok && data && data.status === 'received_private' && typeof data.id === 'number' && data.id > 0 && Math.floor(data.id) === data.id);
        if(ok) break;
        var busy = response.status === 409 && data && data.status === 'in_progress';
        if(busy){ message = 'Your story is still being saved. Please try again in a moment.'; continue; }
        if(data && typeof data.error === 'string') message = data.error + ' Your story was not sent.';
        break;
      }
    }catch(e){
      message = 'Could not reach Classbuster (network). Your story was not sent; please try again.';
    }
    if(!state) return;
    state.sending = false; setBusy(false);
    if(!ok){ setStatus(message, true); return; }
    state.sent = true;
    var p = readPrefs(); p.sentAt = Date.now(); writePrefs(p);
    step('tiDoneStep');
    document.getElementById('tiDoneText').focus();
  }

  document.addEventListener('classbuster:feedback-saved', function(event){
    var detail = event && event.detail || {};
    // Every star rating and every idea is invited. A bug report is a moment
    // of friction, so it is not followed by a request for a story.
    if(detail.category === 'bug') return;
    if(!mayInvite(Date.now())) return;
    shownThisPage = true; // idempotent: a second save in the same page never re-invites
    // Let the "Thanks — feedback sent" confirmation render first.
    setTimeout(function(){ if(!state) show(detail); }, 350);
  });

  window.ClassbusterTestimonialInvite = { _mayInvite: mayInvite, _storeKey: STORE };
})();
