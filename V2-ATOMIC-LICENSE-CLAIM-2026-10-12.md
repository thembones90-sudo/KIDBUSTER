# Pathfinder V2: Atomic first activation
Date: 2026-10-12 | Scope: **isolated V2 branch only** | Production: unchanged

## Problem fixed
Before this change, two activation requests could both read `claimedInstallationId:null` and independently write their own browser ID and 30-day timestamp to the same license record. A later write could steal the activation or shift expiry.

## Design
- Add a non-expiring Redis claim marker `manualClaim:<licenseKey>` created with **SET NX**. Only one request may write this key, even from multiple serverless workers. Installed @upstash/redis types confirm `nx` is supported.
- Store the winning installation ID, `claimedAt`, first `activatedAt`, and `expiresAt` in this marker. The marker determines **who activated and when**.
- On a repeated status check, a second browser is rejected. The winner is allowed, and can repair the ordinary license record from the marker after an interrupted write without moving expiry.
- Retain legacy behavior for pre-existing claims with no marker. New first claims mark the license `atomicClaim:true` so a missing marker after an owner reset fails closed rather than permitting stale authorization.
- Resetting an owner-authorized device binding clears the license binding and claim marker. The original `activatedAt` and `expiresAt` survive the reset.
- When paid Pro activation supersedes manual access, and on Free downgrade, clear obsolete manual marker.
- Test KV and isolated localhost KV implementations support `SET NX` with the same first-writer-wins behavior. The localhost implementation persists records in a Git-ignored, separate A: folder.

## Tests
Run `npm test` from `A:\PATHFINDER V2` with Node 24 and Chrome/Puppeteer.
**22/22 test files PASS**, including `test-activation-race.cjs`:
- 64 simultaneous independent browser activations: exactly 1 succeeds.
- 48 concurrent requests from winning browser: all succeed, expiry stays fixed.
- Synthetic failure after winning SET NX but before normal record write: 500, no stolen claim; winning browser's retry repairs record with original timestamp.
- Owner binding reset and a second 64-browser race: exactly one new winner without extending expiry.
- Stale pre-reset request rejected when its modern atomic marker is no longer present.
- Pre-migration claimed licenses continue to work, reset safely to atomic claim.
- Paid subscription upgrade removes obsolete manual claim and permits a different browser.
- Real browser smoke and the other existing 21 suites pass.
- Local file-backed KV: NX winner retained across separate Node processes with the same isolated test DB file.

## Boundaries and limitations
- No changes to LIVE Pathfinder, live master keys, real customer records, payment systems, Krisp deliveries, or production datastore.
- **No real Redis/Upstash staging integration was run** because the independent, access-protected V2 staging project and datastore are not yet provisioned. Installed SDK support and in-memory/local tests are not a substitute for a real distributed Redis test.
- Owner reset, paid activation, and manual first claim involve more than one key. These full lifecycle transitions are not a single atomic Redis transaction. Cross-request races between those administrative/payment operations remain a separate hardening target.
- The local JSON KV implementation serializes claims within one Node server process, **not across multiple independent local servers writing the same file**. Keep a single localhost backend; port 8766 safely proxies to port 8765. Distributed atomicity requires the Redis SET NX backend and isolated staging verification.
- Local V2 preview server already running in Node must eventually be restarted to load changed backend modules. **Do not restart it during the user's current work session.** Source and tests are updated without disrupting the `[local owner alias intentionally omitted]` alias bridge at port 8766.
- The normal V2 branch commit is local only. Do not push/deploy without explicit approval and isolated staging.
