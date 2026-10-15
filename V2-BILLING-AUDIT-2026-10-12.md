# Pathfinder V2 Billing Audit — Lemon Squeezy + PayPal

Date: 2026-10-12  
Scope: local V2 code and synthetic provider fixtures only. No live checkout, customer, email, credential or deployment was used.

## Implemented result

- Lemon Squeezy is the only billing and subscription authority.
- PayPal remains available as a Lemon Squeezy checkout payment method when eligible for the buyer's device and region.
- The standalone `paypal.me` path and manual-key promise were removed.
- Signed-in subscribers can open a fresh Lemon Squeezy Customer Portal URL from Access.
- Portal requests verify both stored subscription ID and customer ID against the provider response before returning the signed URL.
- Free/manual accounts cannot obtain a provider portal URL.
- The inline Free-to-Pro action now supplies the authenticated account key required by the hardened checkout route.

## Regression matrix

| Journey or failure | Local evidence |
|---|---|
| Verified Free account starts checkout | Passing checkout ownership tests |
| Anonymous email cannot obtain checkout/key | Passing verified-access and checkout ownership tests |
| Checkout binds verified email and stable license | Passing provider request-shape tests |
| Payment methods are not artificially restricted | Passing provider request-shape test; provider chooses eligible methods |
| Initial signed purchase grants Pro | Passing monetization and billing lifecycle tests |
| Renewal retains Pro | Passing monetization lifecycle tests |
| Scheduled cancellation retains Pro through `ends_at` | Passing lifecycle and E2E tests |
| Expiration returns account to Free without deleting it | Passing lifecycle and E2E tests |
| Failed payment/past due/unpaid retains Pro during recovery | Passing billing recovery tests |
| Payment recovery clears warning | Passing billing recovery tests |
| Pause/unpause/resume | Passing billing lifecycle tests |
| Partial/full refund creates owner review, not blind revocation | Passing refund tests |
| Duplicate, replayed, concurrent and out-of-order webhooks | Passing atomic webhook and lifecycle tests |
| Missed webhook reconciliation | Passing preview/apply reconciliation tests |
| Duplicate subscription prevention | Passing checkout ownership tests |
| Authenticated customer portal | Passing owner-binding and provider-response tests |
| Unsafe or mismatched portal response | Rejected by passing security tests |
| Browser checkout/payment copy and seven protocols | Passing real-Chrome browser smoke test |

## Verified test result

`npm test`: all 34 test files passed, including browser smoke. Synthetic outage messages printed by failure-path tests are expected assertions, not suite failures.

## Release blockers not proven locally

1. Lemon Squeezy Test Mode API key, store ID, monthly Pro variant ID and webhook secret are not installed in V2 staging.
2. The protected Vercel staging deployment and a narrowly scoped webhook access path are not approved or deployed.
3. PayPal visibility cannot be asserted until an actual Test Mode checkout is opened. Lemon Squeezy documents PayPal support for subscriptions, but availability is selected dynamically by device and region.
4. A real Test Mode Customer Portal flow—update payment, cancel, resume and invoice access—still requires a synthetic provider subscription.
5. Persistent ownership of the isolated Upstash staging database remains to be confirmed in the owner's Upstash console.
6. Merchant live-mode approval and production readiness remain unverified.

Production remains untouched. Promotion requires explicit authorization after the staging-only flow passes.
