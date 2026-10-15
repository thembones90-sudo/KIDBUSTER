# PATHFINDER V2 — CODEX CONTINUATION HANDOFF
**Verified:** October 12, 2026
**Status:** Active local development; protected staging infrastructure partly configured; **NOT deployed and NOT production-ready**.
**Read this handoff BEFORE the historical `CODEX-V2-HANDOFF-2026-10-12.md`.** Historical audit recommendations now include bugs that have already been fixed and obsolete infrastructure assertions.

## 0. EXECUTION INSTRUCTION

Continue engineering **inside the existing** `A:\PATHFINDER V2` checkout on the authorized Windows computer **SKYNET**. Do not recreate/re-clone the project, reset the checkout, overwrite files, push, merge or deploy. First verify branch, HEAD, Git status and tests. Preserve live production and the user's active preview without restarting it. Work in small, tested, reversible local commits and report exact evidence, not optimism disguised as test results.

**The next release gate is staging Lemon Squeezy TEST MODE**, not refixing manual licenses or switching V2 onto production credentials. While waiting for missing third-party credentials, work on independently testable remaining security issues such as atomic Free quota and Krisp transcript durability.

## 1. Product mission, ownership and boundaries

**PATHFINDER** is a professional AI-assisted report/feedback assistant for ESL teachers. It has seven approved protocols: Classic, Sugarcoat, Fairy, Blitz, Beida, OF Protocol, Preply. The four product objectives are (a) reliability/security, (b) better design/onboarding, (c) automated Pro payments/self-service, (d) evidence-based acquisition toward 100+ weekly active teachers and 100 paying users. Targets are goals, not current traction.

**OFFICIAL LIVE:** `https://kidbuster.vercel.app/`; GitHub `thembones90-sudo/KIDBUSTER`, protected branch `main`.
**V2 ONLY:** `A:\PATHFINDER V2`, local branch `pathfinder-v2`. Latest known V2 local HEAD: **`e42d8d3`** (verify again). Local branch **17 commits ahead** of tracking remote, clean working tree at this handoff. All local V2 commits remain **unpushed**.
**Protected V2 Vercel project:** `pathfinder-v2-staging`, project ID `prj_8AQEDibYCzspPx67Wc0F7EpCFQGY`, team ID `team_p26UJZ9MgenN71TjBdHzUeMo`.

### Non-negotiable restrictions
- **Never touch live production** Vercel project `kidbuster`, `main`, real customer keys/data, live billing accounts, production database, live Krisp, or original owner/master key. Do not view, copy, rotate, delete, replace or disclose production secrets.
- No Git push, no Vercel deployment (including staging), no public URL, no production release, and no linking the staging project to Git **without explicit owner approval after separate staging safety review**. Staging project existence alone is not deployment approval.
- Never copy `.env.local` or environment variables from other Pathfinder directories. Do not expose token values in prompts, logs, repo files, chat, test screenshots or reports. Use only isolated test values.
- **No paid service enrollment** or real transactions without explicit owner authorization. Upstash Marketplace plans shown were billable; an isolated temporary guest Upstash DB was instead used at no charge.
- **Do not restart or replace the local preview servers:** `http://127.0.0.1:8765/` and local-owner alias bridge `http://127.0.0.1:8766/` are running and serving the owner's active work session. Existing process may not reflect the newest backend source because it hasn't been restarted. This is intentional. The local owner alias `[local owner alias intentionally omitted]` is **loopback-only on 8766**, never a staging or live credential. The staging project has a **separate random strong owner key**.
- All project artifact writes only on **A:** in the V2 workspace. Preserve the 7 protocols, approved teacher sign-offs, `--toxin-rgb` protocol theming, nested Generate `.btn-label`, deterministic factual reporting and KRISP ARM until **explicit DISARM**. Krisp identities must use stable license IDs, not rotating webhook tokens.
- No actual customer emails, paid checkouts, Krisp deliveries or third-party live calls. Use synthetic fixtures and Lemon Squeezy TEST MODE only once separately verified and authorized.
- No claim of readiness until actual staging integration, security, rollbacks and user-facing tests pass. Existing tests are not a substitute for real provider flows.

