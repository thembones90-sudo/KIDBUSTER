# Redis command audit — 2026-10-29 (P0 quota incident)

Branch `incident/redis-command-audit-20261029`, built on Codex hotfix `7dfb0dc`
(kept intact: 15 s cadence and no-op queue write both remain). Not deployed.

## Evidence classes

- **Measured (test harness):** commands per request counted by wrapping the
  in-memory KV used by the real handlers, run against the original (`5e57d19`),
  the hotfix (`7dfb0dc`) and this branch. The harness counts the lock release as
  GET+DEL; production does it in one EVAL, so production = harness − 1 whenever
  the lock is taken.
- **Measured (production, Upstash console):** 706,913 commands, 458,994 reads,
  247,919 writes (35% writes). Nothing per-route: Vercel per-route invocation
  counts need Observability Plus (HTTP 402 on this team's plan).
- **Theoretical:** every daily/monthly projection below. They assume a tab
  is visible and get no help from browser background-timer throttling.

## Findings, ranked

| # | Component | Cause | Cost | Risk |
|---|---|---|---|---|
| 1 | `index.html` Krisp poll (`ensurePolling` / `refreshKrispSession`) | `setInterval` with no hidden-tab pause, no backoff, no single-flight; ran whether or not Krisp was armed | 720 polls/h (orig) / 240 polls/h (hotfix) per open tab | **Critical** — the dominant idle consumer |
| 2 | `api/krisp-session.js` GET | Every poll: license GET, token-mapping GET, lock SET NX, GETDEL legacy slot, queue GET, queue DEL (orig only), pending GET, lock EVAL, waiting GET, lastReceived GET | 10 (orig) / 9 (hotfix) per idle poll, 10–11 with pending items | **Critical** |
| 3 | Lock on a read-only path | Mutation lock taken on every poll even when there was nothing to lease | 2 of the 9 commands | High (pure overhead) |
| 4 | Owner event log `readEvents` | One sequential GET per event (up to 300 per owner-panel open, 2,000 in the daily cron) | Hundreds per open; owner-only | Low |
| 5 | Daily cron `runDailyTasks` | SCAN of whole keyspace + GET per license | ≈ keys/500 + licenses, once a day | Low |
| 6 | Scout (radar-van) | Already efficient: hidden-tab stop, 15 s/60 s cadence, backoff, version peek = 1 GET; owner-only | ≈ 1 cmd/poll, ~7 per 5-min full refresh | Low |
| 7 | Krisp webhook / lease / ack | ≈ 11 / 12 / 10 commands per event | ~35 per lesson | Low (event-driven) |

The production ratio supports #1–#2 without proving them: an original idle poll
is about 40% writes (SET NX, GETDEL, DEL, EVAL out of 10), the hotfix about 33%,
and production shows 35%. At 10 commands per poll every 5 s, 706,913 commands
is about 98 tab-hours, e.g. one tab open about 3.3 h a day for a month.

**The Codex hotfix alone does not fit the free tier.** One teacher, 8 h/day,
30 days at 9 commands per 15 s = 518,400 commands > 500,000.

## Changes on this branch (smallest safe set)

1. **Server idle fast path** (`api/krisp-session.js`): one `MGET` reads license,
   token mapping, legacy slot, matched queue, pending, waiting flag and last
   receipt. If the matched queue is empty and there is no legacy slot, it
   responds without a lock and without writes. Anything in the matched queue
   (leased, unleased or expired) takes the **unchanged** locked path, so
   leasing, redelivery limits, pruning and legacy migration behave as before.
   `verify=1` keeps the full repair path. Pending bodies cost one extra MGET only
   when pending holds new-format records.
2. **Entitlement without a second read** (`krisp-retention.js`):
   `isLicenseEntitledToKrisp` uses the same rules as `isEntitledToKrisp`, applied to
   the licence record from the MGET.
3. **Client tick** (`index.html`): a free 15 s tick that sends a request only when:
   the tab is visible; Krisp is armed (every tick) or not armed (every 4th tick =
   60 s, since unarmed transcripts can only land in Pending); and after ≥2
   consecutive failures, backoff of 30/60/120 s (capped). Overlapping ticks share
   one in-flight request. Becoming visible refreshes immediately.
4. Test doubles gained `mget` (one call = one counted command).

Not changed: retention periods, locks on mutating paths, webhook, tokens,
Scout, ack/lease semantics, data layout. No migration.

## Consumption (commands)

Per poll, production: original 10, hotfix 9, branch 1 (2 with pending items).
Branch idle cadence: visible+armed 240/h, visible+unarmed 60/h, hidden 0.

| Scenario | Original (5 s) | Hotfix (15 s) | Branch (armed, visible) |
|---|---|---|---|
| 1 teacher, 8 h/day | 57,600/day · 1.73 M/mo | 17,280/day · 518 k/mo | 1,920/day · 57.6 k/mo |
| 1 teacher, tab open 24 h (visible) | 172,800/day · 5.18 M/mo | 51,840/day · 1.56 M/mo | 5,760/day · 173 k/mo |
| 1 teacher, open 24 h, visible 8 h | same as above | same as above | 1,920/day (hidden = 0) |
| 5 teachers, 8 h/day | 288 k/day · 8.64 M/mo | 86.4 k/day · 2.59 M/mo | 9,600/day · 288 k/mo |
| 10 teachers, 8 h/day | 576 k/day · 17.3 M/mo | 173 k/day · 5.18 M/mo | 19,200/day · 576 k/mo |

Add about 35 commands per delivered lesson, plus generation and licence traffic.
Those depend on events, not idle time.

Monthly cost at $0.20 / 100k (pay-as-you-go, ignoring the free 500k):
10 teachers × 8 h → original ≈ $34.56, hotfix ≈ $10.37, branch ≈ $1.15.
Ten full-time armed teachers on the branch still exceed the Free tier
(576 k). Move to pay-as-you-go before roughly 8 full-time teachers. The
expected bill is a few dollars a month.

## Monitoring proposal (no new Redis load)

1. Daily cron (already exists) calls the Upstash management API for the month's
   command count (0 Redis commands). It projects end-of-month usage as
   used ÷ day-of-month × days-in-month and calls `alertOwner` at 50/75/90% of the
   allowance, plus a day-over-day spike alert at >3× the 7-day median.
   Needs an Upstash API key in env (owner action).
2. Per-route attribution: wrap the KV client to count commands per invocation
   in memory and emit one structured log line (`kv_cmds route=… n=…`) per
   request. Zero Redis cost. Needs a log drain or Observability Plus for
   retention beyond 1 h.
3. Runaway guard: the server can return `pollAfterMs` (client honours it), so
   cadence can be slowed without a deploy of the client. Proposed, not built.

## Remaining risks

- Two **visible** windows of the same account each poll (hidden tabs don't).
  A BroadcastChannel leader tab would remove the duplicate.
- While a transcript sits leased and unacknowledged (≤45 s normally, ≤15 min
  worst case), polls take the locked path (≈12 commands).
- Upstash billing of EVAL and MGET as one command each is assumed from its
  per-command pricing model; confirm in the console after deploy.
- No production per-route measurement exists; attribution is inferred.

## Tests

New: `tests/test-redis-command-budget.cjs` (28 checks: idle cost, delivery
during polling, concurrent tabs, lease/ack/retry, delayed transcripts, isolation,
10 simultaneous users, expiry, legacy migration, entitlement, verify repair,
outage/recovery, daily budget) and `tests/test-krisp-adaptive-polling.cjs`
(browser: unarmed cadence, armed cadence, hidden tab, delivery on return + ack,
backoff pattern, recovery, single flight, duplicate hidden tab).
Updated: `tests/test-krisp-command-budget.cjs` now asserts the tick at 15 s and
forbids direct or 5 s polling (stricter than before).
