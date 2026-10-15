# Pathfinder V2 | Payment and Subscription Security Audit
Date: 2026-10-12
Branch: `pathfinder-v2` | Workspace: `A:\PATHFINDER V2`
Scope: local code review and synthetic tests only. No production datastore, actual payment provider calls, customer records, Vercel deployment or live credentials.

## Executive assessment
**NOT READY for commercial billing.** V2's email-verification architecture is good, but its original checkout endpoint bypassed that protection. That specific hole is patched in this audit pass, with 15 dedicated synthetic checks and 23/23 complete test suites passing. Cancellation timing, event ordering and idempotency remain release blockers.

## P0 (FIXED THIS PASS): Existing customer key leaked via unauthenticated checkout
Previously, `api/create-checkout-session.js` took an arbitrary email address, called `getOrCreateFreeLicense(email)`, then returned the resulting existing `licenseKey` in its HTTP body. This bypassed the secure email-verification work in `api/license-signup.js` and `api/license-recover.js`.
Attack path: unauthenticated caller names a real customer's email and retrieves their access key without controlling the mailbox. No payment completion required.

**Implemented mitigation:**
- `api/create-checkout-session.js:23-35`: no auth header means generic 202 secure-mailbox-verification flow; neither key nor checkout URL is returned.
- `api/create-checkout-session.js:38-60`: checkout requires a valid caller bearer key, rejects mismatched requested keys and billing email, and prevents duplicate checkout for an already subscribed account.
- `api/create-checkout-session.js:77`: authenticated successful response provides a URL only; no needless copy of the bearer key.
- `index.html` `onProClick()`: supplies the browser's stored access key when available, otherwise displays the verified-email next step on HTTP 202.
- `tests/test-checkout-ownership.cjs`: 15 tests cover existing/unknown email, anonymous key abuse, other-account key usage, mismatched billing email, owner account, paid customers, direct-to-Pro newcomer, mailbox verification, and authenticated checkout.
**Result:** `npm test` all **23 test files passed**, including Chrome UI smoke. Synthetic Lemon Squeezy checkout URL is stubbed; no external payment calls.

## P0 (OPEN): Cancellation revokes paid-through service early
- `api/_lib/providers/lemonsqueezy.js:26-35` maps `subscription_cancelled` to immediate `subscription_cancelled`.
- `api/payment-webhook.js:87-93` immediately calls `downgradeToFree` for BOTH cancellation and actual expiry events.
- `api/_lib/license-service.js:437-455` drops Pro immediately.
- `tests/test-monetization-e2e.cjs` currently asserts immediate Free downgrade on cancellation, encoding the wrong billing policy.
**Required:** Parse/store the provider's paid-through `ends_at`, retain Pro until that time, downgrade on actual expiry/cancellation policy, handle resume/reactivation and correct tests.

## P0 (OPEN): Old/new subscription webhook ordering is unsafe
- `api/payment-webhook.js:79-93` applies subscription_created/renewal and cancellation/expiry without validating that the incoming event belongs to the CURRENT subscription or is newer than the current stored transition.
- `api/_lib/license-service.js:84-138` treats each event as a last-write-wins Pro upsert.
- `api/_lib/license-service.js:437-455` can downgrade directly by license key without checking current subscription ID.
**Consequence:** Delayed cancellation from a prior subscription can downgrade a newly resubscribed customer; late success after expiry can erroneously restore access.
**Required:** Per-subscription version/order rules, validated subscription identity and event timestamps, explicit legal lifecycle transitions; tests for reordered events across subscriptions.

## P1 (OPEN): Webhook replay and duplicate handling is not atomic
- `api/payment-webhook.js:53-70` reads dedup marker before processing, and chooses to proceed if marker read fails.
- `api/payment-webhook.js:103-110` marks processed only AFTER mutation.
Two simultaneously delivered identical events can both pass the check; an outage can reapply stale events.
**Required:** Atomic idempotency claim/reservation with durable state, safe retry after partial failures, and tests with concurrent identical deliveries. Don't assume update operations are always idempotent.

## P1 (OPEN): Unbounded webhook request body
- `api/payment-webhook.js:25-33` accumulates arbitrary incoming data chunks and then concatenates the full body before verifying its signature.
**Required:** Strict request size limit, termination/error handling, HTTP 413 and fixtures confirming no large request can consume unbounded function memory.

## P1 (OPEN): Subscription lifecycle coverage gaps
- `api/_lib/providers/lemonsqueezy.js:26-35` ignores updated, paused, resumed, failed-payment and other relevant events. Some might need no immediate downgrade, but all must be deliberately classified, not silently dropped.
- No tested provider reconciliation step for missing/misordered delivery, stalled payment activation, refunds or chargebacks.
**Required:** State-transition table rooted in supported provider semantics, test store fixtures and recovery/reconciliation policy.

## Existing useful protections
- `api/payment-webhook.js:21-23` disables automatic JSON parsing to preserve raw bytes; `api/_lib/providers/lemonsqueezy.js` uses HMAC SHA-256 and a timing-safe signature compare.
- `api/license-signup.js`, `api/license-recover.js`, `api/license-verify.js` verify email control and limit requests.
- Manual Pro first activation has a Redis SET NX single-winner marker (V2 commit `f8483af`).
These strengths should remain unchanged.

## Execution plan
1. **Done:** Fix unauthenticated checkout key disclosure, add tests, verify 23/23 files.
2. **Next:** Implement paid-through cancellation and actual expiry semantics, with event-scoped subscription identity, model payment state fields and cancellation/resume tests.
3. Add durable idempotency, event ordering, body limits and unhappy-path test matrix.
4. Exercise provider test mode on a dedicated, access-protected V2 staging project and datastore. Never use production Vercel credentials, live card charges or real customer keys.

## Big Pickle run status
The owner requested OpenCode `opencode/big-pickle` as a second reviewer. OpenCode 1.18.23 reported the Big Pickle model available. A read-only audit was started through both `opencode run` and local session API, but **it did not finish**. The visible first tool call failed due to malformed read arguments (`offset:"1.0"` instead of a number), after which the OpenCode runner/server stopped responding. Those stalled audit-only processes were stopped; no Big Pickle audit report was returned. This report reflects **independent direct source review and local tests**, not invented agent findings. Delegation task retained at `.v2-tmp/BIG_PICKLE_PAYMENT_AUDIT_BRIEF.md` for re-run after OpenCode is repaired.

## Release restrictions
Local source changes only, no production deploy, no GitHub push. Existing localhost V2 preview is intentionally not restarted, so its running API code does **not** yet reflect these checkout source edits. Local tests use synthetic in-memory KV and a fully stubbed provider; real payment-provider integration has not been verified.
