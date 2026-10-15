# Pathfinder V2: activation-based manual licensing (2026-10-12)

## Scope and provenance
Applied the tested Pathfinder first-activation licensing fix from the local production hotfix baseline in an isolated, source-only port to **A:\PATHFINDER V2**, branch `pathfinder-v2`.
No external deployment, no production database, owner secrets, customer data, live payment/Krisp traffic or production writes.
The original 6 V2-specific commits and email ownership-verification flow are preserved. The release's index.html was three-way merged against the common source baseline, explicitly choosing V2 for email signup/recovery and the hotfix for licensing UX.

## Implemented
- Owner-created manual Pro codes are **unactivated stock**: `activationPending:true`, `expiresAt:null`.
- First successful browser claim sets `activatedAt` and expiry to 30 days thereafter. Repeated access and device-claim resets do not restart the clock.
- Manual keys still enforce one-browser binding; ordinary paid subscriptions, Free accounts and founder access preserve their distinct behaviors.
- Stock manual codes cannot call Krisp until activated. Existing activated keys retain the stable license identity for pending transcripts and webhook routing.
- Paid subscription activation removes obsolete manual expiry and claims. Legitimate Free fallback removes obsolete expiry without changing inactive accounts' independent status.
- Owner lookup exposes created, activated, expiry and manual status. Explicit owner-only 30-day renewal preserves a customer's original license identity.
- Owner panel includes preview and soft retirement of **expired 2026-09-11 manual stock** and replacement batch generation in 5-code API chunks; a deliberately retired key cannot be renewed through the normal renewal action. Retirement invalidates old Krisp webhook routing while preserving stored transcript data.
- Account status refresh rejects late responses from a previously selected access key. Unactivated and expired states no longer display misleading 'active' messages.

## Verification
- Local `npm test`: **21/21 test files passed**, including real Chrome/Puppeteer browser smoke via `PUPPETEER_EXECUTABLE_PATH` and the existing V2 secure signup/recovery tests.
- Synthetic regression tests cover first activation, expiry persistence, browser binding reset, Krisp eligibility, owner authorization, retirement and 20-code batch caps.
- `git diff --check`: clean.
- The test-live-smoke test file is not proof of V2 staging integration.
- Production rollout is **not performed**. No isolated Vercel staging environment or datastore has been provisioned.

## Release separation and known limits
- V2 remains separate from production and must not be pushed/deployed without staging isolation and explicit authorization.
- The September batch retirement is a legacy live-incident owner tool retained for parity; it does **not** make V2 able to access or revoke live customer codes, since the V2 datastore is deliberately isolated.
- **Update, October 12:** First-activation now uses Redis SET NX with a durable claim winner marker and recovery logic. The 64-browser concurrency regression test and 22/22 local test files pass. See `V2-ATOMIC-LICENSE-CLAIM-2026-10-12.md`. Real distributed staging tests and multi-key lifecycle transaction hardening remain before commercial release.
- V2 retains its existing separate `api/license-verify.js` endpoint; this port introduced **no new top-level API route**.
