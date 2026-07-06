'use strict';
const { extractUsageStatsModule } = require('./helpers/extract-usage-stats.cjs');
const { extractKidbusterCore } = require('./helpers/extract-core.cjs');
const { createChecker } = require('./helpers/assert.cjs');

/**
 * Regression test for a real bug: when the Blitz protocol was added,
 * loadUsageStats()'s defaults object was never updated to include a
 * BLITZ entry, so recordGeneration('BLITZ', cost) crashed trying to read
 * `.reports` off of `undefined`. This test exists specifically so that
 * class of bug — a protocol added to PROTOCOLS but missed in some other
 * enumeration elsewhere in the file — can never silently reappear for
 * Blitz or any future protocol without a test failing first.
 */
module.exports = function run(){
  const { check, getFailures } = createChecker();

  console.log('\n=== test-usage-stats.cjs ===');

  console.log('\n1) recordGeneration works for every registered protocol, including Blitz');
  {
    const KidbusterCore = extractKidbusterCore();
    const protocolKeys = Object.keys(KidbusterCore.PROTOCOLS);
    check('PROTOCOLS has at least MA, MS, OF, BLITZ', ['MA', 'MS', 'OF', 'BLITZ'].every(k => protocolKeys.includes(k)));

    protocolKeys.forEach(key => {
      const { recordGeneration, kidbusterStats } = extractUsageStatsModule(); // fresh instance per protocol, no cross-talk
      let threw = false;
      try {
        recordGeneration(key, 0.001);
      } catch (err) {
        threw = true;
      }
      check('recordGeneration("' + key + '", ...) does not throw', !threw);

      if(!threw){
        const stats = kidbusterStats();
        check('stats.' + key + ' exists and recorded 1 report', stats[key] && stats[key].reports === 1);
      }
    });
  }

  console.log('\n2) kidbusterStats() totals include every protocol, not just the original three');
  {
    const { recordGeneration, kidbusterStats } = extractUsageStatsModule();
    recordGeneration('MA', 0.01);
    recordGeneration('MS', 0.02);
    recordGeneration('OF', 0.03);
    recordGeneration('BLITZ', 0.04);
    const stats = kidbusterStats();
    const expectedTotalReports = 4;
    const expectedTotalCost = 0.01 + 0.02 + 0.03 + 0.04;
    const actualTotalReports = stats.MA.reports + stats.MS.reports + stats.OF.reports + stats.BLITZ.reports;
    const actualTotalCost = stats.MA.cost + stats.MS.cost + stats.OF.cost + stats.BLITZ.cost;
    check('total reports across all 4 protocols = 4', actualTotalReports === expectedTotalReports);
    check('total cost across all 4 protocols matches', Math.abs(actualTotalCost - expectedTotalCost) < 1e-9);
  }

  console.log('\n3) Stats persist and merge correctly across a simulated reload (localStorage round-trip)');
  {
    // Simulate two "page loads" sharing one localStorage instance, the way
    // a real browser session would, rather than two fully-isolated helpers.
    const fs = require('fs');
    const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const startIdx = html.indexOf('const USAGE_STATS_KEY');
    const endIdx = html.indexOf('\n  return s;\n};', startIdx) + '\n  return s;\n};'.length;
    const code = html.slice(startIdx, endIdx);

    const sharedLocalStorage = {
      _data: {},
      getItem(k){ return Object.prototype.hasOwnProperty.call(this._data, k) ? this._data[k] : null; },
      setItem(k, v){ this._data[k] = String(v); }
    };

    const session1 = new Function('localStorage', 'window', code + '\nreturn { recordGeneration, kidbusterStats: window.kidbusterStats };')(sharedLocalStorage, {});
    session1.recordGeneration('BLITZ', 0.005);

    // "Reload": a brand new function scope, same underlying localStorage data.
    const session2 = new Function('localStorage', 'window', code + '\nreturn { recordGeneration, kidbusterStats: window.kidbusterStats };')(sharedLocalStorage, {});
    session2.recordGeneration('BLITZ', 0.005);
    const stats = session2.kidbusterStats();
    check('BLITZ reports persisted and accumulated across reload (2 total)', stats.BLITZ.reports === 2);
  }

  return getFailures();
};

if(require.main === module){
  const failures = module.exports();
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
