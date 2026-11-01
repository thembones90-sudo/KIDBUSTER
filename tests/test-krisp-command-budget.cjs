'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

function run(){
  const html = fs.readFileSync('index.html','utf8');
  const session = fs.readFileSync('api/krisp-session.js','utf8');
  assert.match(html,/setInterval\(pollBudget.tick,\s*15000\)/,
    'Krisp polling must stay at 15-second reduced cadence');
  assert.doesNotMatch(html,/setInterval\(refreshKrispSession,/,
    'the Krisp poll must go through the visibility/backoff budget, never straight to the server');
  assert.doesNotMatch(html,/setInterval\((refreshKrispSession|pollBudget\.tick),\s*5000\)/,
    '5-second Redis polling must not return');
  assert.match(session,/if\(JSON\.stringify\(queue\)!==queueBeforeMutation\)\{\s*await writeImportQueue\(/,
    'unchanged queues must not be rewritten on idle polls');
  // 2026-11-01 integration of the cost-guards branch onto the live line.
  assert.match(session,/await kv\.mget\(\s*licenseKeyFor\(licenseKey\)/,
    'idle inbox polls read license, mapping and queues in one MGET');
  assert.match(session,/req\.query\?\.verify !== '1'/,
    'verify=1 keeps the full token repair path');
  assert.match(html,/away:\s*function\(\)\{\s*return Date\.now\(\) - krispLastActivityAt;\s*\}/,
    'away-from-keyboard floor is wired into the shared budget');
  assert.match(html,/pollBudget\.demand\(\)/,
    'returning to the window refreshes through the bounded demand path');
  assert.match(html,/if\(accountRejected\)\{\s*if\(pollTimer\) clearInterval\(pollTimer\);\s*pollTimer = null;/,
    'an explicit 401/403 stops background discovery instead of retrying forever');
  console.log('PASS Krisp command budget: reduced polling, one-MGET idle reads, away floor, demand refresh and no-op queue writes');
  return 0;
}
module.exports = run;
if(require.main === module) run();
