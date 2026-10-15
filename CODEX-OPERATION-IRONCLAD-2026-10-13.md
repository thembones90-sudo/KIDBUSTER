# CODEX ASSIGNMENT — PATHFINDER V2: OPERATION IRONCLAD

Date: 2026-10-13
Branch: `pathfinder-v2`
Local working directory: `A:\PATHFINDER V2`
Current starting commit when brief prepared: `2820e82`

## Mission

Move Pathfinder V2 toward production-grade reliability, privacy and maintainability. **First audit existing implementations and tests, then close only confirmed gaps.** No broad rewrite and no claims of 100% correctness without evidence. Work locally on A: only. Do NOT write to C:, deploy/push to production, handle real customer data, change pricing, or modify master-key semantics. Do not touch the production `main` branch or the `[local owner alias intentionally omitted]` permanent local owner alias.

## Phase 0 — Evidence-based gap analysis (MANDATORY FIRST)

Review current code, tests, and handoffs for generation, licensing/quota, Krisp matching, output protocols, privacy, browser drafts, staging isolation, and deployment safety. Record a matrix for each proposed feature: EXISTS / PARTIAL / MISSING, with exact source/test evidence. Use local BULLY (Qwen3-Coder 30B) as a **read-only advisory reviewer** through `tools/qwen-supervised-audit.mjs` where appropriate. BULLY findings require direct source and test verification; avoid prior hallucinated findings. Baseline: run entire `npm test` suite and record pass/fail. Coordinate with SKYNET, do not modify concurrently edited files unexpectedly.

## Priority 1 — Operation IRONCLAD: generation resilience

1. Confirm existing quota reservation, commit/compensation, timeout, concurrency, payment entitlements and malformed-provider-response controls before making changes.
2. Identify and fix actual gaps in request idempotency, duplicate-click prevention, interrupted response/retry semantics, safe quota restoration, cancellation, error UX and backend generation status.
3. Distinguish *a provider actually generating twice* from *a user being charged quota twice*. Do not promise exact-once provider execution without durable evidence/implementation.
4. Preserve unsubmitted notes and drafts after errors. Never silently lose teacher input.
5. Acceptance: deterministic tests for same-request retries, concurrent requests, provider failures, late responses, process failures where simulatable, quota reservations and cleanup; browser test of retry UX. No double quota charge on safe retry; no unsafe refund of a committed generation.

## Priority 2 — output/protocol validation

Audit seven protocols: MA Classic, MS Sugarcoat, FAIRY, BLITZ, BEIDA, OF, PREPLY. Validate only evidence-backed structural requirements and server-controlled constraints. Preserve distinctive formats and legitimate variation. Do not hallucinate content or reject valid reports with brittle hardcoded string checks. Add useful tests for malformed output, missing required sections, overly long or wrong-protocol responses, and recovery behavior. Do not mutate scoring rules.

## Priority 3 — Krisp reliability

Preserve the invariant: ARM KRISP stays armed and auto-matches new incoming transcripts until explicitly DISARMED. Stable license identity remains the key, not an ephemeral webhook token. Audit duplicate delivery, late arrival, matching ambiguity, queue retry, disconnect/regenerate, content isolation and failure/status messages. Add only missing regression coverage.

## Priority 4 — quality evaluation

Propose a privacy-safe evaluation harness based on the anonymized `A:\Pathfinder Dataset` only if explicitly authorized to access that separate project. Gold examples require human review, not model self-certification. Metrics: factual faithfulness, invented claims, correct tone, required format, completeness and actionable improvement. No raw identifiable student transcripts in logs, commits or AI audit traces.

## Priority 5 — UX & performance

Assess slow/failed states, keyboard/screen-reader behavior, meaningful focus management, mobile/desktop overflow, lazy loading and bundle/runtime cost. Keep normal font sizes and V2's current colors. No global zoom trick. Keep the ACCESS modal and permanent master owner sign-in functional.

## Priority 6 — draft/history privacy

Existing policy: draft inputs saved in browser, **generated reports are not stored**. Do not silently introduce report history, server report storage, or deceptive privacy copy. If opt-in local encrypted history is desirable, first produce a threat model, storage/deletion design, browser limitations and approval request; do not implement without explicit approval.

## Priority 7 — observability

Design minimal sanitized health indicators: generation success/failure + latency, quota reservation errors, email delivery, signed payment webhook, Krisp processing. Redact access keys, email addresses when feasible, customer/student text, transcripts, secrets and token-bearing URLs. Separate safe operator dashboards from user-facing content.

## Priority 8 — staging and deployment guardrails

Current real-world blockers: Vercel staging authorization, Resend/test-email confirmation, Lemon Squeezy TEST MODE secrets and signed hosted webhook testing. Do not bypass SSO, deploy, make real transactions or alter provider settings without explicit owner approval. Introduce reviewable staging checks and rollback gates; maintain isolation.

## Deferred candidates

Offline-friendly draft editing; opt-in local history; accessibility refinements; performance optimization after measurements.

## Delivery contract

- Stage A: hand off a ranked **gap audit** with exact source/test evidence, current safeguards already in place, risk/effort estimates and smallest safe implementation slices.
- Stage B: implement **first independently confirmed high-impact IRONCLAD gap only**, with targeted tests. Don't overengineer or change business rules.
- Stage C: full `npm test` + Chrome desktop/mobile QA + git diff check + review of local `[local owner alias intentionally omitted]` owner route and all seven protocols.
- Stage D: commit local reviewed changes on `pathfinder-v2`, record SHA, evidence, known limitations and next recommended slice. **No deployment without explicit approval.**

## Responsibilities

CODEX: code gap audit, measured implementation, regression tests and handoff.
BULLY: read-only skeptical code review and edge-case proposals, no unverified claims.
SKYNET: prioritize, adjudicate findings, independent verification and release decision.

**Success is empirical reliability, not an impressive list of features.**
