'use strict';
// Feedback intelligence: feedback is stored in Pathfinder's own datastore
// (staging has no Google Sheet), joined server-side to content-free
// telemetry of the rated report, and summarized for the owner only.
const fs = require('fs');
const path = require('path');
const { createChecker } = require('./helpers/assert.cjs');
const { validReportForProviderBody } = require('./helpers/valid-reports.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-feedback-intelligence.cjs ===');
  process.env.KIDBUSTER_TEST_KV = '1';
  const feedback = (await import('../api/feedback.js')).default;
  const generate = (await import('../api/generate.js')).default;
  const store = await import('../api/_lib/feedback-store.js');
  const svc = await import('../api/_lib/license-service.js');
  const { __resetForTests, kv } = await import('../api/_lib/kv-client.js');
  const saved = { sheet: process.env.GOOGLE_SHEET_WEBHOOK_URL, owner: process.env.OWNER_LICENSE_KEYS, app: process.env.APP_ACCESS_KEY, api: process.env.ANTHROPIC_API_KEY };
  const priorFetch = global.fetch;

  function call(handler, req){
    let statusCode = 200, jsonBody = null;
    const res = { setHeader(){}, status(c){ statusCode = c; return res; }, json(b){ jsonBody = b; return res; } };
    return handler(req, res).then(() => ({ statusCode, jsonBody }));
  }
  const post = (key, body) => call(feedback, { method:'POST', headers:{ 'x-app-key': key }, body });
  const ownerGet = key => call(feedback, { method:'GET', headers:{ 'x-app-key': key }, query:{} });

  try{
    __resetForTests();
    delete process.env.GOOGLE_SHEET_WEBHOOK_URL;
    delete process.env.APP_ACCESS_KEY;
    process.env.OWNER_LICENSE_KEYS = 'owner_test_key';
    process.env.ANTHROPIC_API_KEY = 'isolated_test_key';
    const teacher = await svc.getOrCreateFreeLicense('fb-teacher@example.com');
    const other = await svc.getOrCreateFreeLicense('fb-other@example.com');

    console.log('\n1) generation returns a reference and stores content-free telemetry');
    global.fetch = async (url, opts) => ({ ok:true, json: async () => ({ content:[{ type:'text', text: validReportForProviderBody(opts.body) }], usage:{ output_tokens:4 } }) });
    const notes = 'SECRET-NOTES Mia practised past tense with the teacher.';
    const gen = await call(generate, { method:'POST', headers:{ 'x-app-key': teacher, 'x-installation-id':'fb-test' },
      body:{ generation:{ protocol:'MA', teacherName:'Layne', studentName:'Mia Example', notes, rating:'4' } } });
    check('generation succeeds', gen.statusCode === 200);
    const ref = gen.jsonBody?.generationRef;
    check('response carries a 16-hex generationRef', typeof ref === 'string' && /^[a-f0-9]{16}$/.test(ref));
    const meta = await kv.get('fb:gen:' + ref);
    check('telemetry records protocol, model and repair outcome', meta && meta.protocol === 'MA' && meta.model && meta.repairOutcome);
    const metaText = JSON.stringify(meta);
    check('telemetry contains no notes, student name, report text or license key',
      !metaText.includes('SECRET-NOTES') && !metaText.includes('Mia') && !metaText.includes(teacher) && !('text' in meta));

    console.log('\n2) feedback is stored without any Google Sheet and joined on the server');
    const rated = await post(teacher, { teacherName:'Layne', protocol:'BLITZ', ratingTier:'4', score:2, comment:'Too generic', generationRef: ref });
    check('feedback succeeds with no Sheet configured (previously 500 on staging)', rated.statusCode === 200 && rated.jsonBody.stored === true && rated.jsonBody.sheet === 'not_configured');
    const items = await store.listFeedback();
    check('stored item is joined to the trusted telemetry', items[0]?.generation?.protocol === 'MA' && items[0].generation.ref === ref);
    check('browser-claimed protocol is kept separately, never trusted over telemetry', items[0].client.protocol === 'BLITZ');
    check('account is a hash, never the license key', items[0].account && !JSON.stringify(items[0]).includes(teacher));

    console.log('\n3) another account cannot attach to someone else\'s report');
    await post(other, { score:5, generationRef: ref });
    const latest = (await store.listFeedback())[0];
    check('foreign reference is not joined', latest.generation === null);
    await post(teacher, { score:4, generationRef:'not-a-ref' });
    check('malformed reference is ignored safely', (await store.listFeedback())[0].generation === null);

    console.log('\n4) categories');
    check('bug report without stars is accepted', (await post(teacher, { category:'bug', comment:'Copy button did nothing', generationRef: ref })).statusCode === 200);
    check('idea without stars is accepted', (await post(teacher, { category:'idea', comment:'Add a Spanish summary' })).statusCode === 200);
    check('bug report with no description is rejected', (await post(teacher, { category:'bug', comment:'  ' })).statusCode === 400);
    check('quality rating still requires stars', (await post(teacher, { category:'quality', comment:'hi' })).statusCode === 400);
    check('unknown category falls back to a quality rating', (await post(teacher, { category:'<script>', score:3 })).statusCode === 200 && (await store.listFeedback())[0].category === 'quality');
    check('out-of-range score is rejected', (await post(teacher, { score:9 })).statusCode === 400);

    console.log('\n5) owner-only summary');
    check('anonymous GET is refused', (await ownerGet(undefined)).statusCode === 403);
    check('a teacher license cannot read feedback', (await ownerGet(teacher)).statusCode === 403);
    const owner = await ownerGet('owner_test_key');
    check('owner GET succeeds', owner.statusCode === 200 && Array.isArray(owner.jsonBody.items));
    const s = owner.jsonBody.summary;
    check('summary counts all items', s.total === 6);
    check('summary groups by trusted protocol', s.byProtocol.MA && s.byProtocol.MA.count >= 2);
    check('low score surfaces with its comment and repair outcome', s.lowScores.some(i => i.comment === 'Too generic' && i.protocol === 'MA' && i.linked));
    check('bugs and ideas are listed', s.bugs.length === 1 && s.ideas.length === 1);
    check('two distinct teacher accounts', s.accounts === 2);

    console.log('\n6) telemetry failure never blocks report delivery');
    const { __simulateOutage } = await import('../api/_lib/kv-client.js');
    const realSet = kv.set;
    kv.set = async (k, ...rest) => { if(String(k).startsWith('fb:gen:')) throw new Error('simulated'); return realSet.call(kv, k, ...rest); };
    try{
      const g2 = await call(generate, { method:'POST', headers:{ 'x-app-key': teacher, 'x-installation-id':'fb-test-2' },
        body:{ generation:{ protocol:'MA', teacherName:'Layne', studentName:'Test Student', notes:'Practised reading.', rating:'4' } } });
      check('report still delivered when telemetry write fails', g2.statusCode === 200 && g2.jsonBody.generationRef === null);
    }finally{ kv.set = realSet; void __simulateOutage; }

    console.log('\n7) owner dashboard renders untrusted text safely');
    const html = fs.readFileSync(path.join(__dirname, '..', 'feedback-dashboard.html'), 'utf8');
    check('dashboard never uses innerHTML', !/innerHTML|insertAdjacentHTML|document\.write/.test(html));
    check('dashboard is noindex', /<meta name="robots" content="noindex/.test(html));
    check('dashboard holds no embedded data or keys', !/OWNER_LICENSE|sk-ant|KV_REST/.test(html));
    const app = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const hub = app.slice(app.indexOf('async function showOwnerFeedback'), app.indexOf('function wireOwnerBatchTools'));
    check('owner-panel feedback hub exists and is wired', hub.length > 100 && /\['ownerFeedbackBtn',showOwnerFeedback\]/.test(app));
    check('owner-panel hub renders comments as text only', !/innerHTML|insertAdjacentHTML/.test(hub) && /textContent/.test(hub));
    check('owner-panel hub sits inside the owner-only tools block',
      app.indexOf('id="ownerFeedbackBtn"') > app.indexOf('id="accountOwnerTools"') && app.indexOf('id="ownerFeedbackBtn"') < app.indexOf('id="createActivationBatchBtn"'));
    const pull = fs.readFileSync(path.join(__dirname, '..', 'tools', 'feedback-pull.mjs'), 'utf8');
    check('pull tool never prints the owner key', !/console\.(log|error)\([^)]*\bkey\b(?!\.)/.test(pull.replace(/No owner key[^']*'/, '')));
  }finally{
    global.fetch = priorFetch;
    for(const [n, v] of [['GOOGLE_SHEET_WEBHOOK_URL', saved.sheet], ['OWNER_LICENSE_KEYS', saved.owner], ['APP_ACCESS_KEY', saved.app], ['ANTHROPIC_API_KEY', saved.api]]){
      if(v === undefined) delete process.env[n]; else process.env[n] = v;
    }
  }
  return getFailures();
};
if(require.main === module){ process.env.KIDBUSTER_TEST_KV = '1'; module.exports().then(n => process.exit(n ? 1 : 0)); }
