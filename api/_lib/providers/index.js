// Payment provider registry — the ONE place in this project that decides
// which payment provider is currently active, selected via the
// PAYMENT_PROVIDER environment variable (defaults to 'lemonsqueezy', the
// only fully-implemented one right now).
//
// Every provider adapter (see ./lemonsqueezy.js, ./paddle.js) must
// implement exactly this interface:
//
//   async function createCheckoutUrl({ email, licenseKey }) -> string
//     Returns a URL to redirect the browser to for a Pro checkout.
//
//   async function createCustomerPortalUrl({ subscriptionId, customerId }) -> string
//     Returns a fresh signed billing portal URL after verifying the provider
//     subscription still belongs to the locally authenticated customer.
//
//   async function verifyAndNormalizeWebhook({ rawBody, headers }) -> {
//     type: 'payment_succeeded' | 'subscription_renewed'
//         | 'subscription_payment_failed' | 'subscription_payment_recovered'
//         | 'subscription_payment_refunded' | 'order_refunded'
//         | 'subscription_cancelled' | 'subscription_expired'
//         | 'subscription_resumed' | 'subscription_paused'
//         | 'subscription_unpaused' | 'subscription_past_due'
//         | 'subscription_unpaid' | 'subscription_on_trial' | null,
//     licenseKey: string|null,
//     email: string|null,
//     paymentCustomerId: string|null,
//     paymentSubscriptionId: string|null,
//     eventAt: string|null, endsAt: string|null,
//     invoiceId: string|null, orderId: string|null,
//     refundAmount: number|null, invoiceTotal: number|null,
//     fullyRefunded: boolean
//   }
//     Throws only for a genuinely invalid/unverifiable webhook (bad
//     signature, missing config). A validly-signed event of a type this
//     app doesn't act on returns normally with type: null — that's not
//     an error, just nothing to do.
//
// Nothing outside this file and the two adapter files themselves should
// ever need to know which provider is active, or anything about that
// provider's own API shape. api/generate.js in particular never imports
// this module at all — it only ever talks to license-service.js.

import * as lemonsqueezy from './lemonsqueezy.js';
import * as paddle from './paddle.js';

const PROVIDERS = { lemonsqueezy, paddle };

export function getActiveProvider(){
  const name = (process.env.PAYMENT_PROVIDER || 'lemonsqueezy').toLowerCase();
  const provider = PROVIDERS[name];
  if(!provider){
    throw new Error('Unknown PAYMENT_PROVIDER "' + name + '" — expected one of: ' + Object.keys(PROVIDERS).join(', '));
  }
  return provider;
}
