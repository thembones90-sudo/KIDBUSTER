// Lemon Squeezy TEST MODE setup for pathfinder-v2-staging.
// Reads a test-mode API key from .v2-local/ls-test-api-key.txt (gitignored),
// finds the Pathfinder Pro test variant, reports price/currency and the
// GREEDISGOOD test discount, and creates (once) a signed test webhook to the
// staging preview alias. Never prints the API key or webhook secret.
// Aborts and removes the webhook if Lemon Squeezy reports it is not test mode.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const local = path.join(root, '.v2-local');
const keyFile = path.join(local, 'ls-test-api-key.txt');
const secretFile = path.join(local, 'ls-webhook-secret.txt');
const outFile = path.join(local, 'ls-staging.json');
const WEBHOOK_URL = 'https://pathfinder-v2-staging-preview.vercel.app/api/payment-webhook';
const EVENTS = ['subscription_created','subscription_updated','subscription_cancelled','subscription_resumed',
  'subscription_expired','subscription_paused','subscription_unpaused','subscription_payment_success',
  'subscription_payment_failed','subscription_payment_recovered','subscription_payment_refunded','order_refunded'];

if(!fs.existsSync(keyFile)){ console.error('Missing ' + keyFile); process.exit(2); }
const apiKey = fs.readFileSync(keyFile, 'utf8').trim();
const headers = { Accept:'application/vnd.api+json', 'Content-Type':'application/vnd.api+json', Authorization:'Bearer ' + apiKey };
async function ls(method, p, body){
  const r = await fetch('https://api.lemonsqueezy.com/v1' + p, { method, headers, body: body && JSON.stringify(body) });
  if(method === 'DELETE') return null;
  const j = await r.json().catch(() => ({}));
  if(!r.ok) throw new Error(method + ' ' + p + ' -> ' + r.status + ' ' + JSON.stringify(j.errors || '').slice(0, 300));
  return j;
}

const stores = (await ls('GET', '/stores')).data;
if(stores.length !== 1) console.log('Stores visible: ' + stores.map(s => s.id + ' ' + s.attributes.name).join(', '));
const store = stores[0];
console.log('Store ' + store.id + ' "' + store.attributes.name + '" currency=' + store.attributes.currency);

const products = (await ls('GET', '/products?filter[store_id]=' + store.id)).data;
const product = products.find(p => /pathfinder pro/i.test(p.attributes.name));
if(!product) throw new Error('No "Pathfinder Pro" product in store ' + store.id);
if(product.attributes.test_mode === false) throw new Error('Product reports test_mode=false: this is a LIVE key. Aborting.');
console.log('Product ' + product.id + ' status=' + product.attributes.status + ' test_mode=' + product.attributes.test_mode);

// A product without extra variants has one "Default" variant whose status is
// "pending"; that default is what checkout sells, so only skip it when
// published variants exist.
const subVariants = (await ls('GET', '/variants?filter[product_id]=' + product.id)).data
  .filter(v => v.attributes.is_subscription);
const published = subVariants.filter(v => v.attributes.status === 'published');
const variants = published.length ? published : subVariants;
if(variants.length !== 1) console.log('Subscription variants: ' + variants.map(v => v.id + ' ' + v.attributes.name).join(', '));
const variant = variants[0];
if(!variant) throw new Error('No published subscription variant');
const va = variant.attributes;
console.log('Variant ' + variant.id + ' "' + va.name + '" price=' + (va.price / 100).toFixed(2) + ' ' + store.attributes.currency +
  ' every ' + (va.interval_count || 1) + ' ' + va.interval);

const discounts = (await ls('GET', '/discounts?filter[store_id]=' + store.id)).data;
const d = discounts.find(x => x.attributes.code === 'GREEDISGOOD');
console.log(d ? 'Discount GREEDISGOOD ' + d.id + ': ' + d.attributes.amount + (d.attributes.amount_type === 'percent' ? '%' : ' fixed') +
  ' duration=' + d.attributes.duration + ' limited=' + d.attributes.is_limited_redemptions + '/' + d.attributes.max_redemptions +
  ' status=' + d.attributes.status + ' test_mode=' + d.attributes.test_mode : 'GREEDISGOOD not found in this store');

const hooks = (await ls('GET', '/webhooks?filter[store_id]=' + store.id)).data;
let hook = hooks.find(h => h.attributes.url === WEBHOOK_URL);
if(hook && !fs.existsSync(secretFile)) throw new Error('Webhook ' + hook.id + ' exists but its secret file is missing; delete it in the dashboard and rerun.');
if(!hook){
  const secret = crypto.randomBytes(20).toString('hex'); // Lemon Squeezy caps secrets at 40 chars
  hook = (await ls('POST', '/webhooks', { data:{ type:'webhooks', attributes:{ url:WEBHOOK_URL, events:EVENTS, secret },
    relationships:{ store:{ data:{ type:'stores', id:String(store.id) } } } } })).data;
  if(hook.attributes.test_mode !== true){
    await ls('DELETE', '/webhooks/' + hook.id);
    throw new Error('Webhook was created in LIVE mode; deleted it. Use a Test Mode API key.');
  }
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  console.log('Created test webhook ' + hook.id);
}else{
  console.log('Test webhook already exists: ' + hook.id + ' test_mode=' + hook.attributes.test_mode);
}
fs.writeFileSync(outFile, JSON.stringify({ storeId:String(store.id), variantId:String(variant.id), productId:String(product.id),
  webhookId:String(hook.id), discountId:d ? String(d.id) : null, createdAt:new Date().toISOString() }, null, 2));
console.log('Wrote ' + outFile + ' (IDs only)');
