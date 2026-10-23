// Alerts that need the owner's attention: written to the event log, sent to
// the existing owner notification sheet, and emailed when OWNER_ALERT_EMAIL is
// configured. Never throws into the request that raised it. The same alert is
// sent at most once per `dedupeKey` per day.
import { kv } from './kv-client.js';
import { notifyAccessEvent } from './access-notifications.js';
import { sendPlainEmail } from './email-service.js';
import { recordEvent } from './event-log.js';

export async function alertOwner({ type, title, details = [], dedupeKey = null }){
  try{
    if(dedupeKey){
      const key = 'alert:v1:' + new Date().toISOString().slice(0, 10) + ':' + String(dedupeKey).slice(0, 120);
      if(await kv.set(key, 1, { nx: true, ex: 2 * 86400 }) === null) return { deduped: true };
    }
    await recordEvent('alert', { alert: type, title });
    await notifyAccessEvent({ type: String(type).slice(0, 30), title, details });
    const to = String(process.env.OWNER_ALERT_EMAIL || '').trim();
    if(to){
      try{
        // The mail relay forwards owner alerts only without links or markup.
        const plain = value => String(value).replace(/https?:\/\/\S+/gi, '[link]').replace(/www\./gi, 'www ').replace(/[<>]/g, '');
        await sendPlainEmail({ to, subject: 'Classbuster: ' + plain(title), text: [title, ...details].filter(Boolean).map(plain).join('\n') });
      }catch(err){
        console.error('owner alert email failed:', (err && err.message) || 'error');
      }
    }
    return { sent: true };
  }catch(err){
    console.error('owner alert failed:', (err && err.name) || 'error');
    return { sent: false };
  }
}
