# Scout — single-master online pilot — 20 October 2026

## Authorization and target

The owner explicitly authorized putting Scout online only for their existing master account, followed by “Finish work.” This is not a Free/Pro rollout.

Verified the user-supplied identity through the live license-status endpoint: active Pro/master. The master credential was not written into source, package, report or logs. The server additionally requires `RADAR_VAN_OWNER_SHA256` to match the requesting master identity; that narrowing never grants master status itself. Other owners, normal customers and malformed configurations are covered by synthetic tests. Device ingestion rechecks the same gate.

Actual current live site: https://kidbuster.vercel.app, Vercel project `kidbuster`, project `prj_HmRSSnwgkegIGaDnoX0txcKGVwai`, team `team_p26UJZ9MgenN71TjBdHzUeMo`. The older isolated `pathfinder-v2-staging` project is not the current user-facing deployment. Verified both rather than assuming the local link was current.

## Release provenance

- Previous live deployment: `dpl_C7yW6ShEa1XPTS1mX9E68znHx9KE`.
- New deployment: `dpl_35vvDUCHWJbpxTWYoEAWJShSgbH6`.
- Staged production URL: https://kidbuster-ahupbrlbd-thembones90-sudos-projects.vercel.app
- Release artifact: `.v2-local/scout-master-online-release-20261020`.
- Baseline: `.v2-tmp/live-no-school-logos-20261019`; index and appearance CSS were compared against the live site before release.
- Builder: `tools/staging/prepare-scout-master-release.cjs`.
- Only Scout handlers, feedback dispatch, two rewrites, hidden owner inbox UI, its client and scoped CSS were added to that published snapshot. Generation, billing, license-status, Krisp webhook and protocol theme CSS were confirmed unchanged.
- Runtime `RADAR_VAN_ENABLED=true` and the private account hash were provided to this deployment only, not globally enabled on every environment. Future releases must deliberately carry the owner-only code and both settings. Omission disables the feature. Do not broaden access without separate authorization.
- Staged using `--prod --skip-domain`, checked through authenticated Vercel curl, then promoted only after the release regression run passed. Deployment protection was not disabled or modified. The connector lacked team scope; the existing authorized CLI was used.
- No Git push or claim of a clean development checkout. Existing unrelated changes were preserved.

## Evidence

- All **88 release test files passed**: `.v2-tmp/scout-master-release-tests-final.log`.
- Protected-stage real HTTPS checks: regular identities denied for session, polling, connect, ARM/disarm, claim, dismiss and disconnect; actual master accepted; one-time token hidden from subsequent reads; text ingest and duplicate suppression passed. Test entry dismissed and token revoked.
- **24 public-site HTTPS/Python/Chrome checks passed**: `.v2-tmp/scout-master-live-tests.log`.
- Actual Python sender delivered synthetic text and its repeated send was acknowledged without duplication.
- Actual Chrome received the pending card, refused to overwrite occupied notes, imported into empty notes after explicit action, acknowledged the import, made zero generation calls, and hid Scout after switching to a non-master identity.
- Test tokens were revoked and synthetic entries removed. Final live account is connected to the installed desktop token; pending and matched counts are zero; no token is returned by status.

### Verification caveats recorded honestly

An initial release test attempt omitted test-only tools and retained an old rewrite expectation. These test fixtures were corrected/copied; deployable application files were unchanged; the final complete 88-file run passed.

A separate run against the dirty, unpublished development tree reported 50 failed checks across 93 test files: its older RADAR VAN fixtures still expect Free/Pro access, and an account-layout browser test crashed. This was not a passing development-tree run and is not being represented as one. The published-baseline release plus the new owner/single-master checks is the tested artifact. Updating the old development fixtures remains separate work; do not weaken authorization to satisfy them.

No real lesson, microphone capture, student audio, paid generation, billing change, customer email or external transcript delivery occurred during verification. Synthetic text was used on the owner's inbox only.

## User workflow

1. Refresh Pathfinder and open Account → Scout.
2. Launch the installed Scout using `A:\RADAR VAN\START PATHFINDER SCOUT.cmd`.
3. Finish and transcribe a test lesson in Scout; automatic text delivery is enabled for the paired device.
4. Import the pending transcript into an empty Pathfinder workspace, then select protocol/rating and generate normally.

Browser ARM/automatic import is deliberately left opt-in. Importing never generates a report. Only transcript text is sent; raw audio stays local. Retention remains 24 hours on the server.

## Rollback

Restore the previous deployment with the authenticated Vercel CLI if necessary. That baseline has Scout disabled/absent. Revoke the current device through Account → Scout → Disconnect before retiring the online pilot. Do not print or copy stored device credentials. Archived desktop profiles remain under `A:\RADAR VAN\PRESERVED LESSON DATA`; the older compiled binaries were removed under the one-current-build policy.
