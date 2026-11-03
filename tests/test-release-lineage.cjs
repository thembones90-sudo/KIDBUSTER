'use strict';
// Release lineage guard (2026-11-03): a release must contain what is live.
// Pure decisions with synthetic history; no network, git or deployment.
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-release-lineage.cjs ===');
  const { decide, referencedFiles } = await import('../tools/release/lineage.mjs');

  // Synthetic history newest first: c3 (candidate) <- c2 <- c1. Blob ids are
  // stand-ins: blobOf returns the bytes' text.
  const trees = {
    c3: { 'index.html': 'page-v3', 'assets/app.js': 'app-v3' },
    c2: { 'index.html': 'page-v2', 'assets/app.js': 'app-v2' },
    c1: { 'index.html': 'page-v2', 'assets/app.js': 'app-v1' },
  };
  const order = ['c3', 'c2', 'c1'];
  const adapters = (candidate = 'c3') => ({
    candidate, history: order.slice(order.indexOf(candidate)),
    treeIds: (c, paths) => Object.fromEntries(paths.map(p => [p, trees[c][p] ?? null])),
    isAncestor: (a, b) => order.indexOf(a) >= order.indexOf(b),
    blobOf: (_p, bytes) => String(bytes),
  });
  const live = files => ({ kind: 'fingerprint', files });

  console.log('\n1) release stamp');
  check('candidate containing the stamped live commit is accepted', decide({ kind: 'stamp', commit: 'c2' }, adapters()).ok === true);
  const behind = decide({ kind: 'stamp', commit: 'c3' }, adapters('c2'));
  check('candidate missing the stamped live commit is refused', behind.ok === false && /does not contain the live release/.test(behind.reason));

  console.log('\n2) releases made without the tool: fingerprint');
  check('live files matching an ancestor are accepted', decide(live({ 'index.html': 'page-v2', 'assets/app.js': 'app-v2' }), adapters()).ok === true);
  const scriptOnly = decide(live({ 'index.html': 'page-v2', 'assets/app.js': 'app-live-elsewhere' }), adapters());
  check('same page but a different script is refused (the 2026-11-02 regression)', scriptOnly.ok === false && /No commit/.test(scriptOnly.reason));
  check('a live release newer than the candidate is refused', decide(live({ 'index.html': 'page-v3', 'assets/app.js': 'app-v3' }), adapters('c2')).ok === false);
  check('it identifies which commit is live', decide(live({ 'index.html': 'page-v2', 'assets/app.js': 'app-v1' }), adapters()).live === 'c1');

  console.log('\n3) which live files are compared');
  const refs = referencedFiles('<link rel="stylesheet" href="/legal.css"><script src="assets/a.js?v=2"></script><link href="assets/b.css"><img src="assets/x.png"><script src="https://cdn.example/x.js"></script><script src="assets/../secret.js"></script>');
  check('page, same-origin scripts and styles; no images, other sites or path escapes',
    JSON.stringify(refs) === JSON.stringify(['assets/a.js', 'assets/b.css', 'index.html', 'legal.css']));
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
