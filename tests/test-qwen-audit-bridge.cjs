'use strict';
const fs = require('fs');
const path = require('path');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-qwen-audit-bridge.cjs ===');
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'qwen-supervised-audit.mjs'), 'utf8');

  check('Qwen receives only read/search/diff tools',
    /name:'read_lines'/.test(source) && /name:'search'/.test(source) && /name:'read_diff'/.test(source) &&
    !/name:'(?:write|shell|exec|git|deploy)/.test(source));
  check('file reads require an explicit per-task allowlist',
    source.includes("task.files.includes(relative)") && source.includes("Path escaped repository"));
  check('individual source reads are bounded',
    source.includes('end-start>299') && source.includes('Request at most 300 consecutive lines'));
  check('diff output is bounded', source.includes('.slice(0,60000)'));
  check('audit output stays inside the V2 repository',
    source.includes("path.join(ROOT,'artifacts','qwen-audits')"));
  check('forced synthesis disables tools and forbids invented execution evidence',
    source.includes('chat(messages,false)') && source.includes('Do not claim tests were run or code was executed'));

  return getFailures();
};

if(require.main === module){
  const failures = module.exports();
  console.log('\n' + (failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
  process.exit(failures === 0 ? 0 : 1);
}
