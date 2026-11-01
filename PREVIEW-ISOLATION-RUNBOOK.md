# Classbuster Preview vs Production Isolation Runbook
Status: **BLOCKED** on 2026-11-01. This document is an operator checklist, not approval to modify production or run payment tests.

## Confirmed configuration issue
The Vercel project `kidbuster` has single environment-variable entries targeting **both** `preview` and `production` for:
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_REST_API_REDIS_URL`, `KV_REST_API_KV_URL`
- `GOOGLE_SHEET_WEBHOOK_URL`
- `APP_ACCESS_KEY` and `FOUNDER_LICENSE_KEYS`

Scope-only evidence: `A:\CLASSBUSTER-PUBLIC-READINESS-20261101\OPERATIONAL-ENV-SCOPES-20261101.json`.
**No secret values** were read, exported, written, printed, compared, or copied. Vercel's scope metadata does not prove which actual database the values identify.

## Operator-only isolation actions (no automated billing changes)
1. In Upstash, provision a **new, disposable Preview Redis database** on an appropriate plan. Record only the nonsecret database ID for change-control. Do not delete or alter production.
2. In Vercel project `kidbuster`, under Settings > Environment Variables, split each `KV_REST_API_*` entry into separate Production and Preview entries. Keep the production values unchanged. Set all Preview entries to the new database's own URL/tokens. Do not print tokens or enter them in ChatGPT.
3. Isolate Preview `GOOGLE_SHEET_WEBHOOK_URL` or disable its integration in Preview. Give Preview its **own** application/owner/test credentials rather than the live owner keys. Do not reuse or publish real teacher data.
4. In Lemon Squeezy, create a **Test Mode** API key and use a test-mode store, product variant, and webhook signing secret. Configure separate Preview-targeted `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, and `LEMONSQUEEZY_WEBHOOK_SECRET`. Confirm each in the Lemon Squeezy dashboard. Separate Vercel variable entries do not prove Test Mode.
5. Reinspect variable **names and target scopes only** with Vercel's non-decrypting environment-list API. Run:
   `node tools/release/audit-preview-environment.cjs <sanitized-scope-metadata.json>`.
   Shared critical variables return exit code 2. An exit code 0 only clears the **scope** check. It is **not** authorization to run a positive checkout.
6. In provider consoles, verify Preview and Production Redis **database IDs differ**, their credentials differ, and the test-mode Lemon keys/variant and webhook map only to Test Mode. Record only date, reviewer and pass/fail, not secret values. Verify email and Sheets callbacks use a test destination.
7. From the exact immutable candidate, deploy/redeploy a **protected Preview** with the newly scoped Preview environment variables, then rerun the negative/refusal-only smoke.
8. Only after both the scope gate and provider-console review pass, run one controlled Lemon Squeezy test purchase with a test card and synthetic account, and confirm: signed webhook -> correct test Redis entitlement -> duplicate event safe -> cancellation and refund handling -> no impact on production records. Test-mode emails go to the store owner/team, not arbitrary customer addresses.
9. Preserve Vercel deployment SHA, smoke output, subscription receipt IDs (nonsecret), event count and pass/fail. No real credit-card purchase; no public release toggle.

## Additional release gates
- **Production Upstash capacity:** confirm and explicitly authorize PAYG or another sustainable tier, with monitored budget. The 500,000-command free tier has already been exhausted once. **Never automatically modify billing** from a test or release script.
- **Legal:** operator approves updated Classbuster privacy and terms, student/parent recording consent responsibilities, deletion/retention and jurisdiction.
- **Production:** stage an immutable production-environment candidate without assigning the public domain, perform authorized owner Pro/Scout/Krisp verification and a rollback rehearsal before explicit promotion.
- **Public Scout installer:** trusted Authenticode signing, clean Windows 11 install/upgrade/uninstall, and authorized non-owner access. Keep `assets/scout-release.json` unavailable until approved.

## References
- https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
- https://docs.lemonsqueezy.com/help/getting-started/test-mode
- https://docs.lemonsqueezy.com/help/webhooks/simulate-webhook-events
- https://upstash.com/docs/common/account/faq
