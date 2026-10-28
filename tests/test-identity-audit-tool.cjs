'use strict';
// End-to-end: the REAL owner audit tool (tools/identity-audit/run-identity-audit.mjs)
// runs as a separate process against the REAL admin route on a local server
// with a seeded in-memory database. Verifies classification, the
// --dry-run-repairs workflow (security review item 1), masked output with no
// raw keys or tokens, and that the audit leaves every customer record unchanged.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createChecker } = require('./helpers/assert.cjs');

const ROOT = path.resolve(__dirname, '..');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-identity-audit-tool.cjs ===');
  const saved = { kv: process.env.KIDBUSTER_TEST_KV, owner: process.env.OWNER_LICENSE_KEYS };
  process.env.KIDBUSTER_TEST_KV = '1';
  process.env.OWNER_LICENSE_KEYS = 'audit_tool_owner';
  const outDir = path.join(ROOT, '.v2-tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'identity-audit-test-' + crypto.randomBytes(4).toString('hex') + '.json');
  let server;
  try{
    const kvMod = await import('../api/_lib/kv-client.js');
    kvMod.__resetForTests();
    const lic = await import('../api/_lib/licensing.js');
    const ic = await import('../api/_lib/identity-continuity.js');
    const admin = (await import('../api/admin-license-lookup.js')).default;
    const { kv } = kvMod;

    // Seed: linked subscriber, paid record with missing index, email-less manual
    // key, stale index, and a Free duplicate of a paid email.
    const sub = (email, s) => ({ email, plan: 'pro', status: 'active', source: 'subscription', paymentCustomerId: 'cust_' + s, paymentSubscriptionId: s });
    await lic.saveLicense('kb_live_linked', sub('linked@example.test', 'sub_1')); await lic.saveEmailIndex('linked@example.test', 'kb_live_linked');
    await lic.saveLicense('kb_live_gap', sub('gap@example.test', 'sub_2'));
    await lic.saveLicense('kb_live_manual', { email: '', plan: 'pro', status: 'active', manual: true, source: 'manual', paymentCustomerId: null, paymentSubscriptionId: null });
    await lic.saveEmailIndex('stale@example.test', 'kb_live_deleted');
    await lic.saveLicense('kb_live_dupfree', { email: 'linked@example.test', plan: 'free', status: 'active', paymentCustomerId: null, paymentSubscriptionId: null });

    const snapshot = async () => {
      const [, keys] = await kv.scan('0', { match: '', count: 10000 });
      const out = {};
      for(const k of keys.filter(k => k.startsWith('license:') || k.startsWith('email:')).sort()) out[k] = JSON.stringify(await kv.get(k));
      return JSON.stringify(out);
    };
    const before = await snapshot();

    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        const out = { code: 200, headers: {}, status(c){ this.code = c; return this; }, setHeader(k, v){ this.headers[k] = v; },
          json(b){ res.writeHead(this.code, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); return this; } };
        if(req.url !== '/api/admin-license-lookup'){ res.writeHead(404); return res.end('{}'); }
        let parsed = {}; try{ parsed = JSON.parse(body || '{}'); }catch{}
        await admin({ method: req.method, headers: req.headers, body: parsed, query: {} }, out);
      });
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;

    const runTool = (extraArgs, env, targetOut = outFile) => new Promise(resolve => {
      const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'identity-audit', 'run-identity-audit.mjs'), '--base', base, '--out', targetOut, ...extraArgs],
        { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d);
      child.on('close', code => resolve({ code, stdout, stderr }));
    });

    const relative = await runTool([], { CLASSBUSTER_OWNER_KEY: 'audit_tool_owner' }, 'relative-report.json');
    check('relative audit output paths remain forbidden', relative.code !== 0 && relative.stderr.includes('absolute path'));

    const refused = await runTool([], { CLASSBUSTER_OWNER_KEY: 'not-the-owner' });
    check('the tool fails for a non-owner key', refused.code !== 0);

    const run1 = await runTool(['--dry-run-repairs'], { CLASSBUSTER_OWNER_KEY: 'audit_tool_owner' });
    check('the audit tool completes with --dry-run-repairs', run1.code === 0);
    if(run1.code !== 0) console.log('    tool stderr: ' + run1.stderr.slice(0, 400));
    const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    const ref = k => ic.keyFingerprint(k);
    check('scan reached the end of both key spaces', report.coverage.licenseScanComplete && report.coverage.indexScanComplete);
    check('the paid record with a missing index is listed as repairable', report.repairableUnique.some(r => r.ref === ref('kb_live_gap') && r.verdict === 'repairable_missing_index'));
    const dry = report.dryRuns.find(d => d.ref === ref('kb_live_gap'));
    check('its repair preview succeeds and would create the missing link', !!dry && dry.ok === true && dry.current === 'missing');
    check('the email-less manual key needs owner evidence', report.needsOwnerEvidence.some(r => r.ref === ref('kb_live_manual')));
    check('the stale index is reported', report.staleIndexes.some(r => r.verdict === 'stale_index_missing_record'));
    check('the linked subscriber is counted as ok', (report.licenseTotals.ok || 0) >= 1);
    const text = fs.readFileSync(outFile, 'utf8') + run1.stdout;
    check('no raw license key appears in the report or console', !/kb_live_[a-z0-9_]+/i.test(text.replace(/"ref":\s*"k_[0-9a-f]+"/g, '')));
    check('no candidate token appears in the report', !/candidateToken/.test(text));
    check('no raw customer email appears in the report', !/(linked|gap|stale)@example\.test/.test(text));
    check('no payment identifiers appear in the report', !/cust_|sub_[0-9]/.test(text));
    check('every customer record and email index is unchanged', await snapshot() === before);
  }catch(err){
    console.log('  FAIL  unexpected exception: ' + (err && err.stack || err));
    check('suite completed without exception', false);
  }finally{
    if(server) await new Promise(r => server.close(r));
    try{ fs.rmSync(outFile, { force: true }); }catch{}
    for(const [k, v] of [['KIDBUSTER_TEST_KV', saved.kv], ['OWNER_LICENSE_KEYS', saved.owner]]){ if(v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