## 2. Current verified development state

### Completed and tested in local V2
1. Verified email ownership for signup/recovery, no existing license key disclosure merely by naming an email. Protected checkout requires authenticated access; 15 targeted checkout checks.
2. Manual 30-day Pro keys activate from **first customer activation**, not code creation. Redis SET NX atomically chooses one browser, stores first activation/expiry, supports retry after interrupted write and safe owner binding reset. Legacy manually activated keys remain supported. `[local owner alias intentionally omitted]` V2 owner alias works only on port 8766 without changing production.
3. Subscription lifecycle: correct Lemon Squeezy invoice subscription ID; cancellation keeps Pro through paid `ends_at`; later `expired` reverts Free, including when expiry webhook is missed; resumed, paused, past_due and unpaid states; rejects sequential stale state, late invoices and old subscription cancellations from overwriting a newer subscription.
4. Atomic signed webhook processing: HMAC over original bytes, request body capped at 256 KiB, per-license Redis `SET NX EX` payment lock, token-safe Lua release, signed body replay recognition and retryable 503 for in-flight contention. Mark processed only after successful state commit. **Caution:** no transactional fencing of worker writes after lock lease expiry.
5. Failed payments and recoveries, refund review instead of automatic Pro revocation, authenticated owner-only refund metadata, read-only provider snapshot reconciliation preview. **Reconciliation is NOT a scheduled auto-repair service**.
6. Deployment layout: 13 top-level API functions originally; moved trivial `/api/ping` to a static `ping.json` Vercel rewrite, excludes `api/ping.js` from Git/deployment so staged V2 has **12** serverless functions. A Git-ignored local compatibility `api/ping.js` remains for the live already-started Node preview; do not delete it during the work session.
7. All product protocols still pass their tests. Most recent full `npm test` result: **28/28 test files passed** (including browser smoke). `test-live-smoke.cjs` may SKIP; never misrepresent that as a production smoke test.

### Real external Redis integration, independently confirmed
A separate **temporary Upstash guest Redis** was created at no charge and exercised with real REST Redis plus independent Windows Node processes. Results:
- **5/5:** real SET NX EX, incorrect-token rejection, Lua release, **16-process** lock race with a single winner, expiry/crashed holder safety.
- **3/3:** **20-process** manual license activation race, one winner, original 30-day expiry, no theft/extension on later attempts.
- **5/5:** **12-process** signed subscription webhook race, correct subscription, replay deduplication, paid-through cancellation.
**Total 13/13 real Redis checks**, tests repeated using versioned `tools/staging/guest-*-real-test.mjs`. All tests use synthetic accounts; no payments, real customer information or production DB.
- Guest credentials and its private claim URL live only at **Git-ignored** `.v2-local/upstash-guest-redis-instructions.md`. NEVER print or include these in source or handoff. User stated they **claimed the guest DB**. Redis PING returned `PONG`, but Upstash guest claim-status endpoint returned HTTP **503**, so **permanent ownership and extended expiry have NOT been independently verified**. Guest documentation originally stated expiration October 15, 2026 if unclaimed. Ask the owner to confirm the DB is now listed in their Upstash console before treating it as persistent staging.
- Test helper `tools/staging/open-upstash-claim.ps1` opens the private official Upstash claim URL on the authorized desktop; it does not print the URL. Avoid inadvertent paid Upstash upgrades.

## 3. Exact Vercel staging state, VERIFIED via provider API

