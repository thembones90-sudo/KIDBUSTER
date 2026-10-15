# PATHFINDER V2 — Operation IRONCLAD Gap Audit

Date: 2026-10-13  
Branch: `pathfinder-v2`  
Scope: evidence review before the first IRONCLAD implementation slice

## Baseline

- Starting commit for this execution: `6856934`.
- Full baseline: 34/34 test files passed with `npm test` before implementation.
- Production, real customer records, provider credentials, and deployment were not touched.
- BULLY/Qwen3-Coder 30B ran twice as a read-only reviewer. Its quota-race, recovery-enumeration, and Krisp-replay claims contradicted current source/tests and were rejected. The raw advisory artifacts are retained under `artifacts/qwen-audits/`; they are evidence, not accepted findings.

## Ranked evidence matrix

| Rank | Proposed safeguard | State before Stage B | Source/test evidence | Confirmed gap and smallest safe slice | Risk / effort |
|---:|---|---|---|---|---|
| 1 | Same-request identity and duplicate suppression | MISSING | `api/generate.js` reserved quota for every accepted HTTP call; `index.html` sent no request identity. Atomic quota coverage existed in `tests/test-atomic-generation-quota.cjs`, but no same-request replay case existed. | Add an opaque per-attempt ID, atomic running/completed markers, safe release on known failures, deterministic 409 states, and regression coverage. | High / medium |
| 2 | Atomic bounded quota reservation | EXISTS | `reserveGeneration` and KV Lua reservation primitives; concurrent limit tests in `tests/test-atomic-generation-quota.cjs`. | No change. BULLY's claimed read/increment race was inconsistent with current code. | High / done |
| 3 | Quota compensation on provider failure/malformed response | EXISTS | `api/generate.js` releases reservations on network, non-OK, malformed and empty responses; regression cases in `tests/test-atomic-generation-quota.cjs`. | No change. | High / done |
| 4 | Interrupted-worker quota recovery | EXISTS | Opaque 15-minute reservation holds and expired-hold sweep in `api/_lib/kv-client.js`; expiry tests in `tests/test-atomic-generation-quota.cjs`. | No change in this slice. | High / done |
| 5 | Lost successful response recovery | PARTIAL | A committed generation cannot be safely refunded; generated reports are intentionally not stored (IRONCLAD Priority 6 and current privacy copy). | Duplicate replay is blocked, but content cannot be replayed. A future solution needs explicit approval and a privacy/storage threat model. | High / high |
| 6 | Cancellation and provider timeout | PARTIAL | Browser exposes a waiting state; server/provider call has failure compensation, but no end-to-end cancellation/status protocol was found. | Defer to a separate slice: define timeout, cancellation ownership, late-response behavior, and deterministic tests before editing. | Medium / high |
| 7 | Error UX and draft preservation | PARTIAL | Failed generation paths do not clear lesson fields; generic 409 copy did not explain duplicate state. | Add explicit in-progress/completed messages that state notes remain available; verify in Chrome. | Medium / low |
| 8 | Seven protocol preservation/server-owned prompts | EXISTS | `tests/test-server-controlled-generation.cjs` checks MA, MS, FAIRY, BLITZ, BEIDA, OF, PREPLY and rejects client-supplied prompts. Protocol suites cover their distinct validators/themes. | Run full suite after every slice; no prompt or validator change. | High / done |
| 9 | Krisp persistent ARM and duplicate delivery handling | EXISTS | Krisp queue/replay coverage in `tests/test-krisp-queue-reliability.cjs` and related route tests. | BULLY's generic replay warning was already covered; revisit only with new evidence. | High / done |
| 10 | Verified license recovery/privacy | EXISTS | Mailbox verification, generic 202 responses, token expiry/single use and entitlement preservation are covered by license route/service tests and the 2026-10-12 decision record. | BULLY's enumeration claim described the retired direct-key flow, not current routes. | Critical / done |
| 11 | Payment lifecycle correctness | EXISTS/PARTIAL | Signed serialized webhooks, lifecycle tests, reconciliation preview/apply safeguards, and portal flow exist. Persistent owned staging Redis and Lemon Squeezy test-mode hosted verification remain external blockers. | No production/provider interaction in IRONCLAD. | High / external |
| 12 | Sanitized observability and deployment gates | PARTIAL | Errors omit report text and the repository documents staging isolation; no complete sanitized metrics dashboard exists. | Design separately after generation semantics stabilize. | Medium / medium |

## Stage B selected slice

Rank 1 was the first independently confirmed high-impact gap. The implementation intentionally stores only a keyed hash marker and random ownership token. It does not store teacher/student text or generated reports, does not alter Free/Pro rules, and does not modify any of the seven reporting protocols or Krisp ARM behavior.

## Known limitations after Stage B

1. Exact-once provider execution cannot be guaranteed across every crash boundary. A worker that dies after the provider succeeds but before completing the marker can leave the request blocked until marker expiry; after expiry, a retry may call the provider again.
2. Pathfinder cannot return a report whose successful HTTP response was lost because report bodies are not retained. It blocks duplicate quota/provider work when the completed marker is present rather than pretending recovery is possible.
3. Legacy callers that omit `x-generation-id` retain old behavior for compatibility. The current V2 browser always sends the identifier.
4. Real distributed Redis behavior for these new markers still requires the existing isolated nonproduction Redis staging gate before promotion.
