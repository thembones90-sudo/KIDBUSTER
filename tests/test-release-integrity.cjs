'use strict';
// The release integrity gate (Vercel build command) passes on this tree and
// fails a deployment that silently loses Scout, owner statistics, the
// fail-closed owner gate, the Krisp self-heal or a route. Offline only.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createChecker } = require('./helpers/assert.cjs');

const ROOT = path.resolve(__dirname, '..');
const COPY = ['index.html', 'vercel.json', '.vercelignore', 'api', 'assets/radar-van-client.js', 'assets/scout-integration.css',
  'assets/owner-usage-stats.js', 'assets/owner-usage-stats.css', 'assets/scout-release.js', 'assets/scout-release.json', 'scripts'];

module.exports = function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-release-integrity.cjs ===');
  const { checkRelease } = require('../scripts/verify-release-integrity.cjs');
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  check('every Vercel deployment runs the integrity gate as its build', config.buildCommand === 'node scripts/verify-release-integrity.cjs');
  const ignored = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  check('the gate script is uploaded with the deployment', !ignored.some(p => p === 'scripts/' || p === 'scripts' || p === '/scripts/'));
  const current = checkRelease(ROOT);
  check('this tree passes the gate', current.length === 0);
  if(current.length) console.log('    ' + current.join('\n    '));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-'));
  const fresh = () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'case-'));
    for(const rel of COPY) fs.cpSync(path.join(ROOT, rel), path.join(dir, rel), { recursive: true });
    return dir;
  };
  const edit = (dir, rel, fn) => fs.writeFileSync(path.join(dir, rel), fn(fs.readFileSync(path.join(dir, rel), 'utf8')));
  const fails = (label, mutate, pattern) => {
    const dir = fresh();
    mutate(dir);
    const problems = checkRelease(dir);
    check('gate fails when ' + label, problems.some(p => pattern.test(p)));
  };
  try{
    check('a faithful copy passes', checkRelease(fresh()).length === 0);
    fails('the Scout backend is missing', d => fs.rmSync(path.join(d, 'api/_lib/radar-van.js')), /Scout backend/);
    fails('the Scout ingest route is missing', d => fs.rmSync(path.join(d, 'api/_lib/radar-van-ingest-handler.js')), /device ingest/);
    fails('the page stops loading the Scout client', d => edit(d, 'index.html', s => s.replaceAll('assets/radar-van-client.js', 'assets/x.js')), /radar-van-client/);
    fails('the owner gate fails open again', d => edit(d, 'api/_lib/radar-van.js', s => s.replace(/if\(!configured\)\s*return\s+false;/, "if(configured === undefined) return true;")), /fails OPEN|missing fingerprint/);
    fails('the founder check is dropped', d => edit(d, 'api/_lib/radar-van.js', s => s.replace(/!isFounderLicenseKey\(identity\)/, 'false')), /founder/);
    fails('owner usage statistics are missing', d => fs.rmSync(path.join(d, 'api/_lib/usage-stats.js')), /usage statistics/);
    fails('generation stops recording usage', d => edit(d, 'api/generate.js', s => s.replaceAll('recordUsageStats', 'noop')), /records usage/);
    fails('the Krisp self-heal is reverted', d => edit(d, 'api/_lib/krisp-token.js', s => s.replaceAll('tokenResolvesToLicense', 'legacyLookup')), /Krisp self-heal/);
    fails('a Scout rewrite is removed', d => edit(d, 'vercel.json', s => s.replace('"/api/radar-van-ingest"', '"/api/other"')), /rewrite \/api\/radar-van-ingest/);
    fails('feedback stops dispatching Scout', d => edit(d, 'api/feedback.js', s => s.replaceAll('radar-van-session-handler.js', 'x.js')), /dispatches/);
    fails('the function budget is exceeded', d => fs.writeFileSync(path.join(d, 'api/extra-function.js'), 'export default ()=>{}'), /serverless functions/);
    fails('the Scout download manifest is broken', d => fs.writeFileSync(path.join(d, 'assets/scout-release.json'), '{nope'), /valid JSON/);
  }finally{ fs.rmSync(tmp, { recursive: true, force: true }); }
  return getFailures();
};
if(require.main === module) process.exit(module.exports() ? 1 : 0);
