# Handoff: Claude → Codex, 2026-11-03

## Live now
- Website: `dpl_CfLnk8mi3ok3FNHHKiRt4jxNRSiE`, commit `dc6c151` on branch
  `release/one-line-guard-20261103` (now `340c945`, tooling only after that).
  It contains your `763f123` (Scout card polish). Rollback: `dpl_D8PV48ypB2jVR7qkm5ftkoHq2zRJ`.
- Scout 1.4.15 is the public download: GitHub release `scout-1.4.15` on KIDBUSTER,
  sha256 `f615c5ff…1249a6`, unsigned (owner decision; no certificate). Source: private
  repo branch `scout/first-run-clarity-20261103`, built on your 1.4.13 assurance line
  plus 1.4.14 idle auto-minimize.
- Scout is open to active Pro accounts and the master (Krisp entitlement rule). The
  private Blob installer stays master-only and points at your 1.4.13.

## New rule: one release line (owner-approved)
Twice, a release built from another branch silently removed live work. The worst case:
the 13:32Z testimonial release dropped your `8388456`, so the master download fell
back to 1.4.10. I merged it back on 2026-11-02.
- Start from what is live: `node tools/release/release.mjs check`.
- Release only with `node tools/release/release.mjs stage`, then `... promote <url>`.
  Both refuse a candidate that does not contain the live release.
- Live identity comes from `/release.json`, which stage writes into the upload and
  never into git. Without it, the tool fingerprints the live page and all its scripts
  and styles against history.
- Do not use plain `vercel deploy` or `vercel promote` for production. See the top of
  AGENTS.md and RELEASE-CHECKLIST.md.

## Preview isolation (owner-approved, done via the Vercel API, scopes only)
- "Preview" was removed from 8 entries that were shared with production:
  - `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_REDIS_URL`,
    `KV_REST_API_KV_URL`, `KV_REST_API_READ_ONLY_TOKEN`;
  - `GOOGLE_SHEET_WEBHOOK_URL`, `APP_ACCESS_KEY`, `FOUNDER_LICENSE_KEYS`.
- No values were read or changed. Production was verified by a staged candidate that
  read the real database (license-status 401, krisp-session 403, testimonial status
  200) and passed 26/26 smoke checks.
- `tools/release/audit-preview-environment.cjs` now reports only missing Preview KV.
  Preview has no database until the owner creates a free Upstash DB connected to
  Preview only.
- Lemon Squeezy Preview entries were already separate. The owner still has to confirm
  they hold Test Mode keys.
- `ANTHROPIC_API_KEY` and `KRISP_WEBHOOK_SECRET` are still shared; they are not in the
  audit's critical list.

## Other things I changed on 2026-11-02 and 2026-11-03
- Redis:
  - an idle Krisp poll is 1 MGET;
  - away-from-keyboard cadence;
  - malformed keys are refused before Redis.
- Pro is capped at 35 reports per UTC day (`PRO_DAILY_REPORT_LIMIT`), with the copy
  "Up to 35 reports a day", and the owner gets refund alerts.
- Testimonials: an invite appears after any report, one story per account
  (`tp:done:<tag>`, 409 `already_submitted`, status GET).
- Scout first-run clarity:
  - "Not connected" status with a Connect button;
  - the pairing code is shown (the panel read `activity` but the code was passed in
    `delivery_status`);
  - start with Windows (HKCU Run, launcher only);
  - installer options ticked by default;
  - plain welcome text.
- Web Scout panel:
  - three steps until connected;
  - the device token moved under "Advanced";
  - a signed-out approval link survives sign-in;
  - accounts that are not Pro are told Scout is a Pro feature.

## Open items (owner)
- Create the Preview Upstash DB and confirm Lemon Squeezy Test Mode keys. After that,
  a full purchase → transcript journey can be tested.
- Two auth-paused Scout deliveries on the owner PC are not resolved yet. 1.4.15 now
  surfaces "Connection needed" for them.
- `index.html` is about 613 KB against a 600 KB-limit test. Keep extracting it
  incrementally.
