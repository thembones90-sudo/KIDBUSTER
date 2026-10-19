# PATHFINDER staging checkout safety, 2026-10-19

## Incident
A prospective customer reported "Your request was in test mode, but used a non test card" at payment. This is a provider-declined TEST checkout, not proof of an actual completed sale. The customer checkout URL was not provided, so its exact originating host is not confirmed.

## Configuration facts independently checked
- Production Vercel project: `kidbuster`, publicly reached at `https://kidbuster.vercel.app/`.
- Production checkout environment's store and variant IDs match the October 17 independently verified LIVE store (429633) and LIVE monthly variant (2258907).
- Production API key and webhook secret are sensitive and weren't displayed; the Vercel env pull cannot reveal secrets. October 17 launch audit previously verified a LIVE provider key and live webhook.
- Public preview/staging Vercel project `pathfinder-v2-staging` uses a distinct variant from the LIVE monthly variant; it is a TEST payment sandbox. Preview and production apps have different user/login contexts.
- No real checkout was created and no card/payment information was processed in this incident investigation.

## Mitigation
The public preview should never imply it accepts ordinary cards:
- Server route `api/create-checkout-session.js` returns HTTP 409 for checkout attempts when `VERCEL_ENV=preview`, even for direct API calls. Production route remains unchanged.
- New staging-only frontend `assets/staging-payment-guard.js` displays a warning and makes Upgrade buttons navigate to `https://kidbuster.vercel.app/` instead of creating a test checkout. Users must log in/register separately there.
- No payment provider keys, merchant catalogues, live webhooks, customer accounts, or product prices were changed.
- This disables routine checkout tests on Preview while active. Test payments must be explicitly reenabled in a controlled isolated environment after review.

## Live deployment verification
- Staging preview deployment: `https://pathfinder-v2-staging-hhph5vnw9-thembones90-sudos-projects.vercel.app`.
- Public staging alias `https://pathfinder-v2-staging-preview.vercel.app/` updated to the above verified preview deployment.
- GET /: HTTP 200; guard JS: HTTP 200; owner statistics JS: HTTP 200.
- POST /api/create-checkout-session from anonymous noncustomer test request: HTTP 409 before reaching provider.
- Real headless browser: warning visible; account Upgrade button navigates to `kidbuster.vercel.app`; zero staging checkout API requests.
- Focused `test-staging-payment-safety.cjs`: six checks pass.
- Complete isolated `npm test` run: **all 87 test files passed**.

## Customer recovery
Share ONLY `https://kidbuster.vercel.app/` as the selling site. Customer signs in/registers there, then clicks Pro upgrade. Discard the former test-checkout URL. If the customer reports the same error from that exact live site, obtain the **non-sensitive hostname/path** from their checkout address bar (not card details or session tokens) and escalate; production provider integration has not yet been confirmed by a real paid transaction.

## Limitations
A mode mismatch on production is not proven impossible merely because IDs match. Verified live payment acceptance, final payment settlement, and subscription activation require a real approved purchase and webhook confirmation. The preview safety mitigation specifically addresses accidental test-mode checkouts, without asserting a real payment has succeeded.
