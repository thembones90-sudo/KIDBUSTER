// Scout inbox client. Lives in the account popover and is independent of
// the Krisp controls: it shares only the Krisp notes box as the import target,
// and never overwrites text that is already there. Importing never calls
// /api/generate. The device token is held in the DOM only while the one-time
// reveal is open; it is never stored or logged.
(function(){
  var KEY = 'kidbuster_access_key';
  // Connected with an empty workspace, a finished lesson shows up within ~15 s.
  // Connected but busy polls once a minute; not connected never polls
  // (page load, focus and opening the account panel still check). Idle polls
  // send the last seen version and cost one server read when nothing changed.
  var ARMED_POLL_MS = 15000, IDLE_POLL_MS = 60000, MAX_POLL_MS = 120000, FULL_REFRESH_MS = 5 * 60000;
  var $ = function(id){ return document.getElementById('radarVan' + id); };
  var section = $('Section');
  if(!section) return;
  var state = { gen: 0, connected: false, armed: false, matchedCount: 0, failures: 0, disabled: false, inflight: false, timer: null, applied: {}, busy: false, retry: {}, acking: {}, scopeKey: null, scope: null, version: null, lastFull: 0 };

  // Durable ACK receipts: "this meetingId is already in the notes, tell the server".
  // Browser-local, scoped to a one-way fingerprint of the access key, holding only
  // meeting ids and timestamps (never a transcript, the key or the device token).
  // Bounded by age and count. Unavailable storage degrades to the in-memory flag.
  var RECEIPT_KEY = 'radarvan_ack_receipts_v1', RECEIPT_TTL_MS = 24 * 60 * 60 * 1000, RECEIPT_MAX = 25, RECEIPT_SCOPES = 5;
  var ACK_RETRY_BASE_MS = 15000, ACK_RETRY_MAX_MS = 600000, ACK_RETRY_LIMIT = 8;
  var MEETING_ID = /^rv:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  function loadReceipts(){
    var data = null, now = Date.now();
    try{ data = JSON.parse(localStorage.getItem(RECEIPT_KEY) || 'null'); }catch(e){ data = null; }
    if(!data || data.v !== 1 || !data.a || typeof data.a !== 'object') data = { v: 1, a: {} };
    Object.keys(data.a).forEach(function(scope){
      var map = data.a[scope], ids;
      if(!map || typeof map !== 'object'){ delete data.a[scope]; return; }
      ids = Object.keys(map).filter(function(id){ var t = map[id]; if(!MEETING_ID.test(id) || typeof t !== 'number' || now - t > RECEIPT_TTL_MS || t > now + 86400000){ delete map[id]; return false; } return true; });
      ids.sort(function(a, b){ return map[b] - map[a]; }).slice(RECEIPT_MAX).forEach(function(id){ delete map[id]; });
      if(!Object.keys(map).length) delete data.a[scope];
    });
    var scopes = Object.keys(data.a);
    if(scopes.length > RECEIPT_SCOPES){
      var newest = function(s){ return Math.max.apply(null, Object.keys(data.a[s]).map(function(id){ return data.a[s][id]; })); };
      scopes.sort(function(a, b){ return newest(b) - newest(a); }).slice(RECEIPT_SCOPES).forEach(function(s){ delete data.a[s]; });
    }
    return data;
  }
  function saveReceipts(data){
    try{
      if(Object.keys(data.a).length) localStorage.setItem(RECEIPT_KEY, JSON.stringify(data)); else localStorage.removeItem(RECEIPT_KEY);
      return true;
    }catch(e){ return false; }
  }
  function receiptIds(scope){ return scope ? Object.keys(loadReceipts().a[scope] || {}) : []; }
  function hasReceipt(scope, id){ return !!scope && !!(loadReceipts().a[scope] || {})[id]; }
  function addReceipt(scope, id){
    if(!scope || !MEETING_ID.test(id)) return false;
    var data = loadReceipts();
    (data.a[scope] = data.a[scope] || {})[id] = Date.now();
    return saveReceipts(data);
  }
  function clearReceipt(scope, id){
    if(!scope) return;
    var data = loadReceipts();
    if(!data.a[scope] || !(id in data.a[scope])) return;
    delete data.a[scope][id];
    if(!Object.keys(data.a[scope]).length) delete data.a[scope];
    saveReceipts(data);
  }
  // Scope = truncated SHA-256 of the access key; null when unavailable (no persistence).
  async function currentScope(){
    var key = savedKey();
    if(!key) return null;
    if(state.scopeKey === key) return state.scope;
    var scope = null;
    try{
      var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('radarvan-ack-scope|' + key));
      scope = Array.prototype.map.call(new Uint8Array(digest).slice(0, 12), function(b){ return ('0' + b.toString(16)).slice(-2); }).join('');
    }catch(e){ scope = null; }
    if(key !== savedKey()) return null;
    state.scopeKey = key; state.scope = scope;
    return scope;
  }

  function savedKey(){ try{ return localStorage.getItem(KEY); }catch(e){ return null; } }
  function say(message){ $('Status').textContent = message || ''; }
  function workspaceSay(message){
    var status = document.getElementById('scoutNotesStatus');
    if(status){ status.textContent = message || ''; status.hidden = !message; }
  }
  function notesBox(){ return document.getElementById('krispNotes'); }
  function workspaceIdle(){
    var notes = notesBox(), output = document.getElementById('outputBox');
    var generate = document.getElementById('generateBtn');
    if((generate && generate.getAttribute('aria-busy') === 'true') || (output && output.classList.contains('is-generating'))) return false;
    var notesEmpty = !!notes && !notes.value.trim();
    var outputIdle = !output || output.classList.contains('empty') || output.textContent.trim() === 'Protocol standing by.';
    return notesEmpty && outputIdle;
  }

  async function api(method, body, lease, since){
    var key = savedKey(), gen = state.gen;
    if(!key) return null;
    var headers = { 'x-app-key': key };
    if(body) headers['Content-Type'] = 'application/json';
    if(lease) headers['x-radar-lease'] = '1';
    if(since) headers['x-radar-since'] = since;
    var res = await fetch('/api/radar-van-session', { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    var data = await res.json().catch(function(){ return {}; });
    // Signed in as someone else (or out) while this was in flight: discard.
    if(gen !== state.gen || key !== savedKey()) return null;
    return { ok: res.ok, status: res.status, data: data };
  }

  function hideToken(){ $('TokenBox').hidden = true; $('TokenField').value = ''; }
  function announcePending(authorized,count){
    document.dispatchEvent(new CustomEvent('classbuster:scout-pending',{
      detail:{authorized:authorized===true,count:authorized?count:0}
    }));
  }
  function showScoutPending(items){
    var group=document.getElementById('radarVanPendingGroup');
    var list=document.getElementById('radarVanPendingPopoverList');
    if(!group||!list) return;
    group.hidden=false;
    list.replaceChildren.apply(list,items.map(itemNode));
    var n=document.getElementById('radarVanPendingPopoverCount');
    if(n)n.textContent=String(items.length);
    var status=document.getElementById('radarVanPendingPopoverStatus');
    if(status)status.textContent=items.length
      ?items.length+(items.length===1?' Scout transcript awaiting review.':' Scout transcripts awaiting review.')
      :'No Scout transcripts pending.';
    announcePending(true,items.length);
  }
  function hideAll(){
    section.hidden = true; hideToken(); say('');
    workspaceSay('');
    $('List').replaceChildren(); $('Count').textContent = '0';
    document.getElementById('accountBtn')?.removeAttribute('data-radar-pending');
    var group=document.getElementById('radarVanPendingGroup');
    if(group){group.hidden=true;document.getElementById('radarVanPendingPopoverList').replaceChildren();}
    announcePending(false,0);
    state.connected = false; state.armed = false; state.matchedCount = 0;
  }
  function stopPolling(){ clearTimeout(state.timer); state.timer = null; }

  // Display-only helpers. All values are untrusted and only ever set via textContent.
  function lessonHeading(item){ return item.studentLabel || item.title || 'Scout lesson'; }
  function lessonWhen(item){
    var start = new Date(item.startedAt || item.receivedAt);
    if(isNaN(start.getTime())) return '';
    var dayOpts = { year: 'numeric', month: 'short', day: 'numeric' }, timeOpts = { hour: 'numeric', minute: '2-digit' };
    var text = start.toLocaleDateString(undefined, dayOpts) + ', ' + start.toLocaleTimeString(undefined, timeOpts);
    var end = item.startedAt && item.endedAt ? new Date(item.endedAt) : null;
    if(end && !isNaN(end.getTime()) && end >= start){
      var sameDay = end.toLocaleDateString(undefined, dayOpts) === start.toLocaleDateString(undefined, dayOpts);
      text += '–' + (sameDay ? '' : end.toLocaleDateString(undefined, dayOpts) + ', ') + end.toLocaleTimeString(undefined, timeOpts);
    }
    return text + ' ' + (new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(start).find(function(p){ return p.type === 'timeZoneName'; }) || { value: '' }).value;
  }
  function lessonParts(item){
    var parts = [];
    if(Number.isInteger(item.fragmentCount) && item.fragmentCount > 1) parts.push(item.fragmentCount + ' parts');
    if(Number.isInteger(item.interruptionCount) && item.interruptionCount > 0) parts.push(item.interruptionCount + (item.interruptionCount === 1 ? ' interruption' : ' interruptions'));
    return parts.join(' / ');
  }

  function itemNode(item){
    var li = document.createElement('li'); li.className = 'radar-van-item'; li.dataset.meetingId = item.meetingId;
    var heading = lessonHeading(item);
    var title = document.createElement('div'); title.className = 'radar-van-item-title'; title.textContent = heading;
    var meta = document.createElement('div'); meta.className = 'radar-van-item-meta';
    var mins = item.durationSeconds ? Math.max(1, Math.round(item.durationSeconds / 60)) + ' min recorded' : '';
    var extraTitle = item.studentLabel && item.title && item.title !== item.studentLabel && item.title !== 'Scout lesson' ? item.title : '';
    meta.textContent = [extraTitle, lessonWhen(item), mins, lessonParts(item), 'Scout'].filter(Boolean).join(' · ');
    var preview = document.createElement('div'); preview.className = 'radar-van-item-preview'; preview.textContent = item.contentPreview || '';
    // Review without claiming: expand the server-provided EXCERPT only.
    // The full transcript is retrieved through the existing protected Claim
    // action so we do not expose text or change any server-side lease here.
    var menuButton = document.createElement('button');
    menuButton.type = 'button'; menuButton.className = 'radar-van-more';
    menuButton.textContent = '\u22ee'; menuButton.title = 'More transcript options';
    menuButton.setAttribute('aria-label','More options for ' + heading);
    menuButton.setAttribute('aria-expanded','false');
    var menu = document.createElement('div'); menu.className = 'radar-van-item-menu'; menu.hidden = true;
    var previewToggle = document.createElement('button'); previewToggle.type = 'button';
    previewToggle.textContent = 'Preview excerpt';
    var expandedPreview = document.createElement('div');
    expandedPreview.className = 'radar-van-expanded-preview'; expandedPreview.hidden = true;
    expandedPreview.textContent = item.contentPreview || 'No transcript excerpt available.';
    previewToggle.addEventListener('click', function(){
      expandedPreview.hidden = !expandedPreview.hidden;
      previewToggle.textContent = expandedPreview.hidden ? 'Preview excerpt' : 'Hide excerpt';
      menu.hidden = true; menuButton.setAttribute('aria-expanded','false');
    });
    var dismissMenu = document.createElement('button'); dismissMenu.type = 'button';
    dismissMenu.textContent = 'Dismiss lesson';
    menuButton.addEventListener('click', function(event){
      event.stopPropagation();
      menu.hidden = !menu.hidden;
      menuButton.setAttribute('aria-expanded', String(!menu.hidden));
    });
    dismissMenu.addEventListener('click', function(){ menu.hidden = true; dismissItem(item,dismissMenu); });
    menu.append(previewToggle,dismissMenu);
    var closeMenu = function(event){
      if(!menu.hidden && !li.contains(event.target)){
        menu.hidden = true; menuButton.setAttribute('aria-expanded','false');
        document.removeEventListener('click',closeMenu);
      }
    };
    menuButton.addEventListener('click', function(){
      if(!menu.hidden) document.addEventListener('click',closeMenu);
      else document.removeEventListener('click',closeMenu);
    });
    var row = document.createElement('div'); row.className = 'radar-van-row';
    var claim = document.createElement('button'); claim.type = 'button'; claim.className = 'btn-secondary radar-van-claim';
    claim.textContent = 'Claim into notes'; claim.setAttribute('aria-label', 'Claim ' + heading + (lessonWhen(item) ? ' from ' + lessonWhen(item) : '') + ' into your notes');
    claim.addEventListener('click', function(){ claimItem(item, claim); });
    var dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'btn-secondary radar-van-dismiss';
    dismiss.textContent = 'Dismiss'; dismiss.setAttribute('aria-label', 'Dismiss ' + heading + (lessonWhen(item) ? ' from ' + lessonWhen(item) : '') + ' from your inbox');
    dismiss.addEventListener('click', function(){ dismissItem(item, dismiss); });
    row.append(claim, dismiss);
    li.append(title, meta, menuButton, menu);
    if(item.contentPreview) li.append(preview);
    li.append(expandedPreview, row);
    return li;
  }

  function render(data){
    if(!data || data.enabled === false) return;
    if(typeof data.version === 'string'){ state.version = data.version; state.lastFull = Date.now(); }
    section.hidden = false;
    state.connected = !!data.connected; state.armed = !!data.automatic; state.matchedCount = data.waitingCount ?? data.matchedCount ?? 0;
    var badge = $('State');
    badge.dataset.state = !state.connected ? 'off' : 'connected';
    badge.textContent = !state.connected ? 'Not connected' : 'Connected · automatic';
    $('ConnectBtn').textContent = state.connected ? 'Replace device token' : 'Connect Scout';
    $('DisconnectBtn').hidden = !state.connected;
    var items = Array.isArray(data.inboxPending) ? data.inboxPending :
      (Array.isArray(data.pending) ? data.pending : []);
    showScoutPending(items);
    $('List').replaceChildren.apply($('List'), items.map(itemNode));
    $('Count').textContent = String(items.length);
    $('Empty').hidden = items.length > 0;
    var waiting = $('Waiting');
    waiting.hidden = !state.matchedCount;
    if(state.matchedCount){
      waiting.textContent = state.matchedCount + (state.matchedCount === 1 ? ' lesson is' : ' lessons are') + ' waiting. ' + (state.connected ? 'Open Pending transcripts to review Scout lessons.' : 'Reconnect Scout to import. Your queued lessons are kept.');
      workspaceSay(waiting.textContent);
    }
    var accountBtn = document.getElementById('accountBtn');
    if(accountBtn) accountBtn.setAttribute('data-radar-pending', String(state.matchedCount));
  }

  function applyTranscript(record){
    // Re-checked here, immediately before writing: the workspace may have become
    // occupied while the request was in flight.
    var box = notesBox();
    if(!box || !workspaceIdle()) return false;
    box.value = String(record.transcript || '');
    box.dispatchEvent(new Event('input', { bubbles: true }));
    workspaceSay('Scout transcript added to your lesson notes. Choose a protocol, then Generate feedback.');
    return box.value === String(record.transcript || '');
  }

  function cachedScope(){ return state.scopeKey && state.scopeKey === savedKey() ? state.scope : null; }
  function alreadyImported(id){ return !!state.applied[id] || hasReceipt(cachedScope(), id); }
  // Record that the transcript is in the notes (called only after applyTranscript confirmed it).
  function markImported(id){ state.applied[id] = true; addReceipt(cachedScope(), id); }

  // Only after the transcript is really in the notes box (or a receipt proves it was).
  async function acknowledge(meetingId){
    var scope = cachedScope();
    if(state.acking[meetingId]) return false;
    state.acking[meetingId] = true;
    try{
      for(var attempt = 0; attempt < 3; attempt++){
        try{
          var r = await api('POST', { action: 'ack-matched', meetingId: meetingId });
          if(r === null) return false;
          if(r.ok){ clearReceipt(scope, meetingId); delete state.retry[meetingId]; render(r.data); return true; }
        }catch(e){ /* retry */ }
        await new Promise(function(resolve){ setTimeout(resolve, 1200 * (attempt + 1)); });
      }
      state.retry[meetingId] = { n: 0, next: Date.now() + ACK_RETRY_BASE_MS };
      say('Imported, but the server could not confirm it yet. Your notes are unchanged and it will not be imported twice.');
      return false;
    }finally{ delete state.acking[meetingId]; }
  }

  // Outstanding receipts are retried whenever the page is open, even with the
  // notes occupied. One attempt per id per poll, exponential backoff, bounded.
  async function retryReceipts(){
    var ids = receiptIds(cachedScope()), gen = state.gen;
    for(var i = 0; i < ids.length; i++){
      var id = ids[i], ent = state.retry[id] || { n: 0, next: 0 }, now = Date.now();
      if(state.acking[id] || ent.n >= ACK_RETRY_LIMIT || now < ent.next) continue;
      ent.n++; ent.next = now + Math.min(ACK_RETRY_MAX_MS, ACK_RETRY_BASE_MS * Math.pow(2, ent.n - 1));
      state.retry[id] = ent;
      state.acking[id] = true;
      try{
        var scope = cachedScope();
        var r = await api('POST', { action: 'ack-matched', meetingId: id });
        if(r && r.ok){ clearReceipt(scope, id); delete state.retry[id]; render(r.data); }
      }catch(e){ /* backoff handles it */ }
      finally{ delete state.acking[id]; }
      if(gen !== state.gen) return;
    }
  }

  async function settleMatched(record){
    if(!record || !record.meetingId) return;
    // Previously imported (this page or an earlier load): acknowledge only, never reapply.
    if(alreadyImported(record.meetingId)){ await acknowledge(record.meetingId); return; }
    if(!applyTranscript(record)) return; // notes busy: it stays on the server
    markImported(record.meetingId);
    say('Imported "' + lessonHeading(record) + '" from Scout into your notes. No report was generated.');
    await acknowledge(record.meetingId);
  }

  async function claimItem(item, button){
    if(alreadyImported(item.meetingId)){ await acknowledge(item.meetingId); await poll(); return; }
    if(!workspaceIdle()){
      say('Your notes or report already have content, so nothing was imported or overwritten. Press New Student (or clear the notes), then claim again.');
      return;
    }
    button.disabled = true;
    try{
      var r = await api('POST', { action: 'claim', meetingId: item.meetingId });
      if(r === null) return;
      if(!r.ok){ say(r.status === 409 ? 'That lesson is already being imported or the inbox is busy. Try again in a moment.' : 'That lesson is no longer available.'); await poll(); return; }
      if(!workspaceIdle() || !applyTranscript(r.data.claimed)){
        say('Your notes changed while claiming, so nothing was imported or overwritten. The lesson returns to your inbox in about a minute.');
        render(r.data); return;
      }
      markImported(item.meetingId);
      say('Imported "' + lessonHeading(item) + '" into your notes. No report was generated.');
      render(r.data);
      await acknowledge(item.meetingId);
    }catch(e){
      say('Scout could not be reached. Nothing was imported.');
    }finally{ button.disabled = false; }
  }

  async function dismissItem(item, button){
    if(!window.confirm('Dismiss "' + lessonHeading(item) + '"? It will be removed from your PATHFINDER inbox without importing it or generating a report. This cannot be undone in PATHFINDER.')) return;
    button.disabled = true;
    try{
      var r = await api('POST', { action: 'dismiss', meetingId: item.meetingId });
      if(r && r.ok){ render(r.data); say('Lesson dismissed.'); } else if(r) say('Could not dismiss that lesson. Try again shortly.');
    }catch(e){ say('Scout could not be reached. Nothing was changed.'); }
    finally{ button.disabled = false; }
  }

  function schedule(){
    stopPolling();
    if(document.hidden || state.disabled || !savedKey()) return;
    // Not connected: nothing can arrive, so only outstanding ACK receipts keep a (slow) poll alive.
    if(!state.connected && !receiptIds(cachedScope()).length) return;
    var base = state.connected && workspaceIdle() ? ARMED_POLL_MS : IDLE_POLL_MS;
    var delay = Math.min(MAX_POLL_MS, base * Math.pow(2, Math.min(state.failures, 3)));
    state.timer = setTimeout(poll, delay);
  }

  // The cheap "unchanged?" check is used only when the view has nothing in
  // flight (no lesson waiting) and was fully refreshed recently, so
  // expiring records still drop off within FULL_REFRESH_MS.
  function sinceVersion(){
    return state.version !== null && !state.matchedCount && Date.now() - state.lastFull < FULL_REFRESH_MS ? state.version : null;
  }

  async function poll(){
    if(state.inflight) return;
    var key = savedKey();
    if(!key){ hideAll(); stopPolling(); return; }
    state.inflight = true;
    try{
      await currentScope();
      if(key !== savedKey()) return;
      var r = await api('GET', null, false, sinceVersion());
      if(r === null) return;
      if(r.status === 404 || r.status === 403 || r.status === 401){ hideAll(); stopPolling(); state.failures = 0; state.disabled = true; return; }
      if(!r.ok){ state.failures++; if(!section.hidden) say('Scout is temporarily unreachable. Retrying shortly.'); return; }
      state.failures = 0;
      if(r.data.unchanged){ await retryReceipts(); return; }
      // Migrate existing connected Scout accounts once; no token rotation,
      // no Krisp calls, and no extra ARM switch for the teacher.
      if(false && r.data.connected && !r.data.automatic){
        var automatic = await api('POST', { action: 'enable-automatic' });
        if(automatic === null) return;
        if(!automatic.ok){ state.failures++; workspaceSay('Scout automatic import could not be enabled. Retrying; your lessons are kept.'); return; }
        r = automatic;
      }
      render(r.data);
      // Scout is a separate pending inbox, not a silent notes autofill.
      // Claim into notes only when the owner explicitly requests it.
      await retryReceipts(); // after settleMatched: a leased, already-imported record must not be re-applied
    }catch(e){
      state.failures++;
    }finally{
      state.inflight = false;
      if(savedKey()) schedule();
    }
  }

  var pollSoonTimer = null;
  function pollSoon(){ clearTimeout(pollSoonTimer); pollSoonTimer = setTimeout(poll, 400); }

  function resetForAccount(){
    state.gen++; state.applied = {}; state.retry = {}; state.acking = {}; state.scopeKey = null; state.scope = null; state.failures = 0; state.disabled = false; state.version = null; state.lastFull = 0;
    hideAll(); stopPolling();
    if(savedKey()) poll();
  }

  async function connect(){
    var rotating = state.connected;
    if(rotating && !window.confirm('Replace the device token? The current token stops working immediately, so paste the new one into Scout right away.')) return;
    var button = $('ConnectBtn'); button.disabled = true;
    try{
      var r = await api('POST', { action: 'connect', automatic: true });
      if(r === null) return;
      if(!r.ok || !r.data.token){ say(r.status === 409 ? 'Scout is busy. Nothing was changed. Try again in a moment.' : r.status === 403 ? 'Scout is not available for this account.' : 'Could not create a token right now. Nothing was changed.'); return; }
      $('TokenField').value = r.data.token;
      r.data.token = null;
      $('TokenBox').hidden = false;
      render(r.data);
      say('Token created. Copy it now: it is shown only once.');
      $('TokenField').focus(); $('TokenField').select();
    }catch(e){ say('Scout could not be reached. Nothing was changed.'); }
    finally{ button.disabled = false; }
  }

  async function copyToken(){
    var field = $('TokenField');
    field.focus(); field.select();
    try{
      if(!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('unavailable');
      await navigator.clipboard.writeText(field.value);
      say('Token copied. Paste it into Scout now.');
    }catch(e){
      var copied = false;
      try{ copied = document.execCommand && document.execCommand('copy'); }catch(err){ copied = false; }
      say(copied ? 'Token copied. Paste it into Scout now.' : 'Your browser blocked copying. The token is selected: press Ctrl+C (Cmd+C on Mac) to copy it.');
    }
  }

  async function disconnect(){
    if(!window.confirm('Disconnect Scout? This revokes the device token on our server and stops automatic import. Removing the token inside the Scout desktop app does not revoke it. Lessons already in your inbox are kept.')) return;
    var button = $('DisconnectBtn'); button.disabled = true;
    try{
      var r = await api('POST', { action: 'disconnect' });
      if(r === null) return;
      if(r.ok){ hideToken(); render(r.data); say('Disconnected. The device token was revoked on the server. Automatic import is stopped.'); }
      else say(r.status === 409 ? 'Scout is busy, so the token was NOT revoked. Try again.' : 'Could not confirm the disconnect, so the token may still be active. Try again.');
    }catch(e){ say('Scout could not be reached. The token was NOT revoked. Try again.'); }
    finally{ button.disabled = false; }
  }

  $('ConnectBtn').addEventListener('click', connect);
  $('CopyBtn').addEventListener('click', copyToken);
  $('TokenDoneBtn').addEventListener('click', function(){ hideToken(); say('Token hidden. If you did not save it, press "Replace device token" to make a new one.'); $('ConnectBtn').focus(); });
  $('DisconnectBtn').addEventListener('click', disconnect);

  document.addEventListener('kidbuster:access-key-saved', resetForAccount);
  document.addEventListener('kidbuster:workspace-reset', pollSoon);
  // Owner-only installer: a fresh, five-minute private Blob URL is minted
  // only after the same server-side master fingerprint check as Scout itself.
  // Never expose this via the public scout-release.json manifest.
  var downloadButton = $('DownloadBtn');
  if (downloadButton) downloadButton.addEventListener('click', async function(){
    var key = savedKey(), status = $('DownloadStatus');
    if (!key || section.hidden) return;
    downloadButton.disabled = true;
    if (status) status.textContent = 'Preparing your private Scout download…';
    try {
      var res = await fetch('/api/radar-van-download', {
        method: 'GET', headers: { 'x-app-key': key }, cache: 'no-store'
      });
      var data = await res.json().catch(function(){ return {}; });
      if (key !== savedKey()) return;
      if (!res.ok || !data.downloadUrl) throw new Error(
        res.status === 403 ? 'Scout is restricted to the master account.' : 'Private download is temporarily unavailable.'
      );
      var url = new URL(data.downloadUrl);
      if (url.protocol !== 'https:' || !/^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/i.test(url.hostname) ||
          url.pathname !== '/releases/Classbuster-Scout-10ZU-Windows.zip' || url.username || url.password) {
        throw new Error('The private download URL is invalid.');
      }
      if (status) status.textContent = 'Your 10ZU download is starting. Extract the ZIP before running RadarVan.exe.';
      window.location.assign(url.href);
    } catch(err) {
      if (status) status.textContent = err.message || 'Could not start the Scout download.';
    } finally {
      downloadButton.disabled = false;
    }
  });

  // "disabled" (feature off / account not entitled) stays until the account changes or the page reloads.
  document.addEventListener('visibilitychange', function(){ if(document.hidden) stopPolling(); else if(savedKey() && !state.disabled){ Object.keys(state.retry).forEach(function(id){ state.retry[id].n = 0; }); poll(); } });
  document.getElementById('accountBtn')?.addEventListener('click', function(){ if(savedKey() && !state.disabled) pollSoon(); });
  window.addEventListener('storage', function(event){ if(event.key === KEY) resetForAccount(); });
  ['accountSignOutBtn', 'accountChangeKeyBtn'].forEach(function(id){ var b = document.getElementById(id); if(b) b.addEventListener('click', function(){ setTimeout(resetForAccount, 0); }); });
  var notes = notesBox();
  // Emptied notes: check now and switch to the fast automatic cadence.
  if(notes) notes.addEventListener('input', function(){ if((state.matchedCount || (state.connected && state.armed)) && workspaceIdle()) pollSoon(); });

  if(savedKey()) poll();
})();
