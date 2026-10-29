# Redis quota incident: audit and proposed patch

Audit baseline: `7dfb0dc`, including the existing five-to-fifteen-second hotfix, descended from live Scout1.4.10-compatible `7d1938d`. Isolated branch: `codex/redis-quota-audit-20261029`. This initial section was written before implementation.

## Findings

The supplied incident totals (706,913 commands;458,994 reads;247,919 writes against500,000 allowed) establish command exhaustion, not storage exhaustion. They do not establish traffic attribution. No production records, secrets, billing, recordings or licenses were accessed or changed for this investigation.

| Priority | Source / function | Mechanism and command cost | Risk |
|---|---|---|---|
| 1 | `index.html`, `ensurePolling`, `refreshKrispSession` | Original5s interval; hotfix15s. No visibility gate, shared-tab budget, in-flight guard or outage backoff. Each regular Pro idle GET has9 outer Redis commands after hotfix,10 before it. Tabs multiply this. | High recurring volume |
| 2 | `api/krisp-session.js`, GET | License GET, token GET, lock SET NX EX, legacy GETDEL, matched GET, pending GET, unlock EVAL, waiting GET, last-received GET. Owner bypasses license GET. Original also DELeted empty matched queue each time; hotfix correctly removed that write. Nonempty new-content queues add MGET hydration; a new lease adds index SET and potentially legacy receipt SET. | Necessary correctness mixed with idle overhead |
| 3 | `api/_lib/krisp-token.js`, token lifecycle lock | Busy callers retry SET NX approximately every40ms for up to3s; about75 attempts per caller in severe contention. Ordinary established mappings cost one GET; verify/init reads more. | Burst amplification; retain lock |
| 4 | `assets/radar-van-client.js`, schedule/poll; `radar-van.js`, peekRadarVersion/readRadarSession | Scout already stops hidden polling, uses15s idle-workspace/60s busy-workspace cadence, backs off to120s, and skips disconnected/no-ACK sessions. Unchanged owner version peek is ONE GET (the handler's older MGET comment is stale). Periodic full refresh costs5 base GETs; bodies add hydration, delivery adds locks and writes. Pending content deliberately requires full reads for expiry. | Lower idle volume; only owner authorized |
| 5 | `api/license-status.js`, handler/buildTrialsObject | Subscription Pro: license GET + usage GET; Free adds six trial GETs. Manual claim verification can add immutable claim reads/writes; founder0. Browser account/generation refreshes are action-triggered, not the five-second loop. | Correctness critical; do not cache revocation away |
| 6 | `api/krisp-webhook.js`; Scout ingest; transcript-retention helpers | Webhook token/auth, dedupe GET, mutation locks, queues, body/index writes, last-received/dedupe SETs. Counts depend on queue state, scope and retries. Pipelines batch HTTP but retain each enclosed command. Queue reads hydrate body refs via MGET. Absolute PXAT deadlines must remain unchanged. | Event-driven necessary work; outage retries add load |
| 7 | `api/generate.js`; license-service reservations; usage-stats | Generation reserves/commits quota with atomic counters/holds and request markers; usage aggregates use atomic scripts. Recovery/reconciliation and provider retries have variable costs. These are not idle polls. | Never remove idempotency or counters to save commands |
| 8 | `api/_lib/feedback-store.js`; event-log; daily tasks | Feedback submission validates account, reads generation metadata, increments sequence and writes item. Lists read sequence then bounded batches of items; operational lists/scans and daily tasks scale with entries. Promise.all is concurrency, not command reduction. | Secondary volume; bound operational refreshes |
| 9 | Native `radar_van/sender.py` | Durable outbox delivery is event-driven with jittered retry steps and Retry-After handling. Status methods are local; HTTP delivery checks invoke authenticated server work. No desktop modification or recording interruption is needed for this patch. | Keep durable retries/confirmed-delivery cleanup |

## Proposed smallest safe changes

1. Preserve hotfix server logic unchanged. Gate Krisp scheduled reads while hidden; allow one in-flight refresh per tab/account.
2. Keep15s automatic discovery while armed; use60s when disarmed and empty or pending. Opening the inbox remains an immediate explicit refresh. Recover visible tabs immediately. Back off failures15/30/60/120s (disarmed60/120s), capped120s.
3. Coordinate scheduled Krisp reads across visible same-account tabs using Web Locks and an account-hashed, timestamp-only localStorage deadline. Never share credentials/transcript bodies over a channel or localStorage. Explicit user refreshes remain authoritative. Missing coordination APIs fall back to bounded independent polling, not missing deliveries.
4. Add offline command-boundary measurements, scheduler tests, and a process-local monitoring plan. Do not rewrite queue storage, cache entitlements, remove locks or change retention in this incident patch.

Hidden tabs will discover queued arrivals on return; the webhook continues accepting and storing them. Foreground armed discovery stays at most15s plus request/processing time when healthy; disarmed discovery at most60s. Lost leases retain existing45s expiry/ACK retry behavior. Outage recovery may take up to120s unless user explicitly refreshes. No architecture guarantees delivery while Redis rejects requests.

## Expected idle polling envelope (theoretical, before measurement)

30 days/month, one tab/account, established subscription Pro, empty queues, no errors or manual actions; costs exclude all event-driven work. Original10 commands/5s; hotfix9/15s; optimized disarmed9/60s. Armed optimized cost stays hotfix cost, intentionally preserving delivery latency.

| Scenario | Original commands / cost | Hotfix commands / cost | Optimized disarmed commands / cost |
|---|---:|---:|---:|
| One teacher8h/day |1,728,000 /$3.456 |518,400 /$1.037 |129,600 /$0.259 |
| One teacher24h/day |5,184,000 /$10.368 |1,555,200 /$3.110 |388,800 /$0.778 |
| Five teachers8h/day each |8,640,000 /$17.280 |2,592,000 /$5.184 |648,000 /$1.296 |
| Ten teachers8h/day each |17,280,000 /$34.560 |5,184,000 /$10.368 |1,296,000 /$2.592 |

Formula: teachers × days × hours ×3600 / interval × commands/request. Five/ten24h cases are three times their8h rows. Fully hidden scheduled Krisp polls become0 after the current request finishes. Multiple tabs originally multiply costs; coordinated scheduled reads target one account budget. Cold starts/manual actions still cost extra. Owner polls use8 rather than9 commands. Scout's15s version-only floor is57,600 commands/month at8h/day or172,800 at24h/day, plus full-refresh/event overhead; Scout is owner-only, so do not multiply it across customer accounts.

These are outer command counts, not verified provider invoices. Subsequent primary-source research confirmed that [Upstash's command-cost accounting](https://upstash.com/docs/redis/sdks/ratelimit-ts/costs) includes EVAL **and** its internal commands: their fixed-window example counts EVAL+INCR+PEXPIRE as three commands. The unlock script here performs GET and, on a successful release, DEL. Use the following **provider-style logical budget**, rather than the lower outer-command prices above, for capacity planning. No production bill was measured.

| Scenario | Original12/5s | Hotfix11/15s | Optimized disarmed11/60s |
|---|---:|---:|---:|
| One teacher8h/day |2,073,600 /$4.147 |633,600 /$1.267 |158,400 /$0.317 |
| One teacher24h/day |6,220,800 /$12.442 |1,900,800 /$3.802 |475,200 /$0.950 |
| Five teachers8h/day each |10,368,000 /$20.736 |3,168,000 /$6.336 |792,000 /$1.584 |
| Ten teachers8h/day each |20,736,000 /$41.472 |6,336,000 /$12.672 |1,584,000 /$3.168 |
| Five teachers24h/day each |31,104,000 /$62.208 |9,504,000 /$19.008 |2,376,000 /$4.752 |
| Ten teachers24h/day each |62,208,000 /$124.416 |19,008,000 /$38.016 |4,752,000 /$9.504 |

Armed optimized usage equals the hotfix column. Persistent ARM is deliberately preserved, so do not advertise the disarmed savings for teachers who stay armed. Fully hidden scheduled usage is zero; real usage lies between these envelopes according to visibility, armed time, body hydration and user actions. One continuously visible armed Pro teacher at8h/day already exceeds the Free allowance before any reports or webhooks. A90% reduction for disarmed polling versus original is not a90% reduction of the entire production database.

Never equate HTTP requests with billed Redis commands or claim a production attribution percentage from these fixtures. Network retries after server acceptance may execute a command more than once; contention and body counts add further costs. Read replicas would add write replication costs; these tables assume the supplied single-region deployment.

## Monitoring and prevention proposal

Use structured process logs with route, feature, command name, count, duration, HTTP outcome and retry count; no command arguments, keys, account IDs, tokens, emails or transcript content. Export aggregate logs outside Redis. Count each SDK command/pipeline entry, distinguish EVAL from nested logical operations, and reconcile daily against the provider total. This patch does not introduce per-poll Redis telemetry writes.

Operator dashboard: daily consumption by route/feature,7-day trend, month-to-date total, projected month-end total, and spike alarm at2× recent comparable hour. Alert at50/70/85/95% of the configured allowance and at projected exhaustion within7days. Use external log alerts/provider dashboard; owner must configure recipients and any paid monitoring separately. Browser safeguards prevent overlap, hidden work and unbounded outage retries; they are not a global protection against arbitrary clients, bots or many legitimate armed teachers. A sustainable provider command budget with headroom and operational alerts remains necessary. No license/auth fail-open bypass is proposed.

[Upstash pricing](https://upstash.com/pricing/redis) documents500,000 Free commands and$0.20/100,000 PAYG commands. The costs above price all commands at the requested rate; they do not subtract a free allowance on paid plans. [Provider metrics](https://upstash.com/docs/redis/howto/metrics-and-charts) support comparison with dashboard totals. [Atomic Lua operations](https://upstash.com/blog/lua-scripting-on-upstash-redis-atomic-operations-over-http) explain why batching alone cannot replace mutation locks. Do not run production MONITOR: command arguments can disclose private content and credentials.

## Release decision before implementation

NO-GO for immediate production promotion: optimization does not restore an exhausted monthly allowance. Owner must independently restore capacity by an authorized plan action or reset; this task does not authorize billing changes. Implement and verify offline first, then run a bounded staged/live check once datastore health permits. Preserve live release lineage and1.4.10 compatibility. Detailed verification and exact release steps will be appended after testing.

## Additional source findings after measurement

* `api/_lib/kv-client.js`, `STATS_LUA`/`applyUsageStatsPlan`: one outer EVAL can hide substantial telemetry amplification. `buildUsageStatsPlan` for one successful known-cost MA report emits11 nonzero field updates across three hashes, two SET NX idempotency markers, baseline HSETNX and daily EXPIRE: **38 logical commands including EVAL**, not one. Repairs/unknown usage/duplicates vary. Preserve correctness; do not replace atomic accounting during the incident. Priority for a separate measured telemetry redesign, using external aggregate logs for new command monitoring.
* `event-log.js`, `recordEvent`:2 commands/event (INCR+SET),3 for the first event/day including EXPIRE. The2,000/day storage cap still pays INCR for later calls. An owner list costs up to one GET per visited day plus one GET per scanned item; type filtering may scan many entries before reaching its result limit. Do not refresh operational lists continuously. `daily-tasks.js` performs a SCAN loop and up to20,000 license GETs plus alert/event work once/day; it is not free simply because it is background maintenance.
* `radar-van.js`, `withLock`: up to roughly101 SET NX attempts in2.5s at25ms under severe contention, per lock/caller. Normal empty Scout reads avoid those locks. `radar-van-ingest-handler.js` authenticates token/settings and increments an atomic rate counter even for credential checks, before reading the requested profile. These checks are not zero-cost.
* Installed SDK `@upstash/redis/chunk-2X4SLXT7.mjs`: transport exceptions default to a loop of up to **six HTTP attempts** (`i <= retry.attempts`, default5), using exponential delays. Non-OK HTTP responses break the transport loop and are then rejected. An after-acceptance lost response can add repeated execution. The fixture measures healthy transport only; browser backoff reduces subsequent API requests, not retries inside an already-running API call. No SDK retry policy was changed globally because that could regress webhook/payment/generation reliability.
* Native Scout sender backoff is5/15/60/300/900s with jitter and Retry-After. The paired-owner credential check is triggered by connection/repair flows; queued lesson retries remain durable. Native source inspection is not a claim of having measured its production traffic.

## Implemented scope

Only the Krisp browser discovery path changes. `assets/krisp-poll-budget.js` adds visibility/cadence/backoff and Web Locks coordination. `index.html` adds single-flight reads,20s abortable refresh/init requests, account reset/sign-out cleanup, immediate visibility-return refresh, and authenticated initialization retries after startup outages. Initial verification failures keep the integration hidden until a successful verification; no entitlement is cached or bypassed.

No backend API, queue body/index format, distributed lock, webhook endpoint, retention deadline, license/account record, Scout asset or executable was modified. The hotfix's no-op queue-write guard is preserved exactly. All new shared browser state consists of SHA-256 account scope plus a numeric deadline; transcript content and raw credentials are never broadcast or stored by this scheduler. Storage/Web Locks/crypto failure falls back to independent bounded polling. Coordination is advisory efficiency, never a security boundary. Separate browser profiles/devices cannot share that budget and still multiply traffic.

Scheduled followers use the leader's shared deadline, but explicitly opening an inbox or returning to a tab fetches its own authenticated view. A closed leader cannot strand polling beyond the remaining discovery deadline (15s armed/60s disarmed;120s after outage), and a stale/future timestamp is bounded. Server lease/ACK logic remains the final authority for all concurrent consumers. A leader's HTTP timeout releases its lock; the server may still finish work after cancellation, so existing leases/deduplication remain essential.

SSE/WebSocket/push is a later architecture option: notify browsers only that an account inbox changed, then fetch through the current authenticated API. Use an external managed event channel with account-scoped authorization, reconnect cursors and periodic fallback. Redis-backed long polling simply moves the loop to the server; adding Pub/Sub alone supplies neither durable replay nor a reliable disconnected-client inbox. Do not replace webhook durability or45s delivery leases with ephemeral browser notifications.

## Offline evidence

`tools/redis-command-fixture.mjs` uses the actual production Redis SDK and real handlers with a wholly intercepted fetch transport, synthetic `.invalid` endpoint/token and synthetic records. It runs in a separate process so the in-memory test adapter cannot hide production EVAL/pipeline calls. It cannot contact any network destination. Measured:

| Fixture | Measured outer commands | Derived provider-style commands |
|---|---:|---:|
| Empty established Pro Krisp GET |9 |11 (successful unlock GET+DEL) |
| Same GET, one new pending body |10 |12 (one MGET hydration) |
| Subscription Pro license-status |2 |2 |
| Free license-status, six protocol trials |8 |8 |
| Unchanged authorized-owner Scout version |1 |1 |
| Scout full empty view, no leasing |5 |5 |
| One successful known-cost report telemetry plan |No EVAL executed; plan inspected |38, source-derived |

The original10-outer/12-logical empty poll is source-derived from its additional unconditional DEL, not a fresh production measurement. Queue length, migration, leases, pending body expiry, manual license activation, generation reservations, provider retry and event logging prevent a single honest flat cost for all requests. Use the fixture as a reproducible regression budget, not an invoice emulator.

Tests retain the original15s minimum armed heartbeat assertion and the unchanged-queue-write assertion. The existing inbox browser test now advances a synthetic clock through cooldowns, preserving every arrival/error/layout assertion and adding initial-outage recovery. New scheduler tests cover cadence, hidden state, resume, overlap, backoff/recovery, simultaneous account scopes, disabled state, fallback and content-free shared state. A real headless-browser test exercises actual Web Locks/localStorage across two pages, sequential/concurrent contention, closed-leader takeover and account changes. Existing backend suites supply concurrent webhook delivery, delayed/lost ACK retries, dedupe, defer, absolute expiry, tenant isolation and Scout compatibility coverage.

An initial sandboxed browser launch could not connect to its localhost DevTools port (EACCES). It was not counted as a passing check. Running the isolated headless suite with localhost access resolved that environment limitation; no interactive desktop or Scout session was controlled.

## Deployment runbook and decision gates

1. Preserve current live rollback `dpl_FqL6PuiuLSYo21nm3jazEW6UYxP9` and hotfix `7dfb0dc`. Have the owner verify provider capacity is restored; no repeated synthetic probes against an exhausted production store.
2. Fetch the canonical release branch and current live runtime metadata. In the release checkout, verify live `7d1938d` is an ancestor, then merge this audited branch (which already contains `7dfb0dc`). If concurrent releases exist, integrate and retest; do not deploy this side branch directly or cherry-pick the hotfix twice. Use `git merge-base --is-ancestor 7dfb0dc HEAD` and inspect `git log <live-runtime>..HEAD`.
3. Run `npm ci --ignore-scripts` and `npm test` on the exact integrated commit. Export that commit using `git archive` to `.v2-tmp/deploy-<sha>` and add the existing project linkage `.vercel/project.json` through the approved release tooling. Never deploy a dirty checkout or print environment credentials.
4. From the immutable export run `vercel deploy --prod --skip-domain`; **do not use the connector's create-deployment operation** (historically assigned live domains despite staging flags). This stages a production-environment candidate without changing `classbuster.com`.
5. Run `node tools/release/candidate-smoke.mjs <candidate>` plus existing migration/pairing/monitoring probes. When quota health permits, perform bounded authenticated owner/Pro account checks and one synthetic candidate-only webhook delivery → automatic browser discovery → notes/defer → ACK → no duplicate → expiry verification. Use synthetic accounts/records, never real customer webhook content. Verify Scout1.4.10 owner-only pairing/ingest/download compatibility. Record exact source and test results.
6. Promote only the verified candidate under the owner's release authorization. Verify `classbuster.com` and the legacy `kidbuster.vercel.app` API door, exact deployed assets, smoke probes, account plan, generation, inbox and current Scout download. Preserve the previous retention-aware deployment for rollback. No database rollback, purge or credential rotation.
7. Compare first-hour and next-day provider totals with external route counters; test one visible armed tab, disarmed tab, all hidden, two tabs, reconnect and outage recovery. Enable provider/external threshold alerts before wider usage. No new Redis-backed monitoring counters.

**Capacity decision:** NO-GO for production availability claims while the supplied monthly cap remains exhausted. No code optimization can retroactively uncount those commands. A verified isolated patch is suitable for staged release once capacity is restored. A promise that a finite Free quota can never be exhausted is not supportable; usage headroom, external alerts and an owner-approved sustainable plan are required. Billing changes remain outside this authorization.

## Final verification result

* `npm ci --ignore-scripts --offline`:136 packages installed from cache; audit reported0 vulnerabilities.
* Initial full regression:127/127 test files passed.
* Final full regression: **128/128 test files passed**, exit0, including real-browser multi-tab tests, the real-page startup-outage recovery assertion and all SDK command fixtures.
* Standalone SDK fixture:9/10 outer Krisp commands,2/8 license-status commands,1/5 Scout version/full-view commands; telemetry plan38 logical operations. Zero production requests.
* `git diff --check`: clean. Backend runtime files and Scout assets are unchanged relative to `7dfb0dc`; existing125 test files remain, plus three new test files. The existing timing assertion was updated to recognize the budgeted15s heartbeat; no assertion was removed or relaxed.
* No production deployment, API write, database change, billing action or desktop recording interruption occurred. Production capacity, provider invoice reconciliation, external alert provisioning and authenticated staged end-to-end checks remain operational gates, not claimed passes.

**Code decision: GO for review/staging of this isolated patch. Production decision: NO-GO until capacity restoration and the runbook's verified candidate checks are complete.**
