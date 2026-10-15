# PATHFINDER V2 — CLAUDE RETURN HANDOFF
Date: 15 October 2026
Purpose: Reintroduce Claude to the substantially evolved Pathfinder V2 and request an independent, evidence-led assessment before any implementation.

## 1. THE PRODUCT
Pathfinder is a browser-based AI-assisted lesson-report generator for online English teachers. The teacher chooses a protocol, enters lesson evidence or an authorized Krisp transcript, adjusts relevant settings, generates a report, reviews it, and copies it into the teaching platform. It is not a generic AI chat interface or a student database.

Seven distinct protocols are mandatory and must remain intact:
- Classic (MA): structured post-lesson feedback, student ratings, vocabulary, grammar, homework and relevant sections.
- Sugarcoat (MS): Classic-compatible reporting with softer, encouraging language.
- Fairy: expressive, child-friendly storytelling-style feedback with its own validator.
- Blitz: fast concise feedback, a 10-focus shuffle bag and warm/simple/polished voices.
- Beida: platform-specific two-field Learning Content and Performance format, with Excellent / try harder please assessment.
- OF Protocol: three-section trial-lesson narrative with qualitative evaluation tiers.
- Preply: adult, parent/child and trial-oriented modules; natural teacher feedback without artificial rubric formatting.

Canonical commercial policy: Free has five Classic generations per month and limited lifetime trials (five per eligible premium protocol). Pro is marketed at USD $12/month with unlimited generations and access to all seven protocols. Validate actual configured rules against code and tests; do not silently fall back to old 20-generation documentation.

## 2. LOCATION AND SOURCE-OF-TRUTH
Primary V2 checkout: A:\PATHFINDER V2
Current local branch: pathfinder-v2
Verified pre-publication local HEAD on 2026-10-15: 0997acbe28d70f800e0e5362d2e1b5dd5649806d (historical reference; current V2 tip may advance)
GitHub repository: https://github.com/thembones90-sudo/KIDBUSTER
IMPORTANT: At handoff preparation the local V2 branch was 93 commits ahead of GitHub. The sanitized V2 publication brings GitHub up to the current source snapshot. Consult the current pathfinder-v2 branch, not the public main branch. Inspect the local checkout directly when possible.

Production app: https://kidbuster.vercel.app/
Production project: kidbuster
V2 staging project: pathfinder-v2-staging, Vercel ID prj_8AQEDibYCzspPx67Wc0F7EpCFQGY

Production and V2 are different release tracks. The most recent observed original-production Vercel deployment was READY on 2026-10-14 (main commit 3d6bf63). The V2 staging project exists but has no verified deployment and the deployment listing returned zero. Attempts to inspect staging settings through the connected Vercel project-detail API returned 403. No claim is made that V2 is deployed or externally certified.

Current local Git status before writing this handoff had four unrelated untracked audit documents/artifacts; do not delete or overwrite them. This handoff is documentation only. Never push, merge, deploy or edit production without explicit owner approval.

## 3. WHAT CHANGED
Security and identity:
- Verified-email signup and recovery; no disclosure of existing license keys merely by knowing an email address.
- Time-limited, single-use ownership verification, generic responses and abuse controls.
- Server-controlled protocol prompt construction; structured browser parameters replace user-authoritative system prompts.
- Generation, checkout and recovery paths hardened with dedicated regression tests.
- Manual 30-day licenses begin their countdown on first valid activation, not on creation; owner renewal and device-rebinding preserve correct identity and expiry.

Reliability:
- Atomic Free/trial quota reservations, compensation on known failures and interrupted-hold recovery.
- Per-generation request identity (x-generation-id), duplicate suppression and deterministic retry responses.
- Bounded provider timeouts; truncated max_tokens results are rejected and do not count as successful reports.
- Lost successfully generated content cannot be replayed because reports are intentionally not stored. Exactly-once provider execution across all crash boundaries is not guaranteed; do not promise it.
- Krisp transcripts are queued with acknowledgement/deduplication behavior, and the ARM toggle stays armed until the teacher explicitly disarms it. Transcript ownership keys off stable license identity; regenerating Krisp tokens does not erase pending data.

Payments:
- Payment-provider abstraction with Lemon Squeezy adapter, signed webhook verification, replay/idempotency controls, serialized account updates, retries and safe reconciliation.
- Cancellation preserves Pro through the authoritative paid-through end date. Failed renewals should not prematurely revoke Pro; real expiry does.
- Refunds are review-oriented rather than blindly revoking entitlement. Provider-hosted account portal handles payment details.
- The Paddle adapter is a nonfunctional stub, not a second live processor.

User experience:
- Significant visual redesign around legibility, restrained onboarding, account/sign-in/access flows, and dedicated Help/quick-start.
- Seven native protocol cards preserved and responsive; rating selection and protocol-specific explanations standardized; critical lowest-rating siren and special maximum-rating messaging refined.
- Compact, clearer guide, access and account surfaces, responsive desktop and mobile layout; avoid layout clipping, hidden buttons, small fonts or loss of native Generate internals.
- Protocol themes use theme variables. Keep the nested Generate-button label, not a destructive textContent replacement.
- Terms of Use, Privacy Policy and Disclaimers pages added to the live original product on 14 October to support merchant review.

