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
      link.href = url.href;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
      version.textContent = 'Windows · Version ' + release.version;
      checksum.textContent = 'SHA-256: ' + release.sha256.toLowerCase();
      banner.hidden = false;
      window.ClassbusterScoutRelease = {downloadUrl:url.href,version:release.version,sha256:release.sha256.toLowerCase()};
      document.dispatchEvent(new CustomEvent('classbuster:scout-release'));
    } catch {
      // A missing/unavailable release must not interrupt report generation.
    }
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
