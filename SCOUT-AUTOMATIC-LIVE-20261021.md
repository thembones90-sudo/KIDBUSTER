# Scout automatic notes — live release

Published on 21 October 2026 after explicit owner approval to deploy online.

- Public site: https://kidbuster.vercel.app
- Vercel project: `kidbuster`, `prj_HmRSSnwgkegIGaDnoX0txcKGVwai`
- Team: `team_p26UJZ9MgenN71TjBdHzUeMo`
- New production deployment: `dpl_4i2hHbsAMyFNhe2qFjdycpeAiArP`, READY
- Staged/tested build: https://kidbuster-hcx9lq7ww-thembones90-sudos-projects.vercel.app
- Previous production / rollback: `dpl_35vvDUCHWJbpxTWYoEAWJShSgbH6`
- Release folder: `.v2-local/scout-automatic-release-20261021`

## Scope and provenance

Built from the prior published release, not the dirty development checkout. The baseline index was compared byte-for-byte with the live site before staging. Deployable changes are limited to index.html, assets/radar-van-client.js, api/_lib/radar-van.js, and api/_lib/radar-van-session-handler.js. All other deployable application files were hash-compared to the prior release. Generation, protocol prompts, billing, licensing, Krisp, theme assets and Vercel configuration are unchanged.

Scout remains single-master only. The deployment carries RADAR_VAN_ENABLED and the same owner fingerprint derived from the owner's previously supplied master identity, with no global project environment changes. No plaintext credential was written into source or deployment files. Git was not pushed; this is a Vercel CLI source-snapshot deployment. No desktop executable was changed.

## Evidence

- All **90 release test files passed**. Log: `.v2-tmp/scout-automatic-release-tests.log`.
- Protected staged deployment: **8 checks passed** using authenticated Vercel curl, without changing Deployment Protection.
- After promotion: **8 public-site checks passed**, including no Scout ARM control, workspace notification, intact Krisp controls, exact tested client bytes, denied unauthenticated/nonmaster access, and master-only automatic migration.
- Vercel inspection of `kidbuster.vercel.app` resolved to the new READY production deployment after promotion.
- Bounded post-release runtime scan found one error-level entry associated with the expected unauthenticated `401` probe: Node DEP0169 `url.parse()` deprecation output, not an application exception. Do not describe the log scan as completely empty. No new monitoring/drain configuration was changed.
- Full behavior, lost ACK/reload recovery, competing tabs, drafts typed mid-fetch, occupied report, active generation, account isolation and mobile layout were exercised with synthetic data in release browser tests.

No live transcript was leased, acknowledged, dismissed, ingested or consumed during deployment verification. No token was generated/rotated and no report was generated. The owner's connected browser upgrades to automatic mode on its first full session read after refresh. Live private-account transcript-to-notes rendering was not exercised during this deployment check; it must not be claimed from the public/authorization probes alone.

## User workflow

Refresh Pathfinder. Connected Scout now imports completed transcripts into empty notes without ARM/DISARM. Busy notes/report or active generation preserve the incoming lesson and show a waiting notice. Disconnect Scout stops the integration. Existing queue retention and capacity are unchanged.
