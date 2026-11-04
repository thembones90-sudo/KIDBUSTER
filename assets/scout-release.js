/* Public installer discovery, served from the release-approved static manifest. */
(() => {
  'use strict';
  async function mount() {
    const banner = document.getElementById('scoutReleaseBanner');
    const link = document.getElementById('scoutReleaseLink');
    const dismiss = document.getElementById('scoutReleaseDismiss');
    if (!banner || !link || !dismiss) return;
    // Browser-local setup preference, never proof of installation or entitlement.
    // The HTML starts hidden: remembered dismissal never flashes or reserves space.
    const preference = 'classbuster_scout_download_started_v1';
    let dismissed = false;
    try { dismissed = localStorage.getItem(preference) === '1'; } catch { /* Memory-only fallback. */ }
    function hide(remember = true) {
      dismissed = true;
      const ownsFocus = banner.contains(document.activeElement);
      banner.hidden = true;
      if (remember) {
        try { localStorage.setItem(preference, '1'); } catch { /* Still hide in this page. */ }
      }
      if (ownsFocus) document.getElementById('krispNotes')?.focus({preventScroll:true});
    }
    // Account downloads and verified connections use their existing flows.
    window.addEventListener('classbuster:scout-download-started', () => hide());
    window.addEventListener('classbuster:scout-connected', () => hide());
    window.addEventListener('storage', event => {
      if (event.key === preference && event.newValue === '1') hide(false);
    });
    dismiss.addEventListener('click', () => hide());
    if (document.getElementById('radarVanState')?.dataset.state === 'connected') hide();
    try {
      const response = await fetch('/assets/scout-release.json',{cache:'no-store',credentials:'omit'});
      if (!response.ok) return;
      const release = await response.json();
      if (release.available !== true || release.platform !== 'Windows' ||
          !/^\d+\.\d+(?:\.\d+){0,2}(?:-[A-Za-z0-9.-]+)?$/.test(release.version) ||
          !/^[0-9a-fA-F]{64}$/.test(release.sha256)) return;
      const url = new URL(release.downloadUrl);
      const github = url.hostname === 'github.com' &&
        /^\/thembones90-sudo\/[\w.-]+\/releases\/download\/[^/?#]+\/[^/?#]+\.(exe|msi|msix)$/i.test(url.pathname);
      const owned = url.hostname === 'classbuster.com' &&
        /^\/downloads\/[\w.-]+\.(exe|msi|msix)$/i.test(url.pathname);
      if (url.protocol !== 'https:' || url.username || url.password ||
          url.search || url.hash || url.port || !(github || owned)) return;
      // Release identity/hash remain validated above, never rendered as UI copy.
      link.href = url.href; link.rel = 'noopener noreferrer'; link.target = '_blank';
      link.addEventListener('click', () => {
        // Let the original link activation finish before removing its layout box.
        setTimeout(() => hide(), 0);
      });
      banner.hidden = dismissed;

    } catch {
      // A missing/unavailable release must not interrupt report generation.
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
