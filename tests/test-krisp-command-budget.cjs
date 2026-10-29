'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

function run(){
  const html = fs.readFileSync('index.html','utf8');
  const session = fs.readFileSync('api/krisp-session.js','utf8');
  assert.match(html,/setInterval\(refreshKrispSession,\s*15000\)/,
    'Krisp polling must stay at 15-second reduced cadence');
  assert.doesNotMatch(html,/setInterval\(refreshKrispSession,\s*5000\)/,
    '5-second Redis polling must not return');
  assert.match(session,/if\(JSON\.stringify\(queue\)!==queueBeforeMutation\)\{\s*await writeImportQueue\(/,
    'unchanged queues must not be rewritten on idle polls');
  console.log('PASS Krisp command budget: reduced polling and no-op queue writes');
  return 0;
}
module.exports = run;
if(require.main === module) run();
