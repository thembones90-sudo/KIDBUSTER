# Classbuster release checklist

Applies to every production release of the website (`classbuster.com`, Vercel project `kidbuster`). Releases are built only from the protected line `feature/classbuster-scout-owner-restore-20261022` or a verified descendant. Never deploy an older branch: it would drop Scout, owner statistics, the Krisp self-heal and the authentication protections.

Each level is a different kind of evidence. A lower level never substitutes for a higher one.

## Level 1: static and synthetic gate (automatic, every build)
`scripts/verify-release-integrity.cjs` is the Vercel `buildCommand`, so a failing gate stops the deployment from building. It checks structure (routes, signature checks, entitlement, customer-record key prefixes, Krisp, Scout fail-closed gate, report generation, seven protocols, routes, function budget). It also renders the real sign-in and recovery emails for the deployment's `PATHFINDER_APP_URL` and validates them against the deployed relay's rules.
- [ ] Local: `node scripts/verify-release-integrity.cjs` prints `Release integrity OK`.

## Level 2: full synthetic suite (local, in-memory data, no network)
- [ ] `npm test` all green, with `PUPPETEER_EXECUTABLE_PATH` set to the installed Chrome on Leviathan. Includes sign-in/recovery/registration, billing and webhooks, subscriptions, Krisp, Scout owner-only (`test-scout-owner-fingerprint.cjs`), relay contract (`test-mail-relay-contract.cjs`) and the gate's negative cases (`test-release-integrity.cjs`).
- [ ] A flaky browser test is re-run in isolation and in a clean full run; it is never ignored.

## Level 3: live candidate checks (staged production candidate, not promoted)
- [ ] Stage: `vercel deploy --prod --skip-domain` (or `tools/release/scout-owner-release.ps1 -Phase Stage`). The current production deployment stays live.
- [ ] `node tools/release/candidate-smoke.mjs <candidate-url> --expect-scout enabled|disabled`, with `VERCEL_AUTOMATION_BYPASS_SECRET` set for the protected candidate. These are refusal-only and read-only: no emails, accounts, checkouts or reports.
- [ ] Every check passes.

## Level 4: owner-verified production-equivalent checks (on the candidate)
These need real credentials, so only the owner performs them, in their own browser:
- [ ] Owner key: the account loads, plan shows correctly, a report generates.
- [ ] Scout (only for releases that enable it): the Scout panel is visible for the master account, and Scout stays absent when signed in with any other key.
- [ ] Email (whenever email code, relay rules or `PATHFINDER_APP_URL` change): request recovery for the owner's own address, receive it, follow the link and sign in. Never use a customer's address without explicit authorization.
- [ ] Payments (whenever checkout, webhook or licensing code changes): existing Pro accounts are still recognized as Pro. A live purchase is optional and needs the owner's explicit approval.

## Promotion (owner's explicit authorization required)
- [ ] Record the current production deployment ID as the rollback.
- [ ] `vercel promote <candidate-url>`.
- [ ] `node tools/release/candidate-smoke.mjs https://classbuster.com --expect-scout …` passes against production.
- [ ] Keep `kidbuster.vercel.app` serving without a redirect: the Lemon Squeezy webhook, Krisp webhook links and installed Scout clients still use it.

## Rollback
- Instant: `vercel rollback <previous-deployment-id>` (or promote the previous deployment in the dashboard).
- Scout only: remove or change the production `RADAR_VAN_ENABLED` value, then redeploy (env changes need a new deployment), or roll back.

## Never
- Promote a candidate that failed any level.
- Bypass or edit the gate to make a release pass.
- Deploy unfinished Scout functionality to non-owner accounts. The public Scout release stays frozen.
