'use strict';
// The former address is only a forwarding door (owner decision 2026-10-23):
// visitors go to classbuster.com; a browser with an old signed-in account stays
// just long enough for the automatic account handoff. Webhook APIs untouched.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createChecker } = require('./helpers/assert.cjs');
const ROOT = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'legacy-forward.js'), 'utf8');

function visit(url, { saved = false, storageThrows = false } = {}){
  const u = new URL(url);
  const replaced = [];
  const window = {
    location: { origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash, replace: t => replaced.push(t) },
    localStorage: { getItem: k => { if(storageThrows) throw new Error('blocked'); return saved && k === 'kidbuster_access_key' ? 'kb_live_x' : null; } }
  };
  vm.runInNewContext(SOURCE, { window });
  return replaced[0] || null;
}

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-legacy-forward.cjs ===');
  check('a new visitor on the old address goes to classbuster.com',
    visit('https://kidbuster.vercel.app/') === 'https://classbuster.com/');
  check('path, query and hash are kept',
    visit('https://kidbuster.vercel.app/?lang=sr#access') === 'https://classbuster.com/?lang=sr#access');
  check('an email sign-in link on the old address is forwarded intact',
    visit('https://kidbuster.vercel.app/?access_token=abc123', { saved: true }) === 'https://classbuster.com/?access_token=abc123');
  check('a browser with an old signed-in account stays for the automatic handoff',
    visit('https://kidbuster.vercel.app/', { saved: true }) === null);
  check('a handoff already in progress is not interrupted',
    visit('https://kidbuster.vercel.app/#classbuster_transfer_start', { saved: true }) === null);
  check('the transfer link without a saved account goes to classbuster.com',
    visit('https://kidbuster.vercel.app/#classbuster_transfer_start') === 'https://classbuster.com/#classbuster_transfer_start');
  check('blocked storage counts as no saved account (forwarded)',
    visit('https://kidbuster.vercel.app/', { storageThrows: true }) === 'https://classbuster.com/');
  check('classbuster.com itself is never redirected',
    visit('https://classbuster.com/', { saved: true }) === null && visit('https://classbuster.com/') === null);
  check('preview and local hosts are never redirected',
    visit('http://127.0.0.1:3000/') === null && visit('https://kidbuster-abc-team.vercel.app/') === null);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('the forwarding script loads before any other script',
    /^<script src="assets\/legacy-forward\.js/.test(html.slice(html.indexOf('<script'))));
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  check('no server redirect touches the old address or API routes (webhooks keep working)',
    !(config.redirects || []).some(r => /kidbuster|\/api/.test(JSON.stringify(r))));
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
