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
- First mitigation: 87/87 test files passed. Final V2 customer-link redirect: **all 88 test files passed** (npm test exit 0).

## Customer recovery
Share ONLY `https://kidbuster.vercel.app/` as the selling site. Customer signs in/registers there, then clicks Pro upgrade. Discard the former test-checkout URL. If the customer reports the same error from that exact live site, obtain the **non-sensitive hostname/path** from their checkout address bar (not card details or session tokens) and escalate; production provider integration has not yet been confirmed by a real paid transaction.

## Limitations
A mode mismatch on production is not proven impossible merely because IDs match. Verified live payment acceptance, final payment settlement, and subscription activation require a real approved purchase and webhook confirmation. The preview safety mitigation specifically addresses accidental test-mode checkouts, without asserting a real payment has succeeded.

## Follow-up: make the shared customer V2 URL live (2026-10-19)
The public alias `https://pathfinder-v2-staging-preview.vercel.app/` was still being shared with prospective customers, and the existing warning/upgrade-button guard did not avoid a user signing up on the test environment first. The customer-facing fix now runs at the very beginning of index.html: if and only if the hostname is this exact shared alias, navigate using `location.replace('https://kidbuster.vercel.app/')`, discarding old staging query parameters and tokens. All registration, saved keys, checkout, and post-payment activation then happen on one LIVE V2 origin with LIVE licensing/billing KV. Other immutable test-preview URLs continue in preview mode with hard server-side 409 blocking paid checkout.

Verification: real Chrome visited the shared alias with a synthetic staging token parameter, navigated to live `kidbuster.vercel.app`, discarded the entire old query, showed the V2 Owner Tools/upgrade elements, and had no page JavaScript errors. A synthetic owner-controlled Free license on the live site successfully requested a hosted Lemon Squeezy checkout: provider checkout generation HTTP 200 and real Chrome hosted page title "Pathfinder Pro - Checkout" HTTP 200, without a visible test-mode warning. A bare automated HTTP fetch of the hosted checkout returned 404, so browser verification is authoritative for this JS-heavy checkout. **No real card was charged and no successful LIVE subscription webhook activation is claimed.** This redirects customers away from test mode; actual charge/Pro lifecycle certification still requires a permitted real payment.
