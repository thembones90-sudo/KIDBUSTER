/* Public staging is a test environment. Customers must never be steered to
 * test-mode card payments when looking for a real Pro subscription.
 * This file is intentionally shipped on staging only.
 */
(() => {
  'use strict';
  const hostname = window.location.hostname.toLowerCase();
  if (!/^pathfinder-v2-staging(?:-|\.|$)/.test(hostname)) return;
  const liveUrl = 'https://kidbuster.vercel.app/';
  function init() {
    if (document.getElementById('stagingPaymentWarning')) return;
    const bar = document.createElement('div');
    bar.id = 'stagingPaymentWarning';
    bar.setAttribute('role', 'note');
    bar.style.cssText = 'box-sizing:border-box;width:100%;padding:9px 16px;background:#46300e;color:#fff0c7;font:600 13px/1.45 system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:center;text-align:center;position:relative;z-index:40';
    bar.append(document.createTextNode('TEST PREVIEW · Real cards cannot be used here.'));
    const link = document.createElement('a');
    link.href = liveUrl;
    link.textContent = 'Buy Pro on the live PATHFINDER site (sign in there)';
    link.style.cssText = 'color:#fff0c7;text-decoration:underline;text-underline-offset:2px;font-weight:700';
    bar.append(link);
    document.body.prepend(bar);
    ['accountUpgradeBtn', 'licenseModalProBtn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        if (id === 'licenseModalProBtn') {
          const label = document.getElementById('licenseModalProBtnLabel');
          if (label) label.textContent = 'Upgrade on live site';
        } else {
          btn.textContent = 'Upgrade on live site';
        }
      }
    });
    // Capture precedes pre-existing click handlers, so a staging upgrade can
    // never create a test checkout, including the dynamically-created button.
    document.addEventListener('click', event => {
      const el = event.target instanceof Element && event.target.closest('#accountUpgradeBtn,#licenseModalProBtn,#inlineUpgradeBtn');
      if (!el) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.location.assign(liveUrl);
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
