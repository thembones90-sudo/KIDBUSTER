# CODEX — PATHFINDER V2: BILLING LIFECYCLE + PROTOCOL REGRESSION
Date: 2026-10-13
Owner: Codex (implementation). Reviewer: Big Pickle (separate read-only assessment).

## Scope and safety
Work ONLY inside `A:\PATHFINDER V2` on `pathfinder-v2`. Verify HEAD and working-tree status first. Preserve the existing untracked Qwen audit JSON untouched. Read AGENTS.md, CODEX-V2-CONTINUATION-2026-10-12.md, PATHFINDER-constitution.md, DECISIONS.md, and the newest IRONCLAD audit before editing.
Never write artifacts to C:, inspect or reuse production secrets, interact with real customer accounts, push, merge, link Git, deploy, restart the live local previews, or change the original `main` branch. Staging is NOT approved for deployment. Do not change the local master alias `[local owner alias intentionally omitted]`.
Keep all seven protocol definitions, teacher sign-offs, persistent Krisp ARM, stable license identity, `.btn-label`, protocol theme vars, and commercial allowances unchanged. Protocol judgment is versioned and MUST NOT be silently edited.

## Assignment A — payment lifecycle proof
1. Examine api/payment-webhook.js, api/_lib/providers/lemonsqueezy.js, api/_lib/subscription-lifecycle.js, api/_lib/kv-client.js, api/_lib/subscription-reconciliation.js, and tests/test-{payment-provider,subscription-lifecycle,atomic-payment-webhook,billing-recovery-refunds,monetization-e2e}.cjs.
2. Build a coverage matrix for checkout -> signed subscription_created -> active Pro -> renewal -> failed payment -> recovery -> cancellation with paid-through Pro -> expiration -> repurchase; include duplicate, out-of-order, missing and concurrent webhook delivery; account recovery with quotas intact; malformed signed payload and old subscription overwrite attempts.
3. Verify each row by directly identifying exact code and tests. Separate simulated correctness from real provider staging evidence. Explicitly assess Redis lease-expiry writer fencing, provider timestamps, and webhook retry status handling.
4. Implement only the highest-severity, independently confirmed missing protection using the smallest safe patch and a deterministic regression test. Do not rewrite working lifecycle code on speculation.
5. Run relevant tests and entire `npm test` with temp/cache environment directed to A:. If any test cannot run, preserve the exact failure. Commit only the reviewed local change; do not push.

## Assignment B — engine regression support
While reviewer inspects protocols, inspect existing validator/test coverage for MA, MS, FAIRY, BLITZ, BEIDA, OF and PREPLY. Add synthetic deterministic contract tests only where specific format, substitution, identity, or no-hallucination boundary rules are testable. Do not assert that mocked provider output proves report writing quality. Do not change protocol wording without owner-approved version bump.

## Delivery
Create `V2-CODEX-LIFECYCLE-AND-PROTOCOL-RESULTS-2026-10-13.md`: starting and ending SHA, changed files, tests attempted/passed/failed, confirmed defects vs hypotheses, patches, external staging blockers (test credentials, durable Upstash ownership, SSO inbound webhook), and remaining quality questions. No optimistic percentages. Production untouched.
