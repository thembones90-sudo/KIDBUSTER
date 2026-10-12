# Pathfinder production licensing incident: isolated hotfix
Date: 2026-10-12
Worktree: A:\PATHFINDER-LIVE-HOTFIX-20261012
Branch: hotfix/license-expiry-20261012
Base: 441d0c1d63136eb83f4b6b73156fc32fd6f0b8d3 (official main)
Live URL: https://kidbuster.vercel.app/

## Observed incident
Christopher reported that old and replacement codes showed Expired, with expiry date October 11, 2026. Krisp integration then stopped. Screenshots contained distinct masked code suffixes. This establishes that the UI displayed different saved keys, NOT that their live KV records were freshly issued or valid. No live license records were inspected, and no customer keys are copied into this repo.

## Reproduced code defects and changes
1. api/_lib/license-service.js: Payment activation previously kept expired manual-code expiresAt, manual flag and device claim. A customer who had subsequently paid could remain 'expired' and denied Krisp. Now successful paid activation clears those obsolete manual restrictions without changing the license KEY, preserving stable Krisp data identity.
2. api/_lib/license-service.js: downgradeToFree previously retained expiresAt and a manual device claim. A user eligible for the ongoing Free tier could be fully denied. Now resets the expiry and manual binding, retains active Free status, preserves the license key and existing usage history.
3. index.html: prior concurrent status requests could overwrite newer key status. Now each refresh is versioned and checked against the actual saved key; obsolete replies/errors are ignored.
4. index.html: stopped saying 'Saved access code is active' when expired. Explicit access state and Expired/Expires date.
5. api/admin-license-lookup.js / index.html: owner-only read-only license lookup now exposes an effective expired Boolean, createdAt and expiresAt, and displays effective expiration rather than raw 'status=active' alone. No license mutation or key disclosure added.
6. tests/test-hotfix-licensing.cjs: synthetic regression tests for three manual codes sharing email, independent expiry, owner expiry lookup, manual device claim, paid conversion, Krisp eligibility, Free fallback and an out-of-order browser status race.

## Evidence and limitations
Local deterministic test: three newly created 30-day manual keys for the SAME email are unique and all return ACTIVE Pro under their correctly claimed installation ID; expiring one does not expire the others. Therefore current source does NOT reproduce the assertion 'every new key expires October 11'. Actual customer KV metadata, creation dates and issuance workflow must be inspected to determine why Christopher's replacements behaved that way.
The current manual-license creation route generates a distinct license and calculated 30-day expiry. An old spare key created around September 11 would naturally expire around October 11. An incorrect live record, browser race, or wrong issued-code sequence are still possibilities.
Manual-key expiry STILL denies Krisp by design until the owner correctly extends/replaces the manual entitlement. This hotfix does not silently grant unpaid Pro access. Replacing a key changes the stable Krisp identity; preserving the original key on legitimate renewal is preferable but requires an explicitly authorized renewal flow (not implemented here).
Existing payment webhook immediately downgrades on cancellation, even before paid-through end, a separate billing lifecycle defect requiring a distinct fix/test. This hotfix does not change billing event semantics.

## Verification
- npm ci completed locally on A:.
- node tests/test-hotfix-licensing.cjs: passes.
- npm test: ALL 20 TEST FILES PASSED, including Chromium browser smoke and payment/route suites.
- git diff --check: clean.
- No payment-provider test traffic, real Krisp webhook, live customer records, or production KV were touched.
- Codex reviewed this issue and independently confirmed the main three code defects, but its read-only execution policy blocked code changes. Changes and test runs above were performed through authorized desktop tooling.

## Production status / release gate
This is LOCAL HOTFIX ONLY, not deployed. Original live Pathfinder remains at its previous version.
Vercel runtime logs/deployment API returned HTTP 403 permission denied for project kidbuster. An authenticated, authorized deploy path and rollback plan are still required. Do not equate passing tests with proof that live user access is restored.
Before live release:
1. In the CURRENT live owner account, look up each affected code using the existing owner-only admin lookup. Capture only masked key suffix, createdAt, expiresAt, effective status, manual flag and claimed installation. Avoid pasting full bearer keys in notes/chats.
2. Confirm whether the two replacements were minted recently. If newly minted keys were expired immediately, investigate production KV indexing and exact license-status responses before deployment.
3. Verify customer payment/entitlement. Restore on the SAME key where possible to retain Krisp transcript namespace; do not invent/extend paid entitlement without owner authorization.
4. Review this isolated diff, back up the live deployment and relevant records, deploy by an authenticated owner with main-branch release control, smoke-test new code creation, swapping, Krisp entitlement, paid renewal, Free downgrade, then monitor logs.
5. If any regression, roll back live to the previous READY deployment. Do not reset or delete KV data to roll back.
