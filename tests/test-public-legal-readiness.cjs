'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

function run(){
  let failures = 0;
  const check = (label, fn) => {
    try { fn(); console.log('PASS ' + label); }
    catch(err){ failures++; console.error('FAIL ' + label + ': ' + err.message); }
  };
  const pages = ['privacy-policy.html', 'terms-of-use.html', 'disclaimers.html'];
  check('public legal pages use the current brand', () => {
    for(const file of pages){
      const html = read(file);
      assert.match(html, /Classbuster/);
      assert.doesNotMatch(html, /Pathfinder/i);
      assert.match(html, /<title>[^<]+Classbuster<\/title>/);
    }
  });
  check('privacy policy discloses Krisp and separate Scout flows', () => {
    const html = read('privacy-policy.html');
    assert.match(html, /12-hour expiry/);
    assert.match(html, /older.*Krisp imports/i);
    assert.match(html, /Scout local delivery/);
    assert.match(html, /does not require connecting Krisp/i);
    assert.match(html, /consent/i);
  });
  check('both public route aliases resolve to available legal files', () => {
    const rewrites = JSON.parse(read('vercel.json')).rewrites;
    for(const [source, destination] of [['/privacy', '/privacy-policy.html'], ['/terms', '/terms-of-use.html']]){
      assert.ok(rewrites.some(rule => rule.source === source && rule.destination === destination));
      assert.ok(fs.existsSync(path.join(root, destination.slice(1))));
    }
  });
  check('pro marketing cannot say unlimited when a default daily cap is enforced', () => {
    const licensing = read('api/_lib/licensing.js');
    const hasDailyLimit = /PRO_DAILY_REPORT_LIMIT_DEFAULT\s*=\s*35/.test(licensing);
    if(hasDailyLimit) assert.doesNotMatch(read('index.html'), /Unlimited reports/i);
  });
  return failures;
}
module.exports = run;
if(require.main === module) process.exitCode = run() ? 1 : 0;