- Vercel project `pathfinder-v2-staging` exists, separate from live `kidbuster`.
- **SSO protection enabled for ALL deployments.**
- **Git not connected; no deployments; no staging domains; no code pushed.**
- Exactly **four** staging **Preview-only** environment variables verified by name/type/target:
  - `KV_REST_API_URL` (encrypted): the isolated Upstash test DB.
  - `KV_REST_API_TOKEN` (sensitive): isolated Upstash test DB token.
  - `OWNER_LICENSE_KEYS` (sensitive): independently generated, random 256-bit **staging-only** admin identity.
  - `FREE_MONTHLY_LIMIT=5` (plain): staging Free quota.
- Random staging owner key's local backup in **Git-ignored** `.v2-local/staging-owner-key.txt`. Never copy local `[local owner alias intentionally omitted]`, production master keys, or other existing key values.
- No Lemon Squeezy TEST MODE API, store, variant or signing secrets installed. No staging SITE_URL. No test email provider, test webhook SSO bypass, Anthropic staging API key or actual generation integration set. `GOOGLE_SHEET_WEBHOOK_URL` and production integrations deliberately absent.
- **Do not deploy while these release gates are incomplete**, including actual upstream ownership of test Redis and protecting provider webhook access without weakening SSO.

## 4. Lemon Squeezy status and immediate staging dependency

- An **August 12, 2026** Lemon Squeezy `[Test Mode] Thanks for your payment` receipt confirms Pathfinder test checkout once worked in an existing test store. It does **not** prove V2 integration or current keys/variants are configured.
- Latest located merchant approval correspondence **August 13, 2026** asked for more application information; no confirmed later live-store approval. Don't claim merchant is approved.
- Operator needs to enter the existing Lemon Squeezy dashboard in **TEST MODE**, identify the actual test-only Store ID, Pathfinder Pro monthly Variant ID, create dedicated **TEST MODE API key**, and later a separate **TEST MODE webhook secret**.
- Secrets should go **directly to Vercel staging project's encrypted/sensitive Preview env settings**, not user chat, source files or another project. No real card transactions. The webhook must never point to the live site.
- **Critical blocker:** Vercel SSO protects all staging URLs. A remote Lemon Squeezy webhook will not automatically get through it. Research and verify a **narrow, authorized per-provider access path** before creating a webhook. Don't disable SSO globally or expose a weak owner code. Do not confuse a webhook signature with bypassing Vercel's front-door SSO challenge.
- Detailed operator handoff: `V2-LEMON-SQUEEZY-TEST-HANDOFF-2026-10-12.md`.

## 5. First precise Codex assignment (perform without owner secrets)

**TASK: V2 STAGING PREDEPLOY SAFETY AUDIT AND TEST-ONLY PAYMENT INTEGRATION READINESS**

1. Confirm directory `A:\PATHFINDER V2`, branch `pathfinder-v2`, latest HEAD, `git status`, 12 deployable handlers and .vercelignore; inspect `vercel.json` rewrite and local ignored ping compatibility. Never reset, pull, push, link Git, start deployment or restart local preview.
2. Read `AGENTS.md`, `PATHFINDER-constitution.md`, `DECISIONS.md`, `V2-MASTER-PLAN.md`, `V2-DEVELOPMENT.md`, this handoff, `V2-REAL-REDIS-STAGING-2026-10-12.md`, `V2-STAGING-ISOLATION-2026-10-12.md`, `V2-LEMON-SQUEEZY-TEST-HANDOFF-2026-10-12.md`.
3. Run `npm test` with temp/cache under A:; capture the exact result. Verify Git ignores staging credentials, temporary Redis files and the compatibility ping; don't print secrets.
4. Audit `api/create-checkout-session.js`, `api/payment-webhook.js`, `api/_lib/providers/lemonsqueezy.js`, `api/_lib/subscription-lifecycle.js`, `api/_lib/kv-client.js` and `api/_lib/subscription-reconciliation.js` for TEST MODE integration defects. Confirm normalized provider event shapes, checkout success redirect, retry behavior and SSO webhook constraints. Prefer deterministic test fixtures to claims of real payment completion.
5. Review **provider webhook authentication approach** for the protected Vercel staging environment. Produce a clear proposal with evidence and required scope; **do not enable a protection bypass** or disable SSO without explicit operator approval.
6. Prepare a **non-executing staging readiness check** that inspects project/env **variable names and protection metadata only**, never decrypted values. Mark missing Lemon Squeezy/test email IDs, invalid routing and unverified Upstash ownership as blockers. No deployment.
7. Make genuinely safe code/test-only fixes found in the audit, add focused regression tests, run full suite, commit **locally** if all tests pass. Do not invent live provider results. If third-party credentials, provider login or approval is missing, report the block and move to item 8.
8. **While waiting:** inspect the next independent P0 race in `api/generate.js`: concurrent Free requests may exceed quota because entitlement check and counting are not an atomic reservation. Design and test a safe Redis reservation/release strategy with synthetic requests while preserving all seven report protocols; no live generation or Anthropic calls. Then queue durability for Krisp (never clear ARM automatically).
9. Produce short completion report: changed files, commit(s), exact test count, concrete newly found issues, standing blockers, next action for the owner. No '100%' assertion from mocks or stalled agents.

