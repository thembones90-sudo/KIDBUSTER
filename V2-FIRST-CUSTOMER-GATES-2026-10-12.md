# PATHFINDER V2 — FIRST CUSTOMER: CURRENT INTEGRATION GATES
Date: 2026-10-12. SKYNET + BULLY review. Local V2 branch only.

## Evidence independently verified this run
- `npm test`: **34/34 files passed**, including browser smoke, known/unknown recovery responses, one-time tokens, generation quota concurrency, checkout ownership, signed webhook lifecycle, billing recovery, Krisp and all seven protocols. These are **local/synthetic** tests, NOT real email or provider-hosted checkout.
- V2 current HEAD before this document: `cd3b7ab`. No application logic changes in this review.
- Vercel MCP `get_project` and `list_deployments` for `prj_8AQEDibYCzspPx67Wc0F7EpCFQGY` returned **403 scope forbidden** for `team_p26UJZ9MgenN71TjBdHzUeMo`. Mapped CLI fallback attempted; Vercel CLI unavailable on SKYNET. Consequently current deployment and Preview variable state **cannot be reverified**.
- Read-only check of local process/user ENV PRESENCE, not values: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `PATHFINDER_EMAIL_FROM`, `PATHFINDER_APP_URL`, `PAYMENT_PROVIDER`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, and `SITE_URL` are all absent locally. This does NOT prove they are absent from Vercel, which is inaccessible now.
- Previous staging inventory indicated separate Preview Redis and owner credential, but provider state was not reverified this run. No real test email or purchase attempted.

## BULLY: independently adjudicated findings
- Claimed `api/license-recover.js` lacks rate limiting: **false**. That route delegates to `api/_lib/access-request.js`, which calls `enforceVerificationRateLimit` and returns HTTP 429. Covered by `tests/test-license-routes.cjs`.
- Claimed checkout requires an atomic generation quota: **category error**. `api/create-checkout-session.js` is an entitlement purchase path, not generation usage. `api/generate.js` performs `reserveGeneration` for generation limits; concurrency covered by `tests/test-atomic-generation-quota.cjs`.
- Claimed Krisp replay dedup is implemented in `api/_lib/licensing.js` near 391-416: **unsupported/misattributed**. A real replay-failure sequence has not been established. `tests/test-krisp-queue-reliability.cjs` covers queue behavior, but long-horizon TTL expiry could warrant a separate targeted test if evidence identifies a real gap.
- Raw read-only BULLY trace: `artifacts/qwen-audits/PATHFINDER-QWEN-SECURITY-AUDIT.json`. Findings are NOT accepted code defects; no code edited based on them.

## Next user/provider actions that cannot be fabricated
1. Restore authorized Vercel access to team `team_p26UJZ9MgenN71TjBdHzUeMo` and the isolated `pathfinder-v2-staging` project (current connected Vercel auth returns 403). Recheck SSO protection, staging-only KV ownership, no Git linkage or production credentials, and current Preview-only metadata before any deployment.
2. Set up a verified **staging-only Resend** domain/sender and API credential; save values only in staging Preview settings. `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `PATHFINDER_EMAIL_FROM`, `PATHFINDER_APP_URL`.
3. Connect Lemon Squeezy TEST MODE store, **monthly** Pro variant, API key, webhook HMAC secret and test site URL to Preview ONLY. No live charges or production store.
4. Review the documented Vercel SSO vs webhook-delivery tradeoff in `V2-STAGING-PAYMENT-READINESS-2026-10-12.md`. A project-wide automation bypass in URL is sensitive even if used at a webhook path: require explicit owner review/approval before creation.
5. With provider gates met and separately approved protected staging deployment, use synthetic customers and test payments to prove: email signup and recover, verified-key handoff, Free five-report quota, upgrade checkout, Pro activation, renewal, payment failure/recovery, cancellation grace, expiry, refund, replay rejection, webhook retries, and return-user recovery.
6. Run end-to-end browser acceptance, check billing/account state against staging-only Redis, preserve signed/HMAC webhook verification and replay protection. Revoke automation bypass following the test window.

## Safety and release status
LOCAL SOURCE REGRESSION: PASS (34/34).
REAL REDIS HISTORICAL SYNTHETIC TEST: PASS (13/13 per earlier staging report; not rerun now).
HOSTED EMAIL: BLOCKED, not tested.
HOSTED LEMON TEST CHECKOUT: BLOCKED, not tested.
STAGING DEPLOYMENT: BLOCKED by 403/access, provider credentials and owner review gates.
PRODUCTION: Untouched.
