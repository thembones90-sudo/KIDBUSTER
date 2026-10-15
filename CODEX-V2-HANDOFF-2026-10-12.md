# PATHFINDER V2 — Historical Codex Handoff

**SUPERSEDED for continuation by `CODEX-V2-CONTINUATION-2026-10-12.md`.** This is the historical initial audit, not the current work queue. Many P0 bugs described below have been fixed, real Redis concurrency tests passed (13/13), and protected Vercel staging is now configured but undeployed. Codex must use the continuation handoff for current HEAD, tests, staging and next priorities. Retained for history only.
**Date:** 2026-10-12  
**Owner instruction:** Continue developing an isolated V2 clone, test and improve it, and only promote to official Pathfinder after explicit approval.  
**This is an EXECUTION handoff, not a request for another speculative redesign or another repository clone.**

## 1. Identity, product, and commercial mission

**Product:** PATHFINDER, a purpose-built AI-assisted feedback/report-writing application for online English teachers. The product is a trusted educational judgment/workflow engine, not a generic prompt editor.
- Official LIVE application: https://kidbuster.vercel.app/
- GitHub repository: https://github.com/thembones90-sudo/KIDBUSTER
- Official branch: `main`
- Official frozen handoff baseline: `441d0c1d63136eb83f4b6b73156fc32fd6f0b8d3`
- Current official deployment last verified READY; no V2 work has been deployed there.
- Seven teacher-facing protocols: Classic, Sugarcoat, Fairy, Blitz, Beida, OF Protocol, Preply.
- Current commercial proposition: Free with 5 Classic generations per month, plus five one-time trial generations for each additional protocol; Pro offered around $12/month. Verify actual environment configuration, as old docs and `.env.example` still say 20.
- Existing users are few and enthusiastic according to the owner, but the actual count is not independently established.

**Four V2 program goals, all equally real:**
1. Security/reliability: fix identity/key leaks, API abuse, report integrity and Krisp races.
2. Visual polish/UX: strengthen branding, readability, first-use onboarding, responsive workspace and public landing presentation.
3. Fully automated payments: secure Lemon Squeezy checkout, renewals, cancellations, expiry, Pro activation, account recovery and self-service.
4. Commercial growth: responsible acquisition, testimonials/demos, measurable conversion/retention, from a few happy teachers to 100+ weekly active and ultimately 100+ paying subscribers.

North star from `PATHFINDER-constitution.md`: **Save teachers time without reducing professional quality. Facts are deterministic. Judgment is centralized. Judgment evolves through evidence. Trust is the product.**

## 2. Work location and verified Git state

**Use EXACTLY this local workspace: `A:\PATHFINDER V2`.** Do not work inside stale `A:\KIDBUSTER`, `A:\PATHFINDER OFFLINE`, the audit checkout, or production.
- Local branch: `pathfinder-v2`
- Local HEAD when handed off: `f617425ba585504eed6551e66344a601239c8eea`.
- Dev branch originally cut from production SHA `441d0c1...` and exists on GitHub; the V2-specific local documentation commits have **not** been pushed to GitHub. Do not reset or re-clone over these.
- Origin: `https://github.com/thembones90-sudo/KIDBUSTER.git`. Git push refspec is pinned to `refs/heads/pathfinder-v2:refs/heads/pathfinder-v2`. Additional local `.git/hooks/pre-push` blocks `main`/`master`; local hooks are not a guarantee of safety.
- Git working tree was clean at handoff.
- All 19 existing test files passed on 2026-10-12 in the V2 clone (including Chromium browser smoke). Passing tests DO NOT prove security and existing tests incorrectly encode some insecure behavior.
- Dependencies installed in this working tree. Keep npm cache, temp directories and any generated project artifacts on A:, e.g. `A:\PATHFINDER V2\.v2-cache` and `A:\PATHFINDER V2\.v2-tmp`. Do not write project data/build outputs to C:. Installed executables residing on C: may be used, but do not intentionally put project work there.
- A local static-only preview was launched at `http://127.0.0.1:8765/` on SKYNET. It can display the interface but does NOT provide the Vercel API functions. It may no longer be running; recheck instead of claiming it is.
- **No isolated Vercel staging is provisioned.** Creating `pathfinder-v2-lab` failed with a Vercel team-scope HTTP 403. Do not bypass by linking production or copying credentials. No staging URL should be asserted until independently verified.

## 3. Mandatory local source files to read before changing code

1. `AGENTS.md` — safety boundaries, invariants and Codex rules.
2. `V2-MASTER-PLAN.md` — four-lane program, priorities, metrics and release gates.
3. `V2-DEVELOPMENT.md` — baseline, security/queue/payments/growth roadmap.
4. `PATHFINDER-constitution.md` — product constitution; takes precedence for architecture and protocol decisions.
5. `DECISIONS.md` — historical decisions and underlying constraints.
6. `MONETIZATION-TESTING-CHECKLIST.md` — manual integration test inventory; some statements are OLD/INSECURE and must be updated, not blindly obeyed.
7. `index.html` — monolithic operational UI, protocols, validators, local state.
8. API routes and tests in `api/` and `tests/`.

