'use strict';
// Owner monitoring (2026-10-23): 30-day event log, owner alerts (sheet +
// optional email, deduplicated), the cron-protected daily task with manual-key
// expiry reminders, and payment / sign-in hooks. Synthetic data only.
const crypto = require('node:crypto');
const { createChecker } = require('./helpers/assert.cjs');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-owner-monitoring.cjs ===');
  const vars = ['KIDBUSTER_TEST_KV', 'KIDBUSTER_TEST_EMAIL', 'OWNER_ALERT_EMAIL', 'CRON_SECRET', 'GOOGLE_SHEET_WEBHOOK_URL',
    'LEMONSQUEEZY_WEBHOOK_SECRET', 'PAYMENT_PROVIDER', 'OWNER_LICENSE_KEYS'];
  const old = Object.fromEntries(vars.map(k => [k, process.env[k]]));
  Object.assign(process.env, { KIDBUSTER_TEST_KV: '1', KIDBUSTER_TEST_EMAIL: '1', LEMONSQUEEZY_WEBHOOK_SECRET: 'synthetic-monitoring-secret',
    PAYMENT_PROVIDER: 'lemonsqueezy', OWNER_LICENSE_KEYS: 'monitor_owner_key' });
  delete process.env.GOOGLE_SHEET_WEBHOOK_URL; delete process.env.OWNER_ALERT_EMAIL; delete process.env.CRON_SECRET;
  try{
    const kvMod = await import('../api/_lib/kv-client.js'); kvMod.__resetForTests();
    const log = await import('../api/_lib/event-log.js');
    const alerts = await import('../api/_lib/owner-alerts.js');
    const mail = await import('../api/_lib/email-service.js'); mail.__resetTestMessages();
    const lic = await import('../api/_lib/licensing.js');
    const svc = await import('../api/_lib/license-service.js');
    const feedback = (await import('../api/feedback.js')).default;
    const admin = (await import('../api/admin-license-lookup.js')).default;
    const call = async (handler, req) => {
      const res = { code: 200, headers: {}, status(n){ this.code = n; return this; }, json(v){ this.body = v; return this; }, setHeader(k, v){ this.headers[k] = v; } };
      await handler({ headers: {}, query: {}, ...req }, res); return res;
    };

    console.log('\n1) Event log');
    const t0 = Date.parse('2026-10-23T10:00:00Z');
    await log.recordEvent('sign_in', { via: 'email_link', note: 'x'.repeat(500) }, { now: t0 });
    await log.recordEvent('payment', { event: 'subscription_created' }, { now: t0 + 1000 });
    const events = await log.readEvents({ now: t0 + 2000 });
    check('events are returned newest first', events.length === 2 && events[0].type === 'payment' && events[1].type === 'sign_in');
    check('long values are truncated', events[1].note.length === 200);
    kvMod.__simulateOutage?.(true);
    let threw = false; try{ await log.recordEvent('payment', {}); }catch{ threw = true; }
    kvMod.__simulateOutage?.(false);
    check('recording never throws into a request, even when the store is down', !threw);

    console.log('\n2) Owner alerts');
    await alerts.alertOwner({ type: 'test', title: 'Synthetic alert', dedupeKey: 'same' });
    check('without OWNER_ALERT_EMAIL no email is sent', mail.__getTestMessages().length === 0);
    process.env.OWNER_ALERT_EMAIL = 'owner@example.test';
    await alerts.alertOwner({ type: 'test', title: 'Second alert', details: ['detail line'], dedupeKey: 'other' });
    const sent = mail.__getTestMessages();
    check('with OWNER_ALERT_EMAIL the owner gets an email', sent.length === 1 && sent[0].to === 'owner@example.test' && /Second alert/.test(sent[0].subject) && /detail line/.test(sent[0].text));
    const dup = await alerts.alertOwner({ type: 'test', title: 'Second alert', dedupeKey: 'other' });
    check('the same alert is sent only once per day', dup.deduped === true && mail.__getTestMessages().length === 1);

    console.log('\n3) Daily task (cron)');
    check('the daily task never runs without a configured secret', (await call(feedback, { method: 'GET', query: { task: 'daily' } })).code === 401);
    process.env.CRON_SECRET = 'synthetic-cron-secret-0123456789';
    check('a wrong secret is refused', (await call(feedback, { method: 'GET', query: { task: 'daily' }, headers: { authorization: 'Bearer wrong' } })).code === 401);
    const now = Date.now();
    await lic.saveLicense('kb_live_expiring', { email: 'soon@example.test', plan: 'pro', status: 'active', manual: true, source: 'manual', expiresAt: new Date(now + 2 * 86400000).toISOString() });
    await lic.saveLicense('kb_live_later', { email: 'later@example.test', plan: 'pro', status: 'active', manual: true, source: 'manual', expiresAt: new Date(now + 20 * 86400000).toISOString() });
    await lic.saveLicense('kb_live_expired', { email: 'gone@example.test', plan: 'pro', status: 'active', manual: true, source: 'manual', expiresAt: new Date(now - 3600000).toISOString() });
    await lic.saveLicense('kb_live_sub', { email: 'sub@example.test', plan: 'pro', status: 'active', source: 'subscription', paymentSubscriptionId: 's1', expiresAt: new Date(now + 86400000).toISOString() });
    mail.__resetTestMessages();
    const auth = { authorization: 'Bearer synthetic-cron-secret-0123456789' };
    const run1 = await call(feedback, { method: 'GET', query: { task: 'daily' }, headers: auth });
    check('the daily task runs with the right secret', run1.code === 200 && run1.body.ok === true);
    check('it finds exactly the manual key expiring within 3 days and the one that just expired', run1.body.expiring === 1 && run1.body.expired === 1);
    const subjects = mail.__getTestMessages().map(m => m.subject).join(' | ');
    check('the first daily run sends a one-time "monitoring is active" alert', /monitoring is active/.test(subjects));
    check('the owner is alerted about both, without a raw key or full email', /expires/.test(subjects) && /expired today/.test(subjects) &&
      !/kb_live_|soon@example|gone@example/.test(JSON.stringify(mail.__getTestMessages())));
    await call(feedback, { method: 'GET', query: { task: 'daily' }, headers: auth });
    check('running again does not repeat the reminders or the activation alert', mail.__getTestMessages().length === 3);
    const relay = await import('../tools/mail-relay/server.mjs');
    check('every real alert email passes the relay owner-alert rule', mail.__getTestMessages().every(m => relay.verifyOwnerAlert(m, 'owner@example.test')));
    check('a daily summary is in the event log', (await log.readEvents({ type: 'daily' })).length >= 1);

    console.log('\n4) Payment and owner view');
    const webhook = (await import('../api/payment-webhook.js')).default;
    const key = await svc.getOrCreateFreeLicense('payer@example.test');
    const data = { meta: { event_name: 'subscription_created', custom_data: { license_key: key } },
      data: { type: 'subscriptions', id: 'sub-monitoring', attributes: { customer_id: 'cust-mon', user_email: 'payer@example.test', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: 'active', ends_at: null } } };
    const raw = Buffer.from(JSON.stringify(data));
    const sig = crypto.createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(raw).digest('hex');
    const res = { status(c){ this.code = c; return this; }, json(b){ this.body = b; return this; }, setHeader(){} };
    await webhook({ method: 'POST', headers: { 'x-signature': sig }, on(n, cb){ if(n === 'data') cb(raw); if(n === 'end') cb(); return this; } }, res);
    check('a processed payment is recorded', res.code === 200 && (await log.readEvents({ type: 'payment' })).some(e => e.event === 'subscription_created'));
    const view = await call(admin, { method: 'GET', query: { action: 'recent-events' }, headers: { 'x-app-key': 'monitor_owner_key' } });
    check('the owner can read recent activity', view.code === 200 && Array.isArray(view.body.events) && view.body.events.length > 0);
    check('recent activity contains no raw keys or customer emails', !/kb_live_|@example\.test/.test(JSON.stringify(view.body)));
    const denied = await call(admin, { method: 'GET', query: { action: 'recent-events' }, headers: { 'x-app-key': 'not-owner' } });
    check('a non-owner cannot read recent activity', denied.code === 403);
  }catch(e){ console.error('owner monitoring test:', e.stack || e); check('owner monitoring scenario completed', false); }
  finally{ for(const k of vars){ if(old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
  return getFailures();
};
if(require.main === module) module.exports().then(n => process.exit(n ? 1 : 0));
