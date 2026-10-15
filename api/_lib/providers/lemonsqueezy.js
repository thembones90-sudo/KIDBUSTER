// Lemon Squeezy payment provider adapter. Implements the two-function
// interface every provider adapter must implement (see the contract
// documented in api/_lib/providers/index.js) — this is the ONLY file in
// this project that knows anything about Lemon Squeezy's specific API
// shapes, webhook event names, or signature scheme. Swapping to a
// different provider later never touches anything outside this folder.
//
// Verified directly against Lemon Squeezy's own documentation
// (docs.lemonsqueezy.com), not assumed from memory:
// - Webhooks are signed via HMAC-SHA256 of the raw request body, sent in
//   the X-Signature header as a hex digest — verified with a timing-safe
//   comparison, never a plain === comparison (a naive === would leak
//   timing information an attacker could exploit to forge a valid
//   signature byte-by-byte).
// - The event name arrives in the JSON body's meta.event_name field —
//   read from there rather than the X-Event-Name header, since only the
//   body itself is covered by the signature.
// - Any custom_data passed at checkout creation (via checkout_data.custom)
//   is echoed back in meta.custom_data on every subsequent webhook for
//   that same subscription — this is how the original license key
//   survives across the entire subscription lifecycle (created, renewed,
//   canceled, expired), not just the very first webhook.

import crypto from 'crypto';

const EVENT_TYPE_MAP = {
  subscription_created: 'payment_succeeded',
  subscription_payment_success: 'subscription_renewed',
  subscription_payment_failed: 'subscription_payment_failed',
  subscription_payment_recovered: 'subscription_payment_recovered',
  subscription_payment_refunded: 'subscription_payment_refunded',
  subscription_cancelled: 'subscription_cancelled',
  subscription_resumed: 'subscription_resumed',
  subscription_expired: 'subscription_expired',
  subscription_paused: 'subscription_paused',
  subscription_unpaused: 'subscription_unpaused',
  subscription_updated: 'subscription_state_update',
  order_refunded: 'order_refunded'
  // Chargebacks are NOT a documented Lemon Squeezy webhook type.
  // Refunds are ADVISORIES and must never revoke Pro automatically.
};

/**
 * Creates a Lemon Squeezy Checkout for the Pro subscription and returns
 * the URL to redirect the browser to. The license key is threaded
 * through as custom checkout data specifically so every later webhook
 * for this subscription (renewal, cancellation, expiration) can be
 * traced back to the same license record without needing a customer-id
 * lookup as the only path.
 * @param {{email: string, licenseKey: string}} params
 * @returns {Promise<string>} checkout URL
 */
export async function createCheckoutUrl({ email, licenseKey }){
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;
  const siteUrl = (process.env.SITE_URL || '').replace(/\/+$/, '');
  if(!apiKey || !storeId || !variantId){
    throw new Error('Missing LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_STORE_ID, or LEMONSQUEEZY_PRO_VARIANT_ID');
  }

  const response = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          product_options: siteUrl ? {
            redirect_url: siteUrl + '/?checkout=success'
          } : undefined,
          checkout_data: {
            email,
            custom: { license_key: licenseKey }
          }
        },
        relationships: {
          store: { data: { type: 'stores', id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } }
        }
      }
    })
  });

  if(!response.ok){
    const errBody = await response.text();
    throw new Error('Lemon Squeezy checkout creation failed (' + response.status + '): ' + errBody);
  }

  const data = await response.json();
  const url = data && data.data && data.data.attributes && data.data.attributes.url;
  if(!url) throw new Error('Lemon Squeezy checkout response did not include a URL');
  return url;
}

/**
 * Returns a freshly-issued, short-lived customer portal URL for the
 * authenticated subscription owner. Identity matching happens here as a
 * second line of defence after the route has resolved the local license.
 */
export async function createCustomerPortalUrl({ subscriptionId, customerId, fetcher = fetch }){
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const id = String(subscriptionId || '');
  if(!apiKey) throw new Error('Missing LEMONSQUEEZY_API_KEY');
  if(!/^[1-9][0-9]{0,19}$/.test(id)){
    throw new Error('Customer portal requires a numeric Lemon Squeezy subscription ID');
  }

  const response = await fetcher('https://api.lemonsqueezy.com/v1/subscriptions/' + id, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Authorization': 'Bearer ' + apiKey
    }
  });
  if(!response.ok) throw new Error('Lemon Squeezy subscription lookup failed (' + response.status + ')');
  const body = await response.json();
  const data = body?.data;
  const attributes = data?.attributes;
  if(data?.type !== 'subscriptions' || String(data.id) !== id || !attributes){
    throw new Error('Lemon Squeezy returned a mismatched subscription object');
  }
  if(customerId && String(attributes.customer_id) !== String(customerId)){
    throw new Error('Lemon Squeezy customer identity did not match the signed-in account');
  }
  const url = attributes.urls?.customer_portal;
  let parsed;
  try{ parsed = new URL(url); }catch{ throw new Error('Lemon Squeezy did not return a valid customer portal URL'); }
  const providerHost = parsed.hostname === 'lemonsqueezy.com' || parsed.hostname.endsWith('.lemonsqueezy.com');
  if(parsed.protocol !== 'https:' || parsed.username || parsed.password || !providerHost){
    throw new Error('Lemon Squeezy returned an unsafe customer portal URL');
  }
  return parsed.toString();
}