Historical `README.md` and `.env.example` include obsolete '20 Free' language. Code and production env may differ: identify actual runtime source of truth without accessing/reusing sensitive production credentials.

## 4. HARD SAFETY CONSTRAINTS

- DO NOT alter/push `main`, official Vercel `kidbuster`, or the live URL. DO NOT deploy to a publicly reachable environment before isolated access-controlled staging is verified.
- DO NOT push V2 Git commits until the owner explicitly approves a push after preview/database separation is verified. Local, small, reversible commits are okay.
- DO NOT copy production API keys, KV/Redis connections, Lemon Squeezy live secrets/store IDs, owner keys, customer licenses, real teacher/student information or existing Krisp tokens into V2.
- DO NOT trigger real payment checkout, real customer emails, real webhook processing, live Krisp matches or real customer account changes. Use mocks, synthetic fixtures and independent test credentials only.
- DO NOT delete or overwrite existing working directories. Protect user's unrelated projects.
- Maintain intact: seven protocol outputs/validators, current teacher identity and signoff rules, protocol colors using `--toxin-rgb`, and nested `.btn-label` inside Generate button. Do not replace the button's `textContent` wholesale.
- KRISP ARM is a PERSISTENT toggle, never auto-disarmed by a matching transcript, regeneration, token change, disconnect, report generation or workspace reset. Only explicit DISARM changes it.
- Krisp transcript state is keyed by stable **license identity**, not regenerable webhook token.
- Report facts must be deterministic, not fabricated. Changes to judgment/protocol logic require field evidence and versioning; no unrequested prompt-editing configurator.
- Test after each meaningful change, then inspect actual results before asserting success. Write regression tests for the bug you fix.
- No claims of payment merchant approval or production readiness without direct evidence.

## 5. Confirmed deficiencies from our technical audit

### P0: unauthenticated license disclosure/account impersonation
- `api/license-recover.js` accepts any email by POST, obtains the associated license and sends it to caller without verifying mailbox ownership. A 404 for unknown emails can enumerate accounts.
- `api/license-signup.js` similarly returns the existing license key for the same email even if it belongs to a paying account. Knowledge of customer email may lead to credential disclosure.
- Existing `tests/test-license-routes.cjs` explicitly tests this insecure 'return same key' behavior; tests must change along with code.
- Fix requires **verified email ownership**, generic non-enumerating responses, rate limiting, one-time expiring verification tokens or magic links, and careful backwards compatibility for owners of existing keys.
- A robust design may need an email provider, but staging has no secrets. Implement a provider-neutral mail adapter and deterministic fake transport/tests if useful; never silently enable a public key-return fallback or claim real email delivery works before integration.

### P0/P1: paid subscription semantics and billing reliability
- `api/payment-webhook.js` verifies provider HMAC and uses a body hash as a dedup key, then immediately calls `downgradeToFree` on `subscription_cancelled` OR `subscription_expired`. That risks revoking still-paid access at cancellation even if a paid-through period remains.
- `api/_lib/providers/lemonsqueezy.js` maps four event types but not broader lifecycle states. Expand lifecycle coverage only after checking provider event documentation and real payload shapes.
- Handle cancellation at period end, resume/reactivation, failed renewals, expiration, out-of-order delivery, replay, idempotent event processing, signature validation, webhook body size limits, delayed Pro provisioning, refunds/chargebacks where provider semantics warrant.
- Payment test criteria: Free -> test checkout -> Pro -> renewal -> scheduled cancel (retain paid access) -> expiry -> Free -> repurchase; duplicate and reordered webhooks; customer portal, verified recovery. Do not use real cards/accounts.
- Merchant approval/payout production readiness remains unverified. The presence of code is not proof merchant can accept actual payments.
- References: `api/payment-webhook.js`, `api/_lib/providers/lemonsqueezy.js`, `api/_lib/license-service.js`, `tests/test-payment-provider.cjs`, `tests/test-monetization-e2e.cjs`.

### P1: generation prompt, quota and budget abuse
- `api/generate.js` accepts user-supplied `systemPrompt`, `userMessage`, `protocol` and passes prompt content to Anthropic after license gating. Move prompt authority server-side via validated structured inputs, allowlisted protocol, bounded request length and controlled model/token expenditure WITHOUT changing teacher output semantics unexpectedly.
- Check entitlement then record success is not atomic under concurrent Free requests; two requests may pass the last remaining free credit. Implement correct concurrency control, idempotent reservations and rollback/refund on failed generation.

### P1: Krisp transcript loss/races
- Webhook matched transcript storage uses a single `matched` slot; successive arriving transcripts can overwrite before the browser polls.
- Some queue operations use non-atomic `get`-edit-`set`; deduplication/write ordering can produce lost updates, including potential marking-seen before reliable persistence. Browser consuming a matched transcript may race against writes.
- Use durable per-license queue + claim/ack semantics, atomic operations, idempotency and failure tests. Preserve the explicit-ARM-only invariant.

