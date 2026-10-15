# Pathfinder V2: Paid-through cancellation and webhook ordering
Date: 2026-10-12 | Branch: pathfinder-v2 | Local-only
Scope: A:\PATHFINDER V2. Production remains unchanged.

## Delivery
- Correctly interpret Lemon Squeezy `subscription_cancelled`: keep Pro through the signed subscription object's `ends_at`; store the cancellation state and subscription identity. When the paid-through time passes, entitlement, account status and Krisp automatically project Free even if `subscription_expired` delivery is missing.
- Explicit `subscription_expired` transitions the current subscription to Free and **preserves its subscription ID**. The customer may start a new checkout after expiration, but not accidentally duplicate an active or still-paid cancelled subscription.
- Handle `subscription_resumed` and `subscription_updated` snapshots. A resumed subscription returns to active Pro. A genuinely expired subscription cannot be revived by late events for the same subscription.
- Fix Lemon Squeezy invoice schema: `subscription_payment_success` is a subscription-invoice payload. The subscription ID is in `data.attributes.subscription_id`, while `data.id` is the invoice ID.
- Reject stale subscription state changes using signed `attributes.updated_at` / `created_at` rather than delivery order. Renewal invoices maintain a separate watermark; delayed invoice events cannot reverse cancellation.
- Ignore late expiry/cancellation/invoice messages for an **older subscription ID** after a newer subscription has started. The underlying access-key identity is retained for the customer.
- Fail and request provider retry when a current cancellation does not include a valid `ends_at`, when an invoice lacks its subscription ID, when a lifecycle event lacks a trustworthy provider timestamp, or if a subscription claims a different existing customer ID.
- Account panel shows cancellation paid-through date and explains Free fallback instead of showing misleading 'Active' indefinitely.

## Main files
- `api/_lib/subscription-lifecycle.js`: signed-event state machine, ID and timestamp guards, paid-through semantics.
- `api/_lib/providers/lemonsqueezy.js`: correct subscription invoice semantics, updated/resumed support, signed event timestamps and ends_at fields.
- `api/payment-webhook.js`: delegate recognized normalized events to state machine.
- `api/_lib/licensing.js`: pure `effectiveSubscriptionLicense` for automatic Free projection when ends_at passes.
- `api/_lib/license-service.js`, `api/license-status.js`, `api/krisp-session.js`: use effective account plan for entitlements, status and Krisp.
- `api/create-checkout-session.js`: block duplicate paid subscriptions until expiry, then permit authenticated checkout.
- `index.html`: clear paid-through cancellation information.
- `tests/test-subscription-lifecycle.cjs`: synthetic signed webhook lifecycle and adversarial ordering regressions.
- `tests/test-monetization-e2e.cjs`: corrected realistically-shaped provider events and grace-period expectations.
- `tests/test-checkout-ownership.cjs`: prove existing subscription blocks duplicate purchase during grace and allows re-purchase after grace.

## Verification
- `npm test`: **24/24 test files passed** locally (Node 24; browser test uses installed Chrome).
- Synthetic signed events cover create, invoice renew, cancel grace, late invoice, stale snapshot, resume, earlier expiry, current expiry, missing-expiry-webhook fallback, new subscription, late old cancellation and expiry, missing dates/identities, customer-ID mismatch, and checkout gating.
- All tests use fake providers and in-memory KV. No real charges, webhooks, customers, Krisp data or production changes.

## Remaining release blockers
1. Concurrent distinct webhooks can still race because the current multi-record state write is not a single distributed Redis compare-and-swap transaction. The state machine protects **sequential delayed/out-of-order** events. Next: atomically persist monotonic event cursor and idempotency state.
2. Provider reconciliation for missed payments, dunning, refunds/chargebacks, pausing, and changed billing plans is not yet implemented. This branch currently ignores some of those signed events deliberately.
3. Webhook deduplication is not atomic and body size is not yet capped. Those remain upcoming hardening tasks.
4. No independent, access-protected V2 staging Vercel project with isolated Redis and provider test store yet. Production remains unchanged.
5. The user's running localhost 8765/8766 V2 preview was deliberately **not restarted**. It will use the new backend only after a later planned server restart; local source and synthetic tests are updated.

## Public provider references
- Lemon Squeezy: https://docs.lemonsqueezy.com/help/webhooks/event-types
- Grace period: https://docs.lemonsqueezy.com/guides/developer-guide/managing-subscriptions
- Subscription fields: https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object
- Subscription invoice fields: https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object
