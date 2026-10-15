# Pathfinder V2 | Failed Payments, Refund Review and Reconciliation Preview

**Date:** October 12, 2026
**Branch:** `pathfinder-v2`
**Workspace:** `A:\PATHFINDER V2`
**Scope:** Isolated V2 development only. No real charges, emails, webhooks, refunds, production credentials, or customer data.

## Completed: payment failure and recovery

- Lemon Squeezy signed `subscription_payment_failed` invoices are recognized using `attributes.subscription_id` (not the invoice's `data.id`) and a provider timestamp.
- A failed renewal records `subscriptionBillingStatus: payment_failed` and the latest invoice identity, **without downgrading Pro or disrupting Krisp**.
- `subscription_updated` snapshots for `past_due`, `unpaid`, `paused`, and `on_trial` retain Pro. This matches the provider's documented access policy, which ends subscriptions only at `expired`.
- Newer successful `subscription_payment_recovered` / `subscription_payment_success` events clear the billing warning without overriding a newer subscription-state snapshot or reviving an expired subscription.
- `subscription_paused`, `subscription_unpaused`, and changed snapshots record accurate state; stale invoices, prior-subscription notices, and cross-customer events are rejected/ignored.
- Account status now exposes only a simple billing state; the teacher's panel advises updating the payment method during recovery. It does not reveal provider invoice/order identifiers.

## Completed: refund review without unauthorized revocation

- Full or partial `subscription_payment_refunded` invoice events are recorded as review-only metadata on the existing subscription.
- `order_refunded` is associated with a current subscription **only if original order ID AND payment customer ID match**. A refund for another product, an unrelated order, or an unknown customer is ignored without opening a retry storm.
- Partial/full classification uses provider `refunded`/status and refund totals. It does **not** automatically revoke Pro; the provider's confirmed subscription `expired` state controls that.
- A new subscription clears historical refund warnings; a late refund for the old subscription cannot mark the new one as disputed.
- The owner-authenticated `api/admin-license-lookup.js` exposes relevant billing status, refund kind, invoice/order ID, amount in minor currency units, and full/partial flag; ordinary customer `api/license-status.js` gives only `refundReviewPending: true/false`.
- UI owner lookup displays refunds requiring manual review, preserving master authentication and existing manual-code actions.

## Completed: read-only provider reconciliation preview

- `api/_lib/providers/lemonsqueezy.js` exports `fetchSubscriptionSnapshot(id,{fetcher,apiKey})`: a fixed official HTTPS subscription URL, strict numeric ID validation, and minimal normalized fields. It has **not been invoked with real credentials**.
- `api/_lib/subscription-reconciliation.js` exports `compareSubscriptionSnapshot` and `previewSubscriptionReconciliation`.
- The preview compares stored identity, customer identity, provider update time, paid-through cancellation, and actual expected Free/Pro; mismatches are quarantined/marked for manual review.
- This is **not automatic reconciliation or a live monitoring job**. The module has no owner UI trigger or timer. A separate V2 staging provider/test datastore is necessary before enabling scheduled repair or state application.

## Verification

- `tests/test-billing-recovery-refunds.cjs`: **27 synthetic checks**, including dunning, payment recovery, pause/unpause, full/partial invoice refunds, original-order refunds, owner-only review visibility, no invoice ID leakage, obsolete-subscription handling, real provider expiration blocking Krisp, and never upgrading from a failed invoice.
- `tests/test-reconciliation-preview.cjs`: **18 synthetic checks**, including valid and mismatched snapshot identities, missing/stale timestamps, cancellation grace, suspected missed expiry, provider request allowlisting and mock-only API calls.
- Existing payment webhook serialization, first activation races, verified email ownership, manual-key behavior and real-browser smoke are retained.
- Full `npm test`: **27/27 test files passed** (after final integration).
- All payment-provider calls in tests use local signed fixtures or injected fake fetch implementations.

## Remaining release blockers

1. No dedicated, access-protected V2 staging Vercel project or separate Lemon Squeezy test store/KV wiring is complete. **No real provider integration test yet.**
2. **No dedicated Lemon Squeezy chargeback webhook appears in the published supported event list.** Chargebacks/disputes must be reconciled through provider dashboard/API evidence and explicit operational policy. Treating a refund as a confirmed chargeback would be unsound.
3. A refund notice does not determine whether the purchased subscription itself is invalidated. Require confirmation from the provider's authoritative subscription status and manual adjudication of exceptional cases.
4. The refund review is an owner-lookup capability, not yet an automated alert queue or email/Slack notification. No unattended scheduled reconciliation is enabled.
5. Atomic webhook account locks still need real distributed Redis staging verification and fencing policy if a worker somehow exceeds the lock TTL.
6. The existing local V2 preview on ports 8765/8766 has **not been restarted**. It will load the new backend logic on its next explicitly planned restart; the production Pathfinder site and all customer/master keys are unchanged.

## Provider references

- Event types: https://docs.lemonsqueezy.com/help/webhooks/event-types
- Subscription states and grace access: https://docs.lemonsqueezy.com/help/products/subscriptions
- Subscription API: https://docs.lemonsqueezy.com/api/subscriptions/the-subscription-object
- Subscription invoice API: https://docs.lemonsqueezy.com/api/subscription-invoices/the-subscription-invoice-object
- Retrieval: https://docs.lemonsqueezy.com/api/subscriptions/retrieve-subscription
