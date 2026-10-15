# PATHFINDER V2 — Development Clone

**Status:** isolated working copy, NOT official production.
**Source:** `thembones90-sudo/KIDBUSTER`, branch `pathfinder-v2`.
**Local working copy:** `A:\PATHFINDER V2`
**Baseline:** `441d0c1d63136eb83f4b6b73156fc32fd6f0b8d3`.
**Official site (do not modify during V2 work):** https://kidbuster.vercel.app/

## Release boundaries

1. Never merge or push V2 code into `main` during development.
2. Never deploy V2 to the official Vercel project `kidbuster` or assign `kidbuster.vercel.app` to V2.
3. Never copy production API keys, owner keys, customer licenses, Redis/KV credentials, payment credentials, or Krisp webhook tokens to V2.
4. Do not register real Krisp integrations, send real payment requests, or invoke live customer data from the clone. Test with dedicated non-production credentials and synthetic records only.
5. Stand up a **separate, access-protected Vercel project**, separate datastore, separate webhook URLs, and separate environment variables before enabling V2 backend integrations. Until this exists, only local/source-level tests are authorized.
6. The existing persistent Krisp ARM toggle, stable license-keyed transcript data, seven protocols, per-protocol theme colors, and nested Generate button label are regression-critical behavior.
7. Keep protocol versions immutable and use real lesson evidence before changing judgment rules, per `PATHFINDER-constitution.md`.
8. Production promotion requires reviewed diff, passing tests, realistic workflow checks, security review, rollback plan and explicit approval. Never equate a build passing with a production release.

## Commercial and product master plan

The four current V2 objectives are now tracked together in `V2-MASTER-PLAN.md`: security and core reliability; visual redesign and UX; automatic subscription payments; and customer acquisition toward 100+ weekly active teachers and 100 paid subscribers. Workstreams overlap, but real payment activation and safe account recovery are release blockers.

## Planned development phases

### Phase 0 — Clone and audit baseline
- [x] Clone the exact production Git revision to A:, without secrets.
- [x] Create a separate GitHub development branch.
- [x] Pin local Git pushes to the development branch.
- [x] Confirm a clean baseline test run in the new checkout (2026-10-12: 19/19 test files passed, including Chromium browser smoke).
- [x] Create separate SSO-protected Vercel project `pathfinder-v2-staging` (2026-10-12), with no Git connection or deployment; independent Redis and payment test credentials remain outstanding.

### Phase 1 — Identity and security
- Secure signup and recovery with verified email ownership; stop returning existing license keys for unauthenticated email lookups.
- Move system prompt authority to the server and validate request protocol, lengths, and parameters.
- Atomic quota reservations and concurrent request controls, with sensible retries/refunds.
- Bound incoming request sizes, protect feedback submissions, and define student-transcript retention/deletion policy.

### Phase 2 — Krisp reliability
- Convert single-slot matched transcript delivery to a queue/ack mechanism.
- Protect pending inbox and deduplication against concurrent writes.
- Preserve the permanent ARM until explicit DISARM.
- Add deterministic tests for out-of-order arrivals, reconnect, regeneration, resets, and browser reloads.

### Phase 3 — Generation quality and infrastructure
- Run current one-pass generation against the proposed extract -> protocol -> generate -> inspect -> format pipeline.
- Score evidence accuracy and protocol compliance independently on anonymized, human-reviewed examples.
- Introduce provider abstraction/observability only where evidence justifies its maintenance cost.
- Replace deprecated storage dependencies safely and align CI to Node 24.

### Phase 4 — Commercial and release readiness
- Verify payment-provider production approval, renewal/cancel/webhook behavior using sandbox/test accounts only until authorized.
- Measure report acceptance, correction rate, generation cost/latency and genuine user retention with privacy-preserving telemetry.
- Confirm 5 monthly Free Classic generations and 5 one-time trials per premium protocol against the actual configured environment.
- Roll out only after explicit user approval and a tested rollback.

## Baseline verification commands

From `A:\PATHFINDER V2` use `npm ci` and `npm test`. The live smoke suite is opt-in; do not point it at production while testing features that can mutate real accounts or data.

**Current deployment note (2026-10-12):** Separate Vercel staging creation is blocked by team-scope authorization (403). No staging URL has been verified and no V2 deployment has been performed.
