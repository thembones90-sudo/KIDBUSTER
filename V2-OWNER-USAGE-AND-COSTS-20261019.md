# PATHFINDER V2 — Owner Usage & Costs (2026-10-19)

## Status
Prepared on the isolated Git feature branch `feature/owner-usage-costs-20261019`; no production or staging deployment performed. Developed by Claude Code (backend) with Skynet (owner UI, integration, final accounting/tests). The existing uncommitted RADAR VAN, appearance and unrelated layout work was preserved.

## UX
Account > Owner tools > **Application statistics** (nested collapsible, closed by default). Three headline statistics:
1. Reports delivered (successfully finalized, all license plans)
2. Known estimated API spend (all provider calls including unsuccessful attempts and formatting repairs)
3. Known estimated API cost per delivered report.

All-time/This-month selector; Refresh button. Seven fixed protocol rows: protocol, delivered reports, estimated API spend (including tracked failed attempts). Uses existing theme tokens; UI only fetches when opened; data rendered via textContent; mobile 320px test. No analytics dashboard elsewhere.

## Accounting contract
- Server counts report **after quota reservation commit** and immediately before 200. Owner/founder and Pro included even though their quotas are not counted.
- Spending based on provider-reported token usage at public Anthropic API list rates in `api/_lib/haiku-provider.js`; each generation and repair call estimated separately, including cache reads/writes and output thinking tokens. **An estimate is not an invoice.** No taxes, credits or billing reconciliation.
- Failed, truncated, refused, noncompliant, repair, and duplicate-provider calls contribute to the API-spend estimates if their usage is known; unknown usage or unpriced model produces a counted unknown-cost call, not a fabricated $0.
- All monetary arithmetic stored as integer nano-USD. `allModelCalls.knownNanoUsd` equals the sum of `byProtocol[code].apiSpend.knownNanoUsd` for counted known calls.
- Never backfill from expired telemetry (180-day TTL), browser-local counters, quota usage or marketing page views. `baseline.firstRecordedAt` is taken from the first successful datastore write, with a null baseline when still empty.
- Stats telemetry is best-effort with bounded waiting and cannot block a customer's report. A backend crash or unavailable datastore can cause undercount; reported totals should be treated as **tracked lower bounds**, not a financial invoice. No live historical total is claimed.

## Backend and API
- `api/_lib/usage-stats.js`: cost accounting, idempotent plans, owner snapshots.
- `api/_lib/kv-client.js`: single Redis Lua update of lifetime/month/day hashes and hashed idempotency markers, memory/local test counterparts. Lifetime/month hashes permanent; day retention 400 days; run/report dedup markers 30 days.
- `api/generate.js`: records provider-call attempts and successful deliveries.
- `api/admin-license-lookup.js`: owner-only `GET /api/admin-license-lookup?action=usage-stats`, x-app-key required. No new serverless endpoint. Returns `Cache-Control: no-store`.
- Browser: `assets/owner-usage-stats.js`, `assets/owner-usage-stats.css`, two references inserted into `index.html`.
- No PII or raw keys stored in the stats hashes: only safe, fixed protocol identifiers and numeric counters. Dedup keys are SHA-256 digests.

## Verification
- `tests/test-usage-stats-backend.cjs`: all 78 assertions passed (incl. pricing, 7 protocols, Free/Pro/Owner, retries, repairs, failures, concurrent updates, owner auth, PII).
- `tests/test-owner-usage-ui.cjs`: all 9 browser assertions passed (collapsed panel, 3 KPIs, owner auth, period change, 7 rows, *visible* narrow 320px layout).
- **Isolated feature-branch `npm test`: all 86 test files PASS** after correcting the statistics controls to the existing 44px minimum. Full log preserved locally as `usage-full-test-final.log` in the isolated worktree (not committed). A previous run against the separate dirty RADAR VAN/appearance working tree had 3 unrelated failures and is not evidence about this clean feature branch. `test-live-smoke.cjs` skips real deployment tests by design.
- The Redis Lua implementation still needs validation against **isolated, nonproduction** Redis with explicit confirmation of safe connection. Local memory and file stores are covered.
- Before Preview deploy, check integration with ongoing RADAR VAN/appearance changes, owner authentication, and end-to-end counters. No production rollout without owner approval.
