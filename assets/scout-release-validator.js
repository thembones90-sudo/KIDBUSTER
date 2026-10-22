/* One strict validator shared by the public Scout banner and onboarding. */
(function (root) {
  'use strict';
  root.validateScoutRelease = function (release) {
    if (!release || release.available !== true || release.platform !== 'Windows' ||
        !/^\d+\.\d+(?:\.\d+){0,2}(?:-[A-Za-z0-9.-]+)?$/.test(String(release.version || '')) ||
        !/^[0-9a-fA-F]{64}$/.test(String(release.sha256 || ''))) return null;
    let url;
    try { url = new URL(String(release.downloadUrl || '')); } catch { return null; }
    const github = url.hostname === 'github.com' &&
      /^\/thembones90-sudo\/[\w.-]+\/releases\/download\/[^/?#]+\/[^/?#]+\.(exe|msi|msix)$/i.test(url.pathname);
    const owned = url.hostname === 'classbuster.com' &&
      /^\/downloads\/[\w.-]+\.(exe|msi|msix)$/i.test(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || !(github || owned)) return null;
    return { ...release, url };
  };
})(window);
