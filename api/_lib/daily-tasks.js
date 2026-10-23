// Once-a-day owner tasks (Vercel cron -> /api/feedback?task=daily). Read-only
// on customer data: it only reads license records and raises owner alerts.
// - manual 30-day Pro keys expiring within 3 days (or just expired) -> alert,
//   once per key and expiry date;
// - a short health summary into the event log.
import { kv } from './kv-client.js';
import { alertOwner } from './owner-alerts.js';
import { recordEvent, readEvents } from './event-log.js';
import { keyFingerprint, maskEmail } from './identity-continuity.js';

const DAY = 86400000;
const WARN_DAYS = 3;

export async function runDailyTasks({ now = Date.now(), maxRecords = 20000 } = {}){
  // Once per lifetime: proves the alert route (sheet + email) actually works.
  if(await kv.set('alert:v1:monitoring-active', new Date(now).toISOString(), { nx: true }) !== null){
    await alertOwner({ type: 'monitoring_active', title: 'Classbuster monitoring is active',
      details: ['You will get an alert like this when a payment fails to process or a 30-day key is about to expire.',
        'Recent activity: Account -> Owner tools -> Recent activity.'] });
  }
  let cursor = '0', scanned = 0, expiring = 0, expired = 0;
  do{
    const [next, keys] = await kv.scan(cursor, { match: 'license:*', count: 500 });
    cursor = String(next);
    for(const key of keys){
      if(!key.startsWith('license:') || ++scanned > maxRecords) continue;
      const license = await kv.get(key).catch(() => null);
      if(!license || license.manual !== true || license.plan !== 'pro' || license.status !== 'active') continue;
      const at = Date.parse(license.expiresAt || '');
      if(!Number.isFinite(at)) continue;
      const licenseKey = key.slice('license:'.length);
      const who = license.email ? maskEmail(license.email) : '(no email on this key)';
      if(at > now && at - now <= WARN_DAYS * DAY){
        expiring++;
        await alertOwner({
          type: 'manual_expiring', title: '30-day Pro key expires ' + new Date(at).toISOString().slice(0, 10),
          details: ['Customer: ' + who, 'Key ref: ' + keyFingerprint(licenseKey), 'Renew it in Account -> owner tools if they should keep Pro.'],
          dedupeKey: 'exp:' + keyFingerprint(licenseKey) + ':' + license.expiresAt
        });
      }else if(at <= now && now - at <= DAY){
        expired++;
        await alertOwner({
          type: 'manual_expired', title: '30-day Pro key expired today',
          details: ['Customer: ' + who, 'Key ref: ' + keyFingerprint(licenseKey), 'They are back on Free until renewed.'],
          dedupeKey: 'expired:' + keyFingerprint(licenseKey) + ':' + license.expiresAt
        });
      }
    }
  }while(cursor !== '0' && scanned <= maxRecords);
  const lastDay = await readEvents({ days: 1, limit: 2000, now });
  const failures = lastDay.filter(e => e.type === 'payment_failed' || e.type === 'generation_failed').length;
  const summary = { scanned, expiring, expired, failuresLast24h: failures };
  await recordEvent('daily', summary, { now });
  return summary;
}
