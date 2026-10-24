# Classbuster — Instructions for Coding Agents

Updated 2026-10-24. Read this first. Several agents (Claude, Codex, others) work on these
projects at the same time: before changing anything, check `git status`, `git log` and the
newest `*.md` notes in the folder you work in, and never overwrite newer work.

## What is live
- **Classbuster web app**: https://classbuster.com (Vercel project `kidbuster`,
  `prj_HmRSSnwgkegIGaDnoX0txcKGVwai`). Live code: `A:\CLASSBUSTER-LEGACY-LIVE-RELEASE-20261023`,
  branch `release/classbuster-legacy-safe-20261023` (GitHub `thembones90-sudo/KIDBUSTER`).
  `A:\PATHFINDER V2` is an older, dirty working copy: do not deploy from it.
- **Old address** https://kidbuster.vercel.app is a forwarding door to classbuster.com
  (`assets/legacy-forward.js`). Its `/api/*` routes MUST keep answering: older Krisp webhook
  links and older Scout installs still post there. Never add a server redirect for it or `/api`.
- **Lemon Squeezy** webhook: `https://classbuster.com/api/payment-webhook` (store 429633).
- **Classbuster Scout** (desktop, owner-only pilot): source `A:\RADAR VAN`, private GitHub
  `thembones90-sudo/classbuster-scout`. Installed in `%LOCALAPPDATA%\Classbuster Scout\`:
  `profile\` (permanent: lessons, settings, connection), `versions\<build>\`, `current.txt`.
  Current program is `versions\<build>\Scout\Scout.exe`, installed by ScoutSetup.exe.
  The Start menu shortcut is Classbuster Scout. The A-drive install and old ZIP are
  retained copies, not the current launch path. `publish_scout.py` defaults to the
  per-user home; use an explicit `--home` only for a retained installation.

## Release process (web)
1. Change + regression test; `npm test` must pass (all files). Never weaken a test to pass.
2. Commit, then export the commit with `git archive` into `.v2-tmp\deploy-<sha>` (never deploy a
   working folder) and add `.vercel\project.json`.
3. `vercel deploy --prod --skip-domain` (staged candidate; production stays live).
4. `tools/release/candidate-smoke.mjs <candidate>` plus migration/pairing/monitoring probes.
5. Promote only with the owner's approval; verify classbuster.com AND kidbuster.vercel.app;
   record the previous deployment as rollback. Pushing to `main` does not deploy (disabled).

## Release process (Scout)
Build + `verify_package.py --cpu` + `tools/phase10f/check_live_controls_frozen.py`, then
`python -B tools/publish_scout.py --dist <dist> --apply`. The running Scout switches itself when
idle; rollback: `publish_scout.py --rollback --apply`. Never edit launchers, never copy profiles
by hand, never start a second Scout while one runs.

## Hard rules
- **Scout is owner-only.** Every Scout browser/session/ingest/download path authorizes only the
  server-verified master/owner key; an enabled feature flag never grants wider access. No public
  download, sales entitlement or customer rollout without the owner's separate explicit approval.
- No production datastore writes except through owner tools; no reading/decrypting production
  secrets; no emails to real customers; no payments/refunds; no Krisp deliveries in tests.
- Owner privacy decision 2026-10-24: temporary Scout audio/transcripts must be removed
  after durable authenticated webhook confirmation, leaving a content-free SENT receipt.
  Never delete active, failed, queued, quarantined or otherwise unconfirmed lessons.
  Retained legacy profiles require separately verified delivery before cleanup.
- Grant Pro only on verified identity (manual 30-day keys always carry the customer's email).
- Preserve all seven protocols, teacher names and sign-offs, official formatting, the nested
  Generate button `.btn-label`, and protocol color theming via `var(--toxin-rgb)`.
- Krisp ARM persists until explicit DISARM; Krisp identity is the stable license identity,
  not the rotating webhook token.
- Security and reliability before aesthetics; every change needs regression coverage.

## Operations
- Owner panel → Owner tools → **Recent activity**: 30-day event log (sign-ins, payments, Scout
  deliveries, failures, alerts). Vercel request logs only keep 1 hour.
- Daily cron 06:00 UTC (`/api/feedback?task=daily`, `CRON_SECRET`): manual-key expiry alerts.
- Alerts go to the owner sheet and `OWNER_ALERT_EMAIL` (email needs the mail relay's owner-alert
  rule, `tools/mail-relay`, deployed in the ASOC Engine Railway project — owner approval needed).
- Customer continuity report: `CLASSBUSTER-CUSTOMER-CONTINUITY-FINAL.md`.
