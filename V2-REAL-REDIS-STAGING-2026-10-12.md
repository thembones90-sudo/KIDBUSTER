# Pathfinder V2: Real Redis Integration and Staging Preparation
Date: 2026-10-12 | Workspace: A:\PATHFINDER V2 | Branch: pathfinder-v2

## Infra state
- Separate Vercel project `pathfinder-v2-staging`, project ID `prj_8AQEDibYCzspPx67Wc0F7EpCFQGY`, Vercel SSO protection enabled for **all** deployments.
- No Git connection, no deployment, no domains, no project environment secrets yet. Live project `kidbuster` untouched.
- Upstash Marketplace integration `upstash` exists in the account. Its project-provisioning plans returned by Vercel start with **billable** pay-as-you-go ($0.20 / 100K commands; payment method required); no plan was purchased.
- Official Upstash direct product provides a free database option. A no-signup **temporary guest Redis** was created via the documented `POST https://upstash.com/start-redis`, with **zero payment or customer credentials**.
- Temporary guest DB expires **2026-10-15** if unclaimed. Its endpoint/token and private claim link are stored ONLY at `A:\PATHFINDER V2\.v2-local\upstash-guest-redis-instructions.md`, Git ignored. No secrets are printed in source, logs or commits.
- Staging test scripts in `tools/staging` read those local private credentials at runtime. The private helper `open-upstash-claim.ps1` opens Upstash claim page **only upon a manual operator run**, keeping the claim URL out of console history.
- Do not put a 3-day guest DB into a long-lived Vercel environment and mistake it for permanent staging. Claim it or provision a new authenticated **free Upstash** Redis resource first.

## Real Redis results (not mocks)
All tests run against one isolated external Upstash REST Redis database; **only synthetic records** were created and cleaned up.

`node tools/staging/guest-redis-real-test.mjs`: **5/5 passed**:
- Genuine Redis SET NX EX first-writer-wins.
- Token-check rejection of unauthorized release.
- Lua compare-and-delete succeeds for authorized lock holder.
- **16 independent Node processes**: exactly one wins.
- TTL expiry, reacquisition, and protection from stale lock release.

`node tools/staging/guest-activation-real-test.mjs`: **3/3 passed**:
- Real manual Pro license activated by **20 independent Node processes**: exactly one browser wins; 19 are rejected.
- Activation timestamp starts exactly one 30-day entitlement.
- Subsequent independent processes cannot steal claim or extend expiry.

`node tools/staging/guest-webhook-real-test.mjs`: **5/5 passed**:
- **12 independent Node processes** deliver the same validly signed synthetic subscription event without error.
- All competing deliveries resolve to the one correct paid subscription and license identity.
- At least one commits, others retry or deduplicate.
- Replay after commit recognized as duplicate.
- Signed cancellation preserves Pro until paid-through period ends.

TOTAL: **13/13 real Redis checks passed**. Synthetic account and invoice data only. No payment requests. Tests were re-run successfully from versioned `tools/staging/` harness. Clean-up deletes all test keys it creates.

## Deployment layout finding and fix
- Source had **13 top-level api/*.js handlers**, exceeding the documented 12-function Hobby limit for file-based runtime deployments.
- Converted trivially public `GET /api/ping` into static `ping.json` with Vercel rewrite. All 12 substantive API functions remain.
- A compatibility copy of `api/ping.js` is left **only in the local, ignored working directory** to preserve the already-running localhost:8765 server without restart. It is removed from the Git index, excluded by `.gitignore` and `.vercelignore`, and will NOT be part of staged deployments.
- The local preview ping briefly returned 500 during conversion; it was immediately restored to 200 without restart. Both V2 ports remain unaffected otherwise.
- `tests/test-staging-layout.cjs` checks deployable handler count, exclusions, static ping response, unchanged generation timeout, and local preview compatibility.

## Tests and safety
- `npm test`: **28/28 files passing** as of this change (includes browser smoke and prior licensing, concurrency, payment safety tests).
- Real Redis checks are separate from `npm test` and require the private guest instructions, never production credentials.
- No production secrets/master code, real Krisp data, customers or billing, production KV, or live Vercel project were touched.
- No Git push, project deployment or local-preview restart.

## Next concrete actions
1. **Owner optional zero-cost action:** claim the temporary Upstash guest database by manually running:
   `powershell -NoProfile -ExecutionPolicy Bypass -File "A:\PATHFINDER V2\tools\staging\open-upstash-claim.ps1"`
   Then select the free database tier in Upstash; do not accept an unexpected paid checkout. Claiming before 2026-10-15 avoids losing this temporary test DB. Alternatively create a separate free DB directly at https://console.upstash.com/ and connect ONLY V2.
2. Configure the permanent database with Vercel staging project only, confirm secrets present without revealing values and confirm production database identity differs.
3. Set up Lemon Squeezy TEST MODE API key, product and variant, webhook signing secret, and separate webhook destination after protected staging is deployed. Test/live credentials are isolated in Lemon Squeezy.
4. Verify SSO webhook integration via securely scoped provider authentication/bypass; do not disable global staging protection.
5. Perform staging build, protected UI/health verification, fake subscriptions, and rollback drill. Deploy or push ONLY after explicit owner approval and stage safety gates.

## Sources
- https://upstash.com/pricing/redis (free tier and temporary guest DB)
- https://upstash.com/docs/redis/howto/vercelintegration
- https://vercel.com/docs/functions/runtimes (Hobby handler count)
- https://docs.lemonsqueezy.com/help/getting-started/test-mode
