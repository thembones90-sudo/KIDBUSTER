# Classbuster — Instructions for Coding Agents

Updated 2026-10-24. Read this first. Several agents (Claude, Codex, others) work on these
projects at the same time: before changing anything, check `git status`, `git log` and the
newest `*.md` notes in the folder you work in, and never overwrite newer work.

## Owner-approved behavior lock — 2026-10-25

The owner confirmed runtime 725eb0f works correctly and explicitly requested that
these settings be locked. This section overrides conflicting historical notes below.
Do not change this contract, bypass its tests, or refresh the release fingerprints
without a new explicit owner request authorizing the behavior change.

- Preserve the original centered two-column layout and existing controls/handlers.
- Every protocol uses the same Classic sizing reference and identical outer panel
  geometry; protocol switches and rating captions must never change that envelope.
- Fit the initial workspace proportionally to the browser viewport.
- Keep exactly the same fitted size before, during and after Generate, including
  repeated generation. Rating 6 descriptions must never shrink the workspace.
- Generated reports extend the page at that same scale with normal page scrolling;
  do not introduce internal or nested Output scroll containers.
- Account must keep the same fitted workspace scale when opened and closed. Its
  content extends the page with normal scrolling. Dialogs/popovers keep their
  existing behavior. New Student resets and fits normally.
- Do not add a secondary view or Change View option without explicit owner instruction.

The Vercel install integrity gate fingerprints both approved resizing assets and
requires their versioned references. The browser regression
`tests/test-initial-workspace-fit.cjs` checks all seven protocols/screens, rating 6,
exact Generate geometry, page scrolling, Account/popovers and New Student. Preserve
and run it when touching layout or generation presentation. Existing release rules
continue to apply. A new owner-approved behavior change must update this contract,
its regression and the fingerprints together; passing a build alone is not approval.

## What is live
- ACCOUNT + PROTOCOL SIZE LOCK (latest owner corrections, 2026-10-25): runtime
  `de4098f`, deployment `dpl_9pqdEAJDTW1XEfhhTSmmnCXJzdF6`. All protocols use the
  identical Classic outer panel geometry. Account retains the fitted workspace
  scale when opened/closed; Generate retains it before/during/after completion.
  Normal page scrolling handles Account and report content. The contract above
  supersedes historical instructions to unscale Account. All 117 files passed;
  exact live protocol/Account/Generate checks passed at 1909x943 and 1366x650,
  and both domains passed 24/24. See ACCOUNT-SAME-SIZE-LOCK-20261025.md.
- GENERATE MUST KEEP THE SAME SIZE (owner correction, 2026-10-25): runtime
  `725eb0f`, deployment `dpl_8XunsdtLuFwhJCSWeJkGrKuENgXd`. Keep the fitted
  workspace scale before, during and after generation; never reset it to 100%
  or fit the height of generated text. Cache the empty workspace dimensions;
  let the full report extend the page with normal scrolling at that same scale.
  Account/popovers/dialogs keep their existing original behavior. No internal
  Output scrolling or application handler changes. This supersedes the previous
  entry's statement that generating/report views return to unscaled size.
  All 117 files passed. Live exact geometry equality verified at 1909x943 and
  1366x650; both domains passed 24/24. See `GENERATE-SAME-SIZE-RELEASE-20261025.md`.
- INITIAL-WORKSPACE-ONLY FIT (explicit owner clarification, 2026-10-25): runtime
  `01e2e40`, deployment `dpl_E5GVzsTeZ8TsJ7UqycUx49X373oq`. The owner authorized
  ONLY fitting the initial empty workspace. Account, popovers, dialogs, generation
  and reports retain the locked original unscaled behavior and page scrolling.
  `assets/initial-workspace-fit.*` is the separate display layer; index.html has
  only two new asset references and no changes to existing application handlers.
  Rating 6 must not change initial scale. New Student returns to initial fitting.
  Do not broaden fitting to Account or reports, reparent controls or add Output
  scroll containers. See `INITIAL-WORKSPACE-ONLY-FIT-RELEASE-20261025.md`.
  All 117 test files passed; both domains passed 24/24 and the full sequence was
  verified live using synthetic responses. Rollback is the original deployment
  `dpl_5xc42UCfWnVw5JE8D2nhtpHj3kM1`.
- OWNER-LOCKED ORIGINAL BEHAVIOR RESTORED (2026-10-25): live deployment
  `dpl_5xc42UCfWnVw5JE8D2nhtpHj3kM1`, original runtime `79e3e8e`.
  Canonical restoration commit `2ab8a53` restores index.html, assets and tests
  exactly to that pre-resizing baseline. ALL proportional resizing patches are
  reverted. The owner explicitly rejected their Account and report behavior and
  requested that the original controls and behavior be locked again. Do not
  reintroduce fit-original assets, canvas zoom, viewport fitting, internal Output
  scrolling or view changes without a new explicit owner request for that change.
  Natural page scrolling and the original unscaled Account behavior are intended.
  The resizing releases below are historical, NOT current instructions or live.
  See `ORIGINAL-BEHAVIOR-LOCK-20261025.md`.
