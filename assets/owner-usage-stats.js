/* Compact owner-only usage and estimated API-cost view.
 * Only a valid owner key can read the server aggregates.
 * No customer content or report text is ever returned or rendered.
 */
(() => {
  'use strict';

  const labels = Object.freeze({
    MA: 'Classic', MS: 'Sugarcoat', FAIRY: 'Fairy',
    BLITZ: 'Blitz', BEIDA: 'Beida', OF: 'Open Form', PREPLY: 'Preply'
  });
  const css = 'owner-usage-';
  const node = (tag, className, value) => {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (value !== undefined) n.textContent = value;
    return n;
  };
  const money = (nano, unknown = false) => {
    if (!Number.isSafeInteger(nano) || nano < 0) return '—';
    const dollars = nano / 1e9;
    const display = dollars > 0 && dollars < 0.0001
      ? '<$0.0001'
      : '$' + dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return (unknown ? '≥ ' : '≈ ') + display;
  };
  const count = number => Number.isSafeInteger(number) && number >= 0
    ? number.toLocaleString('en-US') : '—';

  function start() {
    const parent = document.querySelector('#accountOwnerTools > details.owner-fold');
    if (!parent || document.getElementById('ownerUsage')) return;

    const panel = node('details', 'owner-usage');
    panel.id = 'ownerUsage';
    const summary = node('summary');
    summary.append(node('span', css + 'title', 'Application statistics'));
    const teaser = node('span', css + 'teaser', 'Usage & estimated API spending');
    summary.append(teaser);
    panel.append(summary);

    const body = node('div', css + 'body');
    const controls = node('div', css + 'controls');
    const tabs = node('div', css + 'period');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Statistics period');
    const all = node('button', '', 'All time');
    const month = node('button', '', 'This month');
    all.type = month.type = 'button';
    all.setAttribute('aria-pressed', 'true');
    month.setAttribute('aria-pressed', 'false');
    const refresh = node('button', css + 'refresh', 'Refresh');
    refresh.type = 'button';
    tabs.append(all, month);
    controls.append(tabs, refresh);
    body.append(controls);

    const metrics = node('div', css + 'metrics');
    const figures = [];
    for (const label of ['Reports delivered', 'Known API spend', 'Avg. /report']) {
      const metric = node('div', css + 'metric');
      metric.append(node('span', css + 'label', label));
      const figure = node('span', css + 'number', '—');
      metric.append(figure);
      metrics.append(metric);
      figures.push(figure);
    }
    body.append(metrics);

    const table = node('table', css + 'protocols');
    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    for (const label of ['Protocol', 'Reports', 'Est. API cost']) {
      hrow.append(node('th', '', label));
    }
    thead.append(hrow);
    table.append(thead);
    const tbody = document.createElement('tbody');
    table.append(tbody);
    body.append(table);
    const foot = node('p', css + 'footnote', 'Not an invoice. Statistics begin when tracking goes live.');
    const status = node('p', css + 'footnote');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.hidden = true;
    body.append(foot, status);
    panel.append(body);
    parent.querySelector('summary').insertAdjacentElement('afterend', panel);

    let snapshot = null;
    let selection = 'lifetime';
    let pending = false;
    function render() {
      const stats = snapshot && (selection === 'lifetime' ? snapshot.lifetime : snapshot.currentMonth);
      if (!stats) return;
      all.setAttribute('aria-pressed', String(selection === 'lifetime'));
      month.setAttribute('aria-pressed', String(selection === 'currentMonth'));
      figures[0].textContent = count(stats.reports);
      figures[1].textContent = money(stats.allModelCalls?.knownNanoUsd, (stats.allModelCalls?.unknownCalls || 0) > 0);
      figures[2].textContent = stats.reports
        ? money(stats.deliveredSpend?.avgKnownNanoUsdPerReport, (stats.deliveredSpend?.unknownCalls || 0) > 0)
        : '—';
      if (snapshot.lifetime) {
        teaser.textContent = count(snapshot.lifetime.reports) + ' reports · ' +
          money(snapshot.lifetime.allModelCalls?.knownNanoUsd, (snapshot.lifetime.allModelCalls?.unknownCalls || 0) > 0) + ' API est.';
      }
      const frag = document.createDocumentFragment();
      for (const [code, label] of Object.entries(labels)) {
        const item = stats.byProtocol?.[code] || {};
        const tr = document.createElement('tr');
        tr.append(node('td', '', label));
        tr.append(node('td', '', count(item.reports || 0)));
        tr.append(node('td', '', money(item.apiSpend?.knownNanoUsd ?? 0, (item.apiSpend?.unknownCalls || 0) > 0)));
        frag.append(tr);
      }
      tbody.replaceChildren(frag);
      const date = snapshot.baseline?.firstRecordedAt;
      const since = date ? new Date(date).toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'}) : 'first successful tracking event';
      const unknown = stats.allModelCalls?.unknownCalls || 0;
      const failed = stats.allModelCalls?.undeliveredRuns || 0;
      foot.textContent = 'Tracked since ' + since + ' · UTC periods. API spend is an estimate, not an invoice. ' +
        'Protocol costs include tracked failed attempts as well as delivered reports.' +
        (failed ? ' Undelivered attempts: ' + count(failed) + '.' : '') +
        (unknown ? ' Unknown-cost calls: ' + count(unknown) + '; displayed spend is a lower bound.' : '');
    }
    function choose(period) {
      selection = period;
      if (snapshot) render();
      else load();
    }
    async function load() {
      if (pending) return;
      const ownerKey = typeof getStoredAccessKey === 'function' ? getStoredAccessKey() : null;
      if (!ownerKey) { status.hidden = false; status.textContent = 'Owner login required.'; return; }
      pending = true;
      refresh.disabled = true;
      status.hidden = false;
      status.classList.remove(css + 'error');
      status.textContent = 'Loading statistics…';
      try {
        const response = await fetch('/api/admin-license-lookup?action=usage-stats', {
          headers: { 'x-app-key': ownerKey }, cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.schema !== 'pathfinder-usage-stats-v1')
          throw new Error(data.error || 'Statistics are unavailable.');
        snapshot = data;
        render();
        status.hidden = true;
      } catch (error) {
        status.hidden = false;
        status.classList.add(css + 'error');
        status.textContent = 'Could not load statistics. ' + (error.message || '');
      } finally {
        pending = false;
        refresh.disabled = false;
      }
    }
    panel.addEventListener('toggle', () => { if (panel.open && !snapshot) load(); });
    all.addEventListener('click', () => choose('lifetime'));
    month.addEventListener('click', () => choose('currentMonth'));
    refresh.addEventListener('click', load);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