### P2: infrastructure and data
- `@vercel/kv@2` deprecated; migrate with proper test environment.
- `puppeteer@23` unsupported, but avoid uncontrolled upgrades.
- `.github/workflows/test.yml` uses Node 18/20 while package declares 24.x; CI should match package engine.
- No trustworthy cross-customer activation/conversion dashboard; local browser analytics alone are inadequate. Instrument privacy-safe events, no student names/transcripts in marketing analytics.
- Only a handful of offline report comparisons and gold examples; treat quality claims as hypotheses pending anonymized evaluations. Offline Forge pipeline is separate experimental work, not something to blindly merge.

## 6. UX / visual redesign brief

Design for professional ESL teachers who want speed, clarity, reassurance and trustworthy feedback, not for programmers.
- Preserve the personality and distinctive dark/protocol-specific color themes. Improve visual hierarchy, legibility, whitespace, control sizes, touch targets, mobile responsiveness, focus/keyboard accessibility, skeleton/loading/error states and contrast.
- Keep **operational workspace** separate from **marketing/landing page**. Landing: explicit outcome, who it helps, 3-step demo, anonymized output example, concise protocol comparison, clear Free vs Pro benefits, genuine trust/privacy and pricing, singular clear first-try CTA.
- Make signup, verified recovery, trial allowance, pricing, upgrade, payment processing, account billing and cancellation understandable.
- Avoid rewriting the monolith into a flashy framework solely for appearance. Use smallest safe iteration first; preserve every existing protocol and workflow.
- User has a local browser tab at `http://127.0.0.1:8765/` for visual oversight. Do not claim functionality of backend calls from this static preview.

## 7. Growth and sales strategy brief

- Start with online ESL teachers who regularly write lengthy feedback (LingoAce-style workflows, Preply and independent tutors); validate actual buyer intent and pain points.
- Create short demonstration video, real anonymized examples, concise approachable outreach posts, a simple FAQ, and 3–5 genuine user testimonials with permission. No fictional endorsements, fake urgency, inflated time-savings claims or student-identifying data.
- Respect teachers' group admins and platform policies. Prefer authorized group demos, referrals, ambassadors and targeted teacher communities rather than intrusive unsolicited spam.
- Measure landing visits -> verified Free signup -> first successful report -> repeat use -> checkout -> paid activation -> retention and churn. Measure cost per generated report and gross margin.
- Targets: 100 weekly active teachers and 100 paying subscribers are **goals, not current state or forecasts**. At $12/month, 100 subscribers = $1,200 gross monthly before fees/tax/refunds/AI costs. Test price/offer/positioning, do not assume conversion rates.

## 8. Recommended order and concrete FIRST ASSIGNMENT

**Do not stop at a roadmap. Begin implementing in the clone.** First work on P0 account security while planning the billing lifecycle and design work in parallel on paper, not on production.

1. Verify `pwd`, `git status`, HEAD and branch; confirm correct local working copy. Do not reset, pull or push.
2. Read canonical files listed above, then inspect both vulnerable license routes, their `api/_lib` helper dependencies, the browser signup/recovery UI and existing tests.
3. Write an **evidence-driven, minimal solution** that never discloses an existing license key based solely on user-submitted email. Preserve existing-key login and paid entitlements. Include an email verification/one-time token abstraction with tests and a clear account-migration path.
4. Add regression coverage proving: unauthenticated attackers cannot recover existing keys, unknown-email responses do not enumerate accounts, verification tokens expire and are one-time, legitimate owner can complete verified recovery, Free vs Pro entitlements remain intact. If an external mail provider blocks final real delivery, keep it disabled in production and clearly report the integration requirement; no fake 'working' claim.
5. Run `npm test`, fix regressions. Make a local commit only after verifying targeted behavior. Do not alter official `main`, do not deploy or push.
6. Report exact changed files, failing/passing tests, remaining risks and the next top task (billing cancellation grace and lifecycle). Request owner input **only** for genuinely blocked third-party credentials/authorization, not for routine engineering choices.

**Output contract:** Concrete implemented behavior, file diffs, tests and accurate verification status. No '100% fixed' claims without test evidence, and no plans masquerading as implementations.

## 9. Current blockers and useful operational notes

- Vercel staging creation from this account got **403 team authorization** for `team_p26UJZ9MgenN71TjBdHzUeMo`. Separate staging + distinct database + test webhook credentials are mandatory before integration E2E.
- `http://127.0.0.1:8765/` is localhost on SKYNET and only a static frontend preview, not a remotely hosted staging environment.
- Codex may operate on the authorized SKYNET machine at A: only. If it has no desktop/filesystem access, explicitly ask to open `A:\PATHFINDER V2` in Codex or to connect the authorized desktop tool.
- This handoff file is **local** and may not be visible through a GitHub-only Codex workspace because the local V2 commits are not pushed. Prioritize the local folder, not GitHub main.
- Existing old documentation and tests may conflict with the actual hardened rules; preserve behavioral intent, update the obsolete tests and document deliberate changed behavior.

**Final instruction:** Build PATHFINDER V2 into a secure, beautiful, fully self-service paid product with a realistic path to hundreds of teachers, while preserving what present users love and never touching production until explicitly approved.
