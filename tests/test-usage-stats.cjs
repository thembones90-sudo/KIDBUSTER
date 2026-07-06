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

  console.log('\n4) Per-generation history log: recordGeneration\'s optional 3rd arg persists full detail');
  {
    const { recordGeneration, loadGenerationHistory } = extractUsageStatsModule();
    check('history starts empty', loadGenerationHistory().length === 0);

    recordGeneration('MA', 0.0123, {
      teacherName: 'Layne', studentName: 'Oscar', rating: '4', lengthFormat: 'long',
      inputTokens: 500, cacheCreationTokens: 2000, cacheReadTokens: 0, outputTokens: 300, reportChars: 4200
    });
    const afterOne = loadGenerationHistory();
    check('one entry recorded', afterOne.length === 1);
    check('entry has correct protocol/teacher/student/cost', afterOne[0].protocol === 'MA' && afterOne[0].teacherName === 'Layne' && afterOne[0].studentName === 'Oscar' && afterOne[0].cost === 0.0123);
    check('entry has a timestamp', typeof afterOne[0].timestamp === 'number' && afterOne[0].timestamp > 0);
    check('entry has full token breakdown, not just a total', afterOne[0].inputTokens === 500 && afterOne[0].cacheCreationTokens === 2000 && afterOne[0].outputTokens === 300);

    recordGeneration('BLITZ', 0.001); // no detail arg — the "no usage data" call-site path
    const afterTwo = loadGenerationHistory();
    check('call without detail arg does NOT add a history entry (only the one above)', afterTwo.length === 1);
  }

  console.log('\n5) History is capped so it can\'t grow unbounded');
  {
    const { recordGeneration, loadGenerationHistory } = extractUsageStatsModule();
    for(let i = 0; i < 510; i++){
      recordGeneration('MA', 0.001, { teacherName: 'Layne', studentName: 'Student' + i, rating: '3', lengthFormat: 'long', inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 10, reportChars: 100 });
    }
    const history = loadGenerationHistory();
    check('history capped at 500 entries even after 510 recorded', history.length === 500);
    check('the cap keeps the MOST RECENT entries (oldest dropped first)', history[history.length - 1].studentName === 'Student509');
    check('...specifically drops the earliest ones, not the newest', !history.some(e => e.studentName === 'Student0'));
  }

  console.log('\n6) kidbusterHistory() console helper: correct slicing and raw-array return');
  {
    const { recordGeneration, kidbusterHistory } = extractUsageStatsModule();
    for(let i = 0; i < 25; i++){
      recordGeneration('OF', 0.002, { teacherName: 'Layne', studentName: 'S' + i, rating: 'Medium', lengthFormat: null, inputTokens: 10, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 10, reportChars: 200 });
    }
    const defaultCall = kidbusterHistory();
    check('default call returns the FULL raw history array (25 entries), even though it only PRINTS a default of 20', defaultCall.length === 25);

    const limited = kidbusterHistory(5);
    check('kidbusterHistory(5) still returns the full raw array (limit only affects what\'s printed)', limited.length === 25);
  }

  console.log('\n7) kidbusterExportHistoryCSV(): well-formed CSV with a header row matching entry fields');
  {
    const { recordGeneration, kidbusterExportHistoryCSV } = extractUsageStatsModule();
    recordGeneration('MS', 0.0045, { teacherName: 'Nina', studentName: 'Kaya', rating: '2', lengthFormat: 'medium', inputTokens: 400, cacheCreationTokens: 0, cacheReadTokens: 3000, outputTokens: 250, reportChars: 2800 });
    const csv = kidbusterExportHistoryCSV();
    const lines = csv.trim().split('\n');
    check('CSV has a header row plus one data row', lines.length === 2);
    check('header row lists the expected fields', lines[0] === 'timestamp,protocol,teacherName,studentName,rating,lengthFormat,inputTokens,cacheCreationTokens,cacheReadTokens,outputTokens,cost,reportChars');
    check('data row contains the actual recorded values', lines[1].includes('MS') && lines[1].includes('Nina') && lines[1].includes('Kaya') && lines[1].includes('0.0045'));
  }

  return getFailures();
};

if(require.main === module){
  const failures = module.exports();
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
