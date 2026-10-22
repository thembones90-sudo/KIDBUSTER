/* Public installer discovery, served from the release-approved static manifest. */
(() => {
  'use strict';
  async function mount() {
    const banner = document.getElementById('scoutReleaseBanner');
    const link = document.getElementById('scoutReleaseLink');
    const version = document.getElementById('scoutReleaseVersion');
    const checksum = document.getElementById('scoutReleaseChecksum');
    if (!banner || !link || !version || !checksum) return;
    try {
      const response = await fetch('/assets/scout-release.json',{cache:'no-store',credentials:'omit'});
      if (!response.ok) return;
      const release = await response.json();
      const checked = window.validateScoutRelease && window.validateScoutRelease(release);
      if (!checked) return;
      const url = checked.url;
      link.href = url.href;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      version.textContent = 'Windows · Version ' + release.version;
      checksum.textContent = 'SHA-256: ' + release.sha256.toLowerCase();
      banner.hidden = false;
    } catch {
      // A missing/unavailable release must not interrupt report generation.
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
