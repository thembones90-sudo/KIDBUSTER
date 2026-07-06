'use strict';

/**
 * Runs every test-*.cjs file in this folder and reports an aggregate
 * summary. Each test file exports a run() function returning its own
 * failure count (rather than calling process.exit itself), so this
 * runner can execute all of them in one process and give one final
 * pass/fail verdict — usable both locally (`npm test`) and in CI.
 *
 * Every test file can also still be run completely on its own, e.g.
 * `node tests/test-blitz.cjs`, for fast iteration on one area without
 * running the whole suite.
 */

const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;

const testFiles = fs.readdirSync(TESTS_DIR)
  .filter(name => name.startsWith('test-') && name.endsWith('.cjs'))
  .sort();

if(testFiles.length === 0){
  console.error('No test-*.cjs files found in ' + TESTS_DIR);
  process.exit(1);
}

let totalFailures = 0;
const results = [];

testFiles.forEach(fileName => {
  const filePath = path.join(TESTS_DIR, fileName);
  let failures;
  let crashed = false;
  try {
    const runTestFile = require(filePath);
    failures = runTestFile();
  } catch (err) {
    crashed = true;
    failures = 1;
    console.error('\n!! ' + fileName + ' threw instead of returning a result:');
    console.error(err.stack || err.message);
  }
  results.push({ fileName, failures, crashed });
  totalFailures += failures;
});

console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
results.forEach(({ fileName, failures, crashed }) => {
  const status = crashed ? 'CRASHED' : (failures === 0 ? 'PASS' : failures + ' FAILED');
  console.log('  ' + status.padEnd(10) + fileName);
});
console.log('='.repeat(60));
console.log(totalFailures === 0
  ? 'ALL ' + testFiles.length + ' TEST FILES PASSED'
  : totalFailures + ' TOTAL CHECK(S) FAILED across ' + testFiles.length + ' test files');

process.exit(totalFailures === 0 ? 0 : 1);
