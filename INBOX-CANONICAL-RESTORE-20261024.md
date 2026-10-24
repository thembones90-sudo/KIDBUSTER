# Inbox redesign restored to canonical release — 2026-10-24

Cause: the previous design deployment came from a side branch; later canonical
releases did not contain it and reintroduced the original green/serif panel.

Resolution: commit `1a03099` on `release/classbuster-legacy-safe-20261023` restores
the approved `9150d56` inbox-only change atop the latest committed release
`67d010e`. Pushed the exact commit to that canonical GitHub branch and verified
the remote ref. Added a refusal/read-only release-smoke check that fails for
superseded markup, serif fonts or missing compact granite styling.

Unrelated in-progress protocol edits in index.html and its new lesson-essence
test were not staged, committed or deployed. Their diff content was checked
against a pre-integration snapshot. Existing monitoring, domain forwarding,
owner-only Scout gates and current protocol rules remain in the exported release.

Built from clean `git archive` export `.v2-tmp/deploy-1a03099`, not the dirty
working folder. Release-integrity gate passed; **all 109 test files passed**.
Candidate exact stylesheet hash matched source; **24/24 live smoke checks passed**,
plus five refusal-only migration, pairing, owner-activity and cron probes.
An initial probe expected 403 for anonymous pairing; source contract is 401,
which was confirmed. No account/customer writes or emails were performed.

Promoted deployment `dpl_DFpZKiduTj3riTRH12UhuUi74x9h`:
https://kidbuster-jhmo2v44i-thembones90-sudos-projects.vercel.app
Rollback recorded before promotion: `dpl_FayNFSzKvPMtzR5ivnB1jRjTmi3f`.

After promotion, **24/24 smoke checks passed on each public hostname**:
classbuster.com and kidbuster.vercel.app. On both, the inbox stylesheet SHA-256
matched the clean release and contained no Georgia font. Public Scout download
remains unpublished. The previous authenticated visual/report checks are recorded
on the inbox branch; this restoration made no new live generation request.

Local evidence: `.v2-tmp/inbox-canonical-1a03099-tests.log`,
`.v2-tmp/inbox-canonical-smoke-20261024.mjs`,
`.v2-tmp/preexisting-before-inbox-20261024.patch`.