/**
 * Verifies a webhook's signature and normalizes it into this app's
 * provider-agnostic event shape. Throws only for a genuinely invalid or
 * unverifiable request (bad/missing signature, unconfigured secret,
 * unparseable body) — the route handler turns that into a 400. A
 * validly-signed event of a type this app doesn't act on (e.g.
 * order_created) is NOT an error: it returns normally with type: null,
 * and the route handler just acknowledges it with 200 and does nothing.
 * @param {{rawBody: Buffer, headers: object}} params
 * @returns {Promise<{type: string|null, licenseKey: string|null, email: string|null, paymentCustomerId: string|null, paymentSubscriptionId: string|null}>}
 */
export async function verifyAndNormalizeWebhook({ rawBody, headers }){
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if(!secret){
    throw new Error('LEMONSQUEEZY_WEBHOOK_SECRET is not set');
  }

  const signature = headers['x-signature'];
  if(!signature){
    throw new Error('Missing X-Signature header');
  }

  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const digestBuffer = Buffer.from(digest, 'utf8');
  const isValid = signatureBuffer.length === digestBuffer.length
    && crypto.timingSafeEqual(signatureBuffer, digestBuffer);
  if(!isValid){
    throw new Error('Invalid webhook signature');
  }

  let payload;
  try{
    payload = JSON.parse(rawBody.toString('utf8'));
  }catch(e){
    throw new Error('Webhook body was not valid JSON');
  }

  const eventName = payload && payload.meta && payload.meta.event_name;
  const mapped = EVENT_TYPE_MAP[eventName] || null;
  const customData = (payload && payload.meta && payload.meta.custom_data) || {};
  const data = payload && payload.data || {};
  const attributes = data.attributes || {};
  // ALL subscription_payment_* events are subscription INVOICES;
  // data.id is an invoice, not a subscription. order_refunded is an ORDER.
  const invoice = typeof eventName === 'string' && eventName.startsWith('subscription_payment_');
  const order = eventName === 'order_refunded';
  const paymentSubscriptionId = invoice ? attributes.subscription_id : (order ? null : data.id);
  const state = attributes.status;
  let type = mapped;
  if(type === 'subscription_state_update'){
    type = {
      cancelled:'subscription_cancelled',expired:'subscription_expired',
      active:'subscription_resumed',paused:'subscription_paused',
      past_due:'subscription_past_due',unpaid:'subscription_unpaid',
      on_trial:'subscription_on_trial'
    }[state] || null;
  }

  return {
    type,
    licenseKey: customData.license_key || null,
    email: attributes.user_email || null,
    paymentCustomerId: attributes.customer_id != null ? String(attributes.customer_id) : null,
    paymentSubscriptionId: paymentSubscriptionId != null ? String(paymentSubscriptionId) : null,
    eventAt: attributes.updated_at || attributes.created_at || null,
    endsAt: attributes.ends_at || null,
    providerStatus: state || null,
    invoiceId: invoice && data.id != null ? String(data.id) : null,
    orderId: (order ? data.id : attributes.order_id) != null ?
      String(order ? data.id : attributes.order_id) : null,
    refundAmount: attributes.refunded_amount != null && Number.isFinite(Number(attributes.refunded_amount))
      ? Number(attributes.refunded_amount) : null,
    invoiceTotal: attributes.total != null && Number.isFinite(Number(attributes.total))
      ? Number(attributes.total) : null,
    fullyRefunded: attributes.refunded === true || state === 'refunded' ||
      (Number(attributes.total) > 0 && attributes.refunded_amount != null &&
        Number(attributes.refunded_amount) >= Number(attributes.total))
  };
}

// Read-only provider snapshot for future isolated staging reconciliation.
// This function is NEVER invoked by the local V2 preview or its tests
// without a fully stubbed fetcher. It does NOT mutate a subscription.
export async function fetchSubscriptionSnapshot(subscriptionId, {
  fetcher = fetch,
  apiKey = process.env.LEMONSQUEEZY_API_KEY
} = {}){
  const id=String(subscriptionId||'');
  if(!/^[1-9][0-9]{0,19}$/.test(id)){
    throw new Error('Reconciliation requires a numeric Lemon Squeezy subscription ID');
  }
  if(!apiKey)throw new Error('Reconciliation requires separate staging Lemon Squeezy credentials');
  const response=await fetcher('https://api.lemonsqueezy.com/v1/subscriptions/'+id,{
    method:'GET',
    headers:{'Accept':'application/vnd.api+json','Authorization':'Bearer '+apiKey}
  });
  if(!response.ok)throw new Error('Subscription provider lookup failed: '+response.status);
  const body=await response.json();
  const data=body?.data;
  const a=data?.attributes;
  if(data?.type!=='subscriptions'||String(data.id)!==id||!a){
    throw new Error('Provider returned a mismatched subscription object');
  }
  return {
    subscriptionId:id,
    customerId:a.customer_id!=null?String(a.customer_id):null,
    orderId:a.order_id!=null?String(a.order_id):null,
    status:a.status||null,
    endsAt:a.ends_at||null,
    updatedAt:a.updated_at||null,
    renewsAt:a.renews_at||null
  };
}
