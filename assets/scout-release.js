/* Public installer discovery, served from the release-approved static manifest. */
(() => {
  'use strict';
  async function mount() {
    const banner = document.getElementById('scoutReleaseBanner');
    const link = document.getElementById('scoutReleaseLink');
    const again = document.getElementById('scoutReleaseAgain');
    if (!banner || !link || !again) return;
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
      const preference = 'classbuster_scout_download_started_v1';
      const promo = banner.querySelector('.scout-release-promo');
      const done = banner.querySelector('.scout-release-done');
      function quiet(startedNow,moveFocus=false) {
        banner.dataset.downloaded = 'true';
        banner.setAttribute('aria-labelledby','scoutReleaseSetupTitle');
        promo.inert = true; promo.setAttribute('aria-hidden','true');
        done.inert = false; done.removeAttribute('aria-hidden');
        if (startedNow) {
          document.getElementById('scoutReleaseMessage').textContent = 'Download started. Run the installer to finish setup.';
          if(moveFocus)again.focus({preventScroll:true});
        }
      }
      function started(moveFocus) {
        try { localStorage.setItem(preference,'1'); } catch { /* Storage may be disabled. */ }
        // Let the original link activation finish before making it inert.
        setTimeout(() => quiet(true,moveFocus),0);
      }
      for (const action of [link,again]) {
        action.href = url.href; action.rel = 'noopener noreferrer'; action.target = '_blank';
        action.addEventListener('click', () => started(true));
      }
      window.addEventListener('classbuster:scout-download-started',()=>started(false));
      try { if (localStorage.getItem(preference)==='1') quiet(false); } catch { /* Download still works. */ }
      window.addEventListener('storage',event=>{
        if(event.key===preference&&event.newValue==='1') quiet(false);
      });
      banner.hidden = false;
    } catch {
      // A missing/unavailable release must not interrupt report generation.
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
