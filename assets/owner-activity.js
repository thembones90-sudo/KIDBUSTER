/* Owner-only "Recent activity": the last 7 days of content-free events
 * (sign-ins, payments, Scout deliveries, failures, alerts). Only a valid owner
 * key can read them; no customer content, keys or full emails are returned.
 */
(() => {
  'use strict';
  const describe = e => {
    switch (e.type) {
      case 'payment': return 'Payment processed (' + (e.event || 'event') + ')';
      case 'payment_failed': return 'Payment event FAILED (' + (e.event || 'event') + ') - provider retries';
      case 'sign_in': return 'Sign-in by ' + (e.via === 'email_link' ? 'email link' : 'old-address transfer') + ' (' + (e.plan || 'free') + ')';
      case 'scout_delivery': return e.duplicate ? 'Scout lesson re-sent (already stored)' : 'Scout lesson delivered';
      case 'generation_failed': return 'Report generation failed (HTTP ' + (e.status || '?') + ')';
      case 'alert': return 'Alert: ' + (e.title || e.alert || '');
      case 'daily': return 'Daily check: ' + (e.expiring || 0) + ' key(s) expiring, ' + (e.failuresLast24h || 0) + ' failure(s) in 24 h';
      default: return e.type;
    }
  };
  const bad = e => e.type === 'payment_failed' || e.type === 'generation_failed' || e.type === 'alert';

  function start() {
    const parent = document.querySelector('#accountOwnerTools > details.owner-fold');
    if (!parent || document.getElementById('ownerActivity')) return;
    const panel = document.createElement('details');
    panel.id = 'ownerActivity'; panel.className = 'owner-usage';
    const summary = document.createElement('summary');
    const title = document.createElement('span'); title.className = 'owner-usage-title'; title.textContent = 'Recent activity';
    const teaser = document.createElement('span'); teaser.className = 'owner-usage-teaser'; teaser.textContent = 'Sign-ins, payments, Scout, problems (7 days)';
    summary.append(title, teaser);
    const body = document.createElement('div'); body.className = 'owner-usage-body';
    const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'owner-usage-refresh'; refresh.textContent = 'Refresh';
    const list = document.createElement('ul'); list.className = 'owner-activity-list';
    const status = document.createElement('p'); status.className = 'owner-usage-footnote'; status.setAttribute('role', 'status');
    const controls = document.createElement('div'); controls.className = 'owner-usage-controls';
    controls.append(refresh);
    body.append(controls, list, status);
    panel.append(summary, body);
    (document.getElementById('ownerUsage') || parent.querySelector('summary')).insertAdjacentElement('afterend', panel);

    let loaded = false, pending = false;
    async function load() {
      if (pending) return;
      const ownerKey = typeof getStoredAccessKey === 'function' ? getStoredAccessKey() : null;
      if (!ownerKey) { status.textContent = 'Owner login required.'; return; }
      pending = true; refresh.disabled = true; status.textContent = 'Loading…';
      try {
        const response = await fetch('/api/admin-license-lookup?action=recent-events', { headers: { 'x-app-key': ownerKey }, cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.events)) throw new Error(data.error || 'Activity is unavailable.');
        list.replaceChildren(...data.events.map(e => {
          const li = document.createElement('li');
          if (bad(e)) li.className = 'owner-activity-bad';
          const when = new Date(e.at);
          li.textContent = when.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '  ' + describe(e);
          return li;
        }));
        const problems = data.events.filter(bad).length;
        teaser.textContent = problems ? problems + ' problem(s) in 7 days' : 'No problems in 7 days';
        status.textContent = data.events.length ? '' : 'No activity recorded yet.';
        loaded = true;
      } catch (error) {
        status.textContent = 'Could not load activity. ' + (error.message || '');
      } finally { pending = false; refresh.disabled = false; }
    }
    panel.addEventListener('toggle', () => { if (panel.open && !loaded) load(); });
    refresh.addEventListener('click', load);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
