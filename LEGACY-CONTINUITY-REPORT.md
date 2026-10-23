# Classbuster legacy account continuity - release review

Date: 2026-10-23
Product: Classbuster
Known legacy origin: https://kidbuster.vercel.app
Primary domain: https://classbuster.com
Project: Vercel kidbuster (both public origins verified to resolve to same project/deployment and backend).

## Confirmed failure mechanism

Browser localStorage is isolated by web origin. A teacher opening Classbuster from the old kidbuster.vercel.app domain cannot automatically see an existing old access key/installation ID stored under that domain. The email recovery endpoint previously called getOrCreateFreeLicense unconditionally, including when a user requested *recovery* for an email with no index. This silently made a separate Free identity for manual Pro keys that were never attached to an email. This was a false recovery, not evidence that the original license had lost its Pro entitlement.

A manual Pro key issued without an email cannot be uniquely associated with any particular new email by the server alone. Association requires existing legitimate possession of the original key/browser or an authorized owner reconciliation against purchase records. Never grant Pro from an unverified email claim.

## Implemented

1. Authenticated origin-to-origin transfer using exact legacy and new origins. Old host reads localStorage's existing key and installation ID, checks current status, requests an opaque random one-time ticket (256-bit, 5-minute KV TTL) through an existing API route. New host redeems once atomically using KV GETDEL, restoring the SAME key and claimed installation ID. Real keys/IDs are NEVER placed in the URL. Transfer tickets travel only in a URL fragment and are removed before API redemption. Founder/master keys cannot be transferred.
2. Transfer preserves existing Pro and Free plan, license record, renewal/expiry, usage/trial counters, Krisp identity and manual device claim. New host can replace a mistaken Free key, but will not silently overwrite a different active Pro/founder account.
3. An email recovery token with no valid email index now returns explicit actionable recovery instructions rather than creating a Free account. Email-linked Pro always returns the same underlying paid license. True signup still creates Free when appropriate.
4. Free signup no longer races by overwriting an existing paid email-index mapping: NX index creation; a losing concurrent signup returns the index's winning key. It may create an orphan Free candidate record if another request wins between creation and NX, but does not redirect or downgrade paid customers.
5. UI labels the old-domain transfer option under Access, and provides missing-old-session guidance. No manual replacement Pro key is minted or charged.

## Test evidence

- tests/test-legacy-account-continuity.cjs: 21/21 deterministic backend checks, including intact Pro identity, Free transfer, manual device claim protection, founder exclusion, missing/stale index behavior, single-use tickets, origin checks, subscription identity, no record rewrite and racing signup.
- tests/test-legacy-transfer-browser.cjs: 8/8 headless Chrome checks with separate HTTPS origins simulated via request interception, including erroneous Free -> original Pro, installation transfer, no credential in URL, account refresh, different active Pro protection, missing legacy key instructions.
- tests/test-paid-recovery-link.cjs: historical symptom regression updated to assert unmatched recovery does not manufacture Free; owner repair path still tested.
- npm test: 98/98 complete test files passed in the isolated feature worktree.

**Simulated browser origins and in-memory KV are tests, not proof that all historical customer accounts in production have been indexed correctly.** No real credentials, customer audio, payments or live KV keys were changed during this development.

## Limitations and rollout criteria

- Verify exact production deployment and newest protected branch before integration. Preserve private Scout owner gates, payments, Krisp, usage statistics, and any newer website changes.
- Run full regression/release gate and staging browser smoke after integration.
- Stage with Vercel CLI --prod --skip-domain from a clean tracked-file checkout; promote only after verification. Do not stage from a dirty folder or ship test fixtures.
- After promotion: verify both old and new hosts show updated transfer option; validate ticket endpoint refusal without credentials; verify ordinary existing-account sign-in and old->new transfer using a consenting test account. No production key should be logged or sent in a URL.
- For a manual license created without an email, old-browser transfer or existing-key sign-in will restore it. Email recovery is possible only when the original email index has been established by verified purchase/account evidence or owner linking. **No automatic mapping from email to an entirely unindexed manual key is cryptographically or operationally safe.**
- Production customer-by-customer entitlement reconciliation remains separate; do not claim every live record has been audited without authorized database access.
