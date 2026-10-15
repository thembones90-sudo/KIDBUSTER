# Pathfinder V2: Protected Staging Infrastructure
Date: 2026-10-12

## Confirmed created (Vercel)
- **Project:** `pathfinder-v2-staging`
- **Vercel project ID:** `prj_8AQEDibYCzspPx67Wc0F7EpCFQGY`
- **Account:** `team_p26UJZ9MgenN71TjBdHzUeMo`
- **Node:** 24.x
- **SSO protection:** enabled for **all** deployments. Independently verified with Vercel project inspection.
- **Git connection:** none.
- **Latest deployment:** none; project is not live.
- **Domains:** none.
- **No production Vercel project, customer data or production environment variable was changed.**
- **No V2 commit has been pushed or deployed.**

## Required isolation gates before deploying
1. Provision a NEW **nonproduction Upstash Redis/KV database**. Connect its own `KV_REST_API_URL` and `KV_REST_API_TOKEN` ONLY to this V2 project. Never reuse production datastore tokens. Synthetic test accounts only.
2. Configure a Lemon Squeezy **test-mode store** and its own staging webhook secret, store/variant IDs, and API key; use a webhook URL that points EXCLUSIVELY to the protected staging project. Do not connect the production store's webhook or real subscriptions.
3. Create distinct random staging-only owner credential and test-only email provider configuration. Do not use or read the owner's production master code. Never copy `.env.local` from other projects.
4. Keep `GOOGLE_SHEET_WEBHOOK_URL` unset, and any real Krisp/teacher integrations **disabled**. No production customer or student data.
5. Confirm SSO remains enabled for **all** V2 URLs, including deployment aliases, before the first deployment. Confirm staging endpoint is **not reachable by unauthenticated visitors**.
6. Ensure source is checked out from exact `pathfinder-v2` local reviewed commit only. Never link this staging project to a Git repo until the operator explicitly wants automatic deployments; even then constrain to V2-only workflow.
7. Before testing webhooks, determine how the provider will authenticate to an SSO-protected function. A separate, tightly scoped automation bypass may be required; never disable all-deployment protection to get a webhook working.
8. Validate the new webhook SET NX EX / Lua behavior on staging Redis with concurrent signed synthetic events, and enforce max function execution time below the payment lock TTL or implement fencing. A local in-memory pass does NOT prove distributed safety.
9. Run full UI/auth/email/checkout/renewal/cancel/recovery/refund/expiry tests with **test-mode-only** provider transactions. Explicitly verify that no production account is impacted.
10. Final source audit, tests, rollback readiness and owner's explicit approval are required before pushing or deploying. No automated payment production rollout from this staging project.

## V2 environment variable inventory (names only)
- KV: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
- Billing: `PAYMENT_PROVIDER`, `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `SITE_URL`.
- Authentication: staging-only `OWNER_LICENSE_KEYS` and optional `FOUNDER_LICENSE_KEYS`.
- Email: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `PATHFINDER_EMAIL_FROM`, `PATHFINDER_APP_URL`.
- Generation: a staging-only `ANTHROPIC_API_KEY` if interactive generation tests are explicitly enabled; otherwise leave unset.
- Product: `FREE_MONTHLY_LIMIT=5` (proposed staging value).
- Deliberately not used: production `GOOGLE_SHEET_WEBHOOK_URL`, real Krisp accounts, production credentials.

## Next action
Provision the dedicated V2 test KV and test store. The Vercel project is a secure *empty shell* at this stage, not a working staging application. Once credentials and provider webhook authentication strategy are independently verified, prepare a protected non-production deployment for the owner to review. Do not push or deploy before readiness gates.

## October 12 progress: temporary real Redis tests
- A separate **temporary** Upstash guest Redis was created at no charge; it expires 2026-10-15 if not claimed into an Upstash account. Credentials and claim URL are stored solely in the Git-ignored `.v2-local/` folder.
- The real remote Redis passed **13/13 test checks** (including 16-process lock contention, 20-process manual activation, and 12-process signed payment webhook concurrency). This proves the chosen Redis SDK primitives work remotely for these cases, but **does not** replace persistent authenticated staging or account billing/test-mode verification.
- The tested and repeatable, secret-free harness lives in `tools/staging/`. The operator can open the temporary claim link manually using `tools/staging/open-upstash-claim.ps1` (does not print it).
- Hobby-style function count reduced from 13 to 12 by static ping rewrite. The running local preview retains an ignored compatibility ping file; no restart is required.
- See `V2-REAL-REDIS-STAGING-2026-10-12.md` for evidence, limitations, and staged rollout gates.

## Post-claim confirmation and Preview-only Vercel settings (October 12)
- User confirmed completing Upstash's claim workflow. Independent guest-service idempotency lookup returned HTTP 503, so ownership/expiry extension remain **user-confirmed, not provider-verified**. The actual Upstash database responded `PONG` after the claim.
- Configured a test Redis connection exclusively in Vercel project `pathfinder-v2-staging`: `KV_REST_API_URL` encrypted and `KV_REST_API_TOKEN` sensitive, each target `preview`.
- Generated a new 256-bit **staging-only owner credential**, stored in Git-ignored `.v2-local/staging-owner-key.txt` and saved as `OWNER_LICENSE_KEYS` sensitive for Vercel **Preview** only. The local `[local owner alias intentionally omitted]` key and the production owner master key were never used or changed.
- Set `FREE_MONTHLY_LIMIT=5` for Vercel Preview. Verified exactly four Preview variables by name/type/target, without decrypting them.
- Vercel project remains SSO-protected for all deployment URLs, unlinked from Git, without a deployment, domain, production variables, Lemon Squeezy test-mode credentials, or a public webhook.
- A previous Lemon Squeezy **Test Mode** Pathfinder checkout receipt dated August 12 was found; merchant acceptance is not confirmed. See `V2-LEMON-SQUEEZY-TEST-HANDOFF-2026-10-12.md`.