### Why this order
The payment/lifecycle fixes are complete **locally** and have real Redis verification. The work remaining before hosted billing tests is environmental authorization, separate Lemon Squeezy test credentials, and the staging SSO/webhook route. Don't waste a coding cycle refixing bugs from the old handoff while ignoring the remaining release gates.

## 6. Relevant files and commits

Read these reports rather than relying on obsolete audit snippets:
- `V2-LOCAL-OWNER-ACCESS.md` — isolated local owner access and alias bridge.
- `V2-ATOMIC-LICENSE-CLAIM-2026-10-12.md` — first-activation atomic claim.
- `V2-PAYMENT-SECURITY-AUDIT-2026-10-12.md` — checkout leak fixes + remaining risks, some later closed.
- `V2-SUBSCRIPTION-LIFECYCLE-2026-10-12.md` — cancellation, invoice identities and paid-through handling.
- `V2-ATOMIC-PAYMENT-WEBHOOK-2026-10-12.md` — locks, bounded body and dedup.
- `V2-BILLING-RECOVERY-REFUNDS-2026-10-12.md` — dunning, refunds, read-only reconciliation.
- `V2-REAL-REDIS-STAGING-2026-10-12.md` — 13/13 real Upstash tests, static ping.
- `V2-STAGING-ISOLATION-2026-10-12.md` — staging isolated project and updated Preview-only settings.
- `V2-LEMON-SQUEEZY-TEST-HANDOFF-2026-10-12.md` — exact Test Mode integration checklist.

Key local commits in order:
`e358b59` (V2 licensing port), `efe3438` (local isolated KV and preview), `ea03470` (loopback-only V2 alias), `f8483af` (atomic activation), `51dc4ba` (checkout verified ownership), `df34abc` (lifecycle), `c8b7fd9` (atomic webhooks), `ba14bed` (billing/reconciliation), `447a63f` (SSO staging shell), `75c4a4e` (real Redis validation and static ping), `e42d8d3` (staging Redis owner env + Lemon test checklist).

## 7. Outcome and longer-term program

The remaining V2 program includes atomic generation quota and AI-cost budget; reliable Krisp transcript queue + claim/ack; server-authoritative prompts and rate limiting; email test provider and customer portal; operational vs marketing UX redesign with large readable typography and mobile/keyboard support; authentic acquisition funnel, approved teacher testimonials/demo, transparent pricing and retention measurement. None is a license to weaken educational reporting integrity or disclose student data.

**Final instruction:** Continue **real implementation and testing** in V2, not a speculative redesign. Never use production secrets to avoid a staging blocker, never disrupt the owner's active preview, and never push/deploy until the owner explicitly authorizes a separately verified safe staging deployment.
