# Pathfinder V2: Lemon Squeezy TEST MODE Handoff
Date: 2026-10-12 | Scope: V2 staging only. No live charges.

## What is known
- A Pathfinder Pro test-mode checkout succeeded on 2026-08-12, evidenced by the prior Lemon Squeezy '[Test Mode] Thanks for your payment' receipt.
- This demonstrates that the Pathfinder product existed and test checkout worked in August; it does **not** establish that the current store is active, the test key is available now, or that the V2 server has received actual signed events.
- Last merchant activation email found (2026-08-13) requested product details again. No later acceptance identified. Test-mode billing does **not** require live-store activation.
- Lemon Squeezy test and live mode API keys, products, customers and webhooks are logically separated per provider documentation.

## Onboarding steps for staging (operator only, no real payments)
1. Log in to the existing Lemon Squeezy dashboard. Turn on **Test Mode** explicitly. Do not open or edit production store webhooks.
2. Locate the existing test-mode Pathfinder Pro subscription product. Confirm its **store ID**, **variant ID**, and billing interval. Keep both identifiers; do not guess or use IDs from live mode.
3. Create or locate a dedicated **test-mode API key**. Store it securely for V2 only. NEVER paste secrets into ChatGPT chat, code, Git history, screenshots, or the shared report.
4. Until an access-protected staging deployment URL is approved and working, **do not create a webhook that points at production or localhost**. First establish how Lemon Squeezy will reach the signed webhook on an SSO-protected staging project, with the bypass limited as narrowly as Vercel allows.
5. When the webhook destination is verified, create a **TEST MODE** webhook with its own random signing secret, targeting V2's `/api/payment-webhook` only. Subscribe to supported subscription and refund event types (created, updated, cancelled, resumed, expired, paused, unpaused, payment success/failure/recovery/refund, order refunded). Never reuse a production signing secret.
6. Configure the following exclusively for Vercel project `pathfinder-v2-staging`, **Preview** environment: `PAYMENT_PROVIDER=lemonsqueezy`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, and the eventual protected stage `SITE_URL` (not the production domain).
7. Review email authentication: the stage must have its own safe test-only mail provider, not the live teacher/customer email audience. Leave live Krisp, live Sheets, and production AI connections disabled.
8. Test payment flows exclusively with Lemon Squeezy test cards and synthetic customer identities. Use provider Test Mode's `Simulate event` UI to exercise future subscription transitions. Test both webhook signature rejection and duplicate/reordered delivery.
9. Do not push/deploy V2 until separate staging approval, code review, and test-only credentials are in place.

## Vercel staging state at this handoff
- Project: `pathfinder-v2-staging`, ID `prj_8AQEDibYCzspPx67Wc0F7EpCFQGY`.
- SSO enabled for **all** deployments; no Git integration; no code deployed; no domains.
- Exactly four Preview-only environment variables were verified:
  - `KV_REST_API_URL` (encrypted) and `KV_REST_API_TOKEN` (sensitive), pointing to independent V2 test Upstash Redis.
  - `OWNER_LICENSE_KEYS` (sensitive), a newly generated random **staging-only** key. Secret stored at `A:\PATHFINDER V2\.v2-local\staging-owner-key.txt`, which is Git ignored. Neither local `[local owner alias intentionally omitted]` alias nor production owner credentials were used.
  - `FREE_MONTHLY_LIMIT=5` (plain) for synthetic staging use.
- **Not configured:** Lemon Squeezy test API/store/variant/webhook credentials, approved webhook bypass, staging site URL, email test credentials.
- No production environment variable values were read or copied.
- The user said the temporary Upstash guest DB was claimed into their account. A direct Redis PING returned PONG, but claim-status API returned HTTP 503; **account ownership and expiry extension could not be independently verified**. Recheck in Upstash console before first staging deployment.

## Official documentation
- https://docs.lemonsqueezy.com/help/getting-started/test-mode
- https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
- https://docs.lemonsqueezy.com/api/getting-started/requests
- https://docs.lemonsqueezy.com/help/webhooks/simulate-webhook-events
- https://docs.lemonsqueezy.com/help/webhooks/signing-requests
