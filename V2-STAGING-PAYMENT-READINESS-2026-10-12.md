# Pathfinder V2 staging payment readiness

> **Superseded 2026-10-16:** project SSO on `pathfinder-v2-staging` is now deliberately **off** by owner decision (public staging for external testers). Application-level license/quota/owner gates remain enforced. Do not re-enable SSO from statements below; see `V2-PUBLIC-ACCESS-AND-APP-SECURITY.md`.

Status: source logic is locally tested; hosted TEST MODE integration is blocked. No deployment or payment was initiated.

## Current verified staging shell

- Project: `pathfinder-v2-staging` (`prj_8AQEDibYCzspPx67Wc0F7EpCFQGY`).
- Vercel Authentication/SSO: all deployments protected.
- Git integration, deployments and domains: none at the last provider-metadata verification.
- Preview-only variable names present: `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `OWNER_LICENSE_KEYS`, `FREE_MONTHLY_LIMIT`.
- Redis answered real synthetic concurrency tests, but permanent ownership/expiry must still be confirmed in the owner's Upstash console.

## Blocking variable names

The following must be configured only on the isolated project's Preview environment, with TEST MODE or staging-only values:

- `PAYMENT_PROVIDER=lemonsqueezy`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_PRO_VARIANT_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `SITE_URL`
- `PATHFINDER_APP_URL`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `PATHFINDER_EMAIL_FROM`

The operator must enter values directly in Vercel. Values must not be pasted into chat, source, logs or metadata exports.

## Protected webhook design

Keep SSO enabled. Create a dedicated, revocable Vercel Protection Bypass for Automation secret for Lemon Squeezy TEST MODE. Because Lemon Squeezy's webhook configuration supplies a URL rather than an arbitrary Vercel authentication header, append `?x-vercel-protection-bypass=<dedicated-secret>` to the staging `/api/payment-webhook` URL.

Important: this is not genuinely path-scoped. Possession of the query secret bypasses Vercel deployment protection across that project, even though only the webhook URL is shared. The application still verifies Lemon Squeezy's independent `X-Signature` HMAC over raw bytes, caps the body, serializes subscription writes and rejects invalid signatures. Use a staging-only bypass, disclose it only to Lemon Squeezy, rotate/revoke it after testing, and never reuse it for production or customer access. Creating it requires explicit owner approval.

Do not use a shareable browser link, disable project protection, add a public domain exception, expose an owner key, or treat the Lemon signature as a Vercel SSO credential.

## Operator-only checklist

1. Confirm the isolated Redis database appears in the owner's Upstash console and is not scheduled to expire.
2. In Lemon Squeezy, explicitly enter TEST MODE and identify the existing test store and monthly Pro variant.
3. Create a dedicated TEST MODE API key and webhook signing secret.
4. Add the missing Preview-only variables directly to `pathfinder-v2-staging`.
5. Approve creation of one dedicated Vercel automation-bypass secret for the test webhook.
6. After a separately approved deployment, configure the TEST MODE webhook URL with the bypass query and subscribe only to the event types supported by the adapter.
7. Use synthetic customer identities and test cards. Verify checkout, activation, renewal, paid-through cancellation, expiry, failure/recovery, pause/unpause, refunds, duplicates, retries and reordered events.
8. Confirm invalid Vercel bypass requests stop at SSO and invalid Lemon signatures return HTTP 400 after bypass.
9. Verify no production variables, customers, domains, callbacks or email recipients exist in the staging project.
10. Revoke or rotate the bypass after the test window and record the result without recording secret values.

## Read-only checker

`node tools/staging/check-staging-readiness.mjs <sanitized-metadata.json>` accepts variable names, targets and boolean confirmations only. It rejects metadata containing values and reports blockers without contacting providers or changing configuration.

The current deterministic suites cover checkout activation, renewal, cancellation grace, expiry, failed/recovered payments, pause/unpause, refunds, webhook signature/replay/retry/concurrency, stale and out-of-order events, and read-only reconciliation. They do not prove that hosted Lemon Squeezy or email delivery works.
