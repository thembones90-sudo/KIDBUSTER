'use strict';
// The Railway mail relay only forwards emails whose subject, wording and link
// it recognises. This keeps the app's real messages and the relay's rules in
// step: every message email-service produces for classbuster.com or the legacy
// kidbuster.vercel.app origin must pass relay verify(). No network, no email.
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-mail-relay-contract.cjs ===');
  const relay = await import(pathToFileURL(path.join(__dirname, '..', 'tools', 'mail-relay', 'server.mjs')).href);
  const saved = { mode: process.env.KIDBUSTER_TEST_EMAIL, url: process.env.PATHFINDER_APP_URL };
  process.env.KIDBUSTER_TEST_EMAIL = '1';
  const token = 'A'.repeat(43);
  try{
    const email = await import('../api/_lib/email-service.js');
    for(const origin of ['https://classbuster.com', 'https://kidbuster.vercel.app']){
      process.env.PATHFINDER_APP_URL = origin;
      for(const intent of ['signup', 'recover']){
        const before = email.__getTestMessages().length;
        await email.sendAccessVerificationEmail({ email: 'teacher@example.com', token, intent });
        const msg = email.__getTestMessages()[before];
        check(intent + ' email on ' + origin + ' is accepted by the relay',
          !!msg && relay.verify({ to: msg.to, subject: msg.subject, text: msg.text }));
      }
    }

    const ok = (subject, text) => relay.verify({ to: 'teacher@example.com', subject, text });
    const cb = 'Use this secure link within 15 minutes to access Classbuster: ';
    const pf = 'Use this secure link within 15 minutes to access Pathfinder: ';
    const link = origin => origin + '/?access_token=' + token;
    check('Classbuster wording + classbuster.com link accepted', ok('Verify your Classbuster email', cb + link('https://classbuster.com')));
    check('Classbuster recovery accepted', ok('Recover your Classbuster access', cb + link('https://classbuster.com')));
    check('legacy Pathfinder wording + legacy domain still accepted', ok('Recover your Pathfinder access', pf + link('https://kidbuster.vercel.app')));
    check('mixed: legacy wording with the new domain accepted', ok('Verify your Pathfinder email', pf + link('https://classbuster.com')));
    check('www subdomain is not an allowed link origin', !ok('Verify your Classbuster email', cb + link('https://www.classbuster.com')));
    check('foreign origin rejected', !ok('Verify your Classbuster email', cb + link('https://classbuster.com.evil.example')));
    check('plain http rejected', !ok('Verify your Classbuster email', cb + link('http://classbuster.com')));
    check('unknown subject rejected', !ok('Your account', cb + link('https://classbuster.com')));
    check('unknown wording rejected', !ok('Verify your Classbuster email', 'Click here: ' + link('https://classbuster.com')));
    check('extra query parameter rejected', !ok('Verify your Classbuster email', cb + link('https://classbuster.com') + '&next=/x'));
    check('non-root path rejected', !ok('Verify your Classbuster email', cb + 'https://classbuster.com/login?access_token=' + token));
    check('short token rejected', !ok('Verify your Classbuster email', cb + 'https://classbuster.com/?access_token=abc'));
    check('bad recipient rejected', !relay.verify({ to: 'not-an-email', subject: 'Verify your Classbuster email', text: cb + link('https://classbuster.com') }));
    check('importing the relay does not start a server', typeof relay.verify === 'function');

    // The build gate carries a mirror of the deployed relay's rules (the relay
    // source is not uploaded to Vercel). The mirror must equal the source.
    const { RELAY } = require('../scripts/verify-release-integrity.cjs');
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    check('gate mirror: allowed link origins equal the relay', same(RELAY.origins, relay.allowedOrigins));
    check('gate mirror: accepted wording equals the relay', same(RELAY.prefixes, relay.prefixes));
    check('gate mirror: accepted subjects equal the relay', same(RELAY.subjects, relay.subjects));
  }finally{
    if(saved.mode === undefined) delete process.env.KIDBUSTER_TEST_EMAIL; else process.env.KIDBUSTER_TEST_EMAIL = saved.mode;
    if(saved.url === undefined) delete process.env.PATHFINDER_APP_URL; else process.env.PATHFINDER_APP_URL = saved.url;
  }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
