// The former address (kidbuster.vercel.app) no longer serves the app: it is a
// forwarding door to classbuster.com. Only a browser that still holds an old
// signed-in account stays, so the automatic account handoff in index.html can
// carry that identity over (it can only be read on the old origin). API routes
// (payment, Krisp and Scout webhooks) are untouched and keep answering here.
(function(root){
  var LEGACY = 'https://kidbuster.vercel.app', TARGET = 'https://classbuster.com';
  function legacyForwardTarget(loc, hasSavedAccount){
    if(!loc || loc.origin !== LEGACY) return null;
    var hash = loc.hash || '';
    if(hash === '#classbuster_transfer_start' && hasSavedAccount) return null; // handoff in progress
    var signInLink = /[?&]access_token=/.test(loc.search || '');
    if(hasSavedAccount && !signInLink) return null; // automatic handoff runs on this page
    return TARGET + (loc.pathname || '/') + (loc.search || '') + hash;
  }
  root.__legacyForwardTarget = legacyForwardTarget;
  var saved = false;
  try{ saved = !!root.localStorage.getItem('kidbuster_access_key'); }catch(e){ saved = false; }
  var target = legacyForwardTarget(root.location, saved);
  if(target) root.location.replace(target);
})(window);