- GENERATED REPORT FIT FIX: runtime `ab153bd`, deployment
  `dpl_DLuwNrt2zVD6yoE97qHJ4jxzchJQ`. Preserve the confirmed original layout
  and its scale after generation. The output panel keeps its initial footprint;
  long report text scrolls inside Output rather than shrinking the application.
  See `GENERATED-REPORT-FIT-RELEASE-20261025.md`. All 117 test files passed,
  both domains passed 24/24 and actual synthetic generation was checked live.
- PROPORTIONAL ORIGINAL-PAGE FIT: runtime `947f02a`, deployment
  `dpl_5VAp2wsDwcTTJPHX5eMfmrkhwE7n`. Owner explicitly requested uniform,
  vector-like whole-page scaling with no page scrollbar. The original centered
  two-column arrangement is retained; do not stretch panels or substitute a
  different arrangement. See `PROPORTIONAL-FIT-RELEASE-20261025.md`.
- ORIGINAL CENTERED LAYOUT RESTORED at owner's further rollback request:
  runtime `79e3e8e`, deployment `dpl_5xc42UCfWnVw5JE8D2nhtpHj3kM1`.
  Deployable files match `0650f80` exactly. All new viewport/view-mode changes
  below are reverted. The live wrapper is 1240px, with notes above output.
  Both public domains passed 24/24. Normal redeployment was used because Vercel
  refused a deeper instant rollback with HTTP 402. Do not reintroduce these
  rejected layout changes without a new owner request.
- OWNER ROLLBACK 2026-10-25: the stretched original-default release below was
  rolled back. Current live runtime is `98a6df7`, deployment
  `dpl_9gzpCc5LxSmxMFSrv4ffPWqmroph` (three-column Classic-size view).
  Do not republish `3943f8b`; the owner rejected its stretched layout.
- Original-view default restoration: runtime commit `3943f8b`, deployment
  `dpl_26RJ1wsmsSQaHFk6atgNzjwCZS5s`. Settings left, notes above output on the right.
  Account → Change view selects the preserved three-column Classic-size option.
  See `ORIGINAL-VIEW-RELEASE-20261025.md`. Preserve both modes and the saved choice.
- Classic-size reference follow-up: live runtime commit `98a6df7`, deployment
  `dpl_9gzpCc5LxSmxMFSrv4ffPWqmroph`. Every desktop protocol now adopts Classic's
  dimensions at the same viewport, not just equal dimensions within its own mode.
- Equal-panel follow-up 2026-10-25: live runtime commit `8bd62cc`, deployment
  `dpl_CnNe6bcRUN2MmHaBgcZ1Wrp1sFfD`. All three desktop panels have equal width and
  height for every protocol. See the follow-up in `RESPONSIVE-WORKSPACE-RELEASE-20261025.md`.
- Responsive workspace release 2026-10-25: commit `963a4d9` on the canonical release line,
  deployment `dpl_AtjPcA3ezEt4ahe23m66mNKW2818`. See
  `RESPONSIVE-WORKSPACE-RELEASE-20261025.md`. This includes the Scout card releases below.
- Frontend release update 2026-10-24: live commit `c566e5e` on
  `codex/scout-card-parity-20261024`; see `SCOUT-CARD-PARITY-RELEASE-20261024.md`.
  Preserve these card changes when integrating the canonical folder's concurrent
  unpublished Classic edits. Do not deploy the older canonical snapshot as-is.
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
  Every shortcut (Start menu, Startup) targets `<home>\ScoutLauncher.exe`, which starts the
  version in `current.txt`; never point a shortcut into `versions\` (pruning breaks it).
  Never run ScoutSetup.exe or Scout tooling from inside Codex: its MSIX sandbox silently
  redirects `%LOCALAPPDATA%` into its own package storage.
  The Start menu shortcut is Classbuster Scout. The A-drive install and old ZIP are
  retained copies, not the current launch path. `publish_scout.py` defaults to the
  per-user home; use an explicit `--home` only for a retained installation.

## Release process (web)
1. Change + regression test; `npm test` must pass (all files). Never weaken a test to pass.
2. Commit, then export the commit with `git archive` into `.v2-tmp\deploy-<sha>` (never deploy a
   working folder) and add `.vercel\project.json`.
   **One release line.** Every production release is built from
   `release/classbuster-legacy-safe-20261023` with your change committed on top. If production
   currently runs a commit that is not on that branch (check: `git merge-base --is-ancestor
   <live-commit> HEAD`), merge the live commit into the release branch first. Never deploy a side
   branch: on 2026-10-24 side-branch releases twice dropped approved work that was already on the
   release branch. Before deploying, review `git log <live-commit>..HEAD` so you ship everything
   that is live plus your change, and nothing unapproved.
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