## 4. CURRENT VERIFICATION
On 2026-10-15, the full npm test suite was executed against the LOCAL V2 HEAD above. Result: ALL 44 TEST FILES PASSED, exit code 0. These encompass security, billing-state mocks, concurrent activation and quotas, Krisp, all seven protocols, feedback, desktop/mobile browser smoke, legal pages and evaluator harness. A passing local suite is NOT evidence of real payment or email integration.

Earlier dedicated nonproduction Upstash synthetic checks passed 13/13 after owner-supported guest-database claim, but permanent account ownership/retention fields were not directly independently inspected. Reconfirm before deployment.

A gated output-quality harness now contains 21 fictional cases (three per protocol: strong, needs-help, contradictory evidence). Test-only runner: tools/evaluate-protocol-outputs.cjs. Status: harness ready, NOT REAL-MODEL CERTIFIED. A paid evaluation requires an explicitly authorized dedicated test-only Anthropic API key, live opt-in, bounded calls, and human scores for factual grounding, adherence, rating/tone, English, formatting and teacher usefulness. Zero fabricated student facts is a hard gate.

## 5. EXTERNAL LAUNCH GATES THAT REMAIN OPEN
- V2 isolated staging must be actually deployable, protected, separately configured and browser-verified. Current Vercel connector project-detail call returned a team-scope 403.
- Verify separate Upstash database ownership/retention in its real account console.
- Configure dedicated staging-only email sender/service and prove verified signup and recovery email end-to-end.
- Configure Lemon Squeezy TEST MODE store/variant, API key, signing secret and isolated callback; prove checkout, Pro activation, renewal, cancellation grace, true expiry, retry/recovery and duplicate/reordered webhook semantics against real staging Redis.
- Decide whether to authorize a dedicated Vercel automation protection bypass for staging webhook. This bypass is effectively project-wide, NOT path-scoped; never create it or weaken access protection without explicit owner approval, and revoke after its test window.
- Validate real model report quality with the 21-case human-review gate before treating the protocol engine as certified.
- Run complete first-customer desktop/mobile walkthrough, accessibility/readability checks, privacy/data-retention review, final legal/merchant approval check and rollback rehearsal.

Lemon Squeezy merchant approval has NOT been established. Their 14 October message requested public Terms of Use, Privacy Policy and Disclaimers URLs; the owner supplied those URLs the same day. The application remains under review absent an explicit subsequent approval.

## 6. MOST RELEVANT DOCUMENTS
Read in this order:
1. PATHFINDER-constitution.md and DECISIONS.md (locked product and evolution rules).
2. V2-MASTER-PLAN.md and V2-DEVELOPMENT.md (objectives and isolation boundaries).
3. V2-IRONCLAD-GAP-AUDIT-2026-10-13.md (confirmed reliability limitations).
4. V2-PROTOCOL-ENGINE-AUDIT-2026-10-13.md (engine audit and remediation history).
5. V2-PROTOCOL-QUALITY-CERTIFICATION-2026-10-14.md (real-output acceptance gate).
6. V2-FIRST-CUSTOMER-GATES-2026-10-12.md and .v2-local/PHASE1-STAGING-READINESS-2026-10-13.md (external blockers; verify their dates).
7. V2-STAGING-PAYMENT-READINESS-2026-10-12.md (webhook/SSO hazard).
8. Actual current code: index.html, api/generate.js, api/_lib/server-generation.js, api/_lib/license-service.js, api/payment-webhook.js, api/krisp-webhook.js, tests/.

WARNING: README.md and MONETIZATION-TESTING-CHECKLIST.md contain historical/stale explanations. Resolve conflicts by checking current source, tests, current decisions and verified provider state. Never rely on old claims of 20 free monthly reports.

## 7. CLAUDE'S FIRST ASSIGNMENT — READ ONLY
Reacquaint yourself with the local V2 checkout, do not start rewriting. Inspect the architecture, current UI, seven protocol definitions and validators, reliability semantics, subscription lifecycle, and evidence for each safety claim.

Return:
A. A concise factual summary of what V2 has become and its differences from the earlier Pathfinder.
B. An independently justified 0-10 product assessment with separate ratings for UX, report-engine correctness, actual output quality evidence, security, Krisp, reliability, billing and launch readiness.
C. A severity-ranked issue register: confirmed defects vs likely risks vs unverified external dependencies, each with an exact file/function/test reference.
D. An ordered P0/P1/P2 plan for reaching safe, saleable V2, prioritizing first-customer experience and verified staging integration.
E. Three things we should NOT change because they are stable and tested.
F. Specific requests for owner approval or credentials where external testing is genuinely blocked.

Use Codex and Big Pickle for independent review if beneficial; their findings are advisory and must be validated against source/tests. Do not invent passes or bug reports. Do not expose any bearer credentials, production student data, API keys, payment secrets or private transcripts. Do not deploy, push, merge, change billing, rework protocols, or modify production before owner approval. Begin with diagnosis and explain your proposed first implementation slice.

Signed: SKYNET / Pathfinder V2 continuation handoff.
