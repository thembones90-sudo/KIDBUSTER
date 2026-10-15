# PATHFINDER V2 — Supervised Qwen Audit

Date: 2026-10-12  
Branch: `pathfinder-v2`  
Model: local `qwen3-coder:30b` through Ollama

## Scope and controls

Qwen was used only as a subordinate, read-only reviewer for billing, identity security, protocol parity, test gaps, and the current UI diff. The repository-owned bridge in `tools/qwen-supervised-audit.mjs` exposes only bounded reads of task-specific allowlisted files, literal search, and a bounded UI diff. It exposes no shell, write, Git, network-provider, secret, deployment, or customer-data tool.

Every model claim was treated as untrusted until checked directly against source and tests. Qwen does not decide what is changed or committed.

## Results accepted

- No new code defect was accepted from these passes.
- The UI pass accurately summarized the already-present onboarding and accessibility changes, but did not identify a new regression.
- The protocol pass found no defect in the evidence it inspected. Independent regression coverage, rather than the model's opinion, is the basis for accepting protocol parity.

## Results rejected

- Qwen claimed the payment account lock was not held across subscription writes. This is false: `payment-webhook.js` awaits `applySubscriptionEvent(...)` inside the protected `try`, and releases the lock only in `finally`. The atomic webhook regression tests also exercise same-account concurrency, interrupted marker writes, retry, expiry, and token-safe release.
- Qwen claimed recovery enumeration and missing atomic quota behavior using code and identifiers that do not exist in the repository. The recovery routes return identical accepted responses for known and unknown valid emails and never return a key before a one-time token is consumed. Quota reservation is covered under concurrent load.
- Qwen claimed it had run tests during its UI review. It had no execution tool and therefore could not have done so. The bridge now explicitly forbids such claims during forced synthesis.
- The first protocol run exhausted its evidence-gathering rounds and one retry produced malformed Ollama tool markup. The bridge now switches to a tool-free synthesis call after a fixed ten-round evidence phase.

## Independent verification

The complete repository suite was run with local Chrome after the current UI work: **33/33 test files passed**. This includes verified signup/recovery, non-enumeration, one-time and expired tokens, rate limiting, provider fail-closed behavior, preservation of paid identity and usage, atomic generation quota, checkout ownership, billing lifecycle and recovery, webhook concurrency, Krisp isolation/retry, browser smoke coverage, and all seven report protocols: MA, MS, FAIRY, BLITZ, BEIDA, OF, and PREPLY.

The audit bridge has its own regression test confirming the restricted tool surface, allowlisted and bounded file access, repository-local artifact location, and tool-free final synthesis rule.

## Remaining external work

- Real email delivery requires deliberately configured non-production provider credentials and an end-to-end mailbox test. Tests use an isolated in-memory email transport.
- Live Lemon Squeezy webhook and reconciliation validation requires sandbox credentials and signed sandbox events. No production credential or customer record was accessed.
- Qwen output remains advisory. Local models can hallucinate source details and execution; Codex must continue independently verifying every proposed change.

Raw model transcripts are stored under `artifacts/qwen-audits/` for traceability. They are evidence of model behavior, not proof of application correctness.

## 9B comparison run

The identical test-gap assignment was also run with local `qwen3.5:9b`. It completed faster than the 30B model, but ignored most of the requested scope, reviewed only Krisp, mislabeled optional metadata as required, overlooked the explicit meeting/event identity check immediately above its quoted code, overlooked token validation, and ended mid-finding because it exhausted its answer budget. Its rate-limiting observation is a possible defense-in-depth hypothesis, not a demonstrated vulnerability: the webhook requires an opaque account token, serializes mutations, bounds queues, and deduplicates deliveries.

For this task, 9B was less useful than 30B. It is suitable for cheap first-pass summaries and narrow searches, but not for security conclusions or unsupervised changes.

## Big Pickle comparison run

With explicit user approval, the same test-gap assignment and the same twelve-file allowlist were sent to the hosted `opencode/big-pickle` model through OpenCode's read-only plan profile. No environment file, credential, secret, customer record, or deployment access was included.

Big Pickle produced substantially better source-grounded analysis than either local Qwen model. It correctly identified that the disarmed Krisp pending path could duplicate a transcript after a partial write: the pending queue was persisted before `lastReceivedAt` and the dedupe marker, but unlike the armed queue it did not check whether a retry's identity already existed. A new injected-failure regression reproduced the 500/retry sequence, and the pending branch now repairs that partial commit without inserting a second copy. The focused test and complete 34-file suite pass.

Its observation that quota compensation can itself fail during a KV outage is valid as a residual durability limitation, but safely solving that requires a durable reservation/compensation design rather than a superficial retry. Its zero-TTL lock observation does not affect current callers, which use fixed positive TTLs. Remaining proposals are candidates for independent prioritization, not accepted defects.
