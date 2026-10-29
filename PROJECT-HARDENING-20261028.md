# Project hardening — 2026-10-28

## Step 1: production-runtime CI — completed

- Commit f1a636c: GitHub Actions now uses Node 24.x, matching package.json.
- npm ci replaces npm install; npm cache, read-only contents permission and
  15-minute job timeout are explicit.
- Clean committed export validated using Node v24.18.0 and npm ci.
- ALL 120 TEST FILES PASSED. Pushed to the release branch.
- Real GitHub run 40762807931 started against this exact commit; remote result
  is tracked separately from the successful Windows validation.

## Step 2: dependency advisory — completed and live

- Scope override: @vercel/cli-config -> zod 4.6.6.
- @vercel/blob remains 2.8.2; every unrelated locked version is unchanged.
- Production audit: zero vulnerabilities reported.
- Real CLI configuration schemas accept valid data and reject invalid data.
- Exact master-only Scout download handler successfully issued a scoped token;
  a bounded 32-byte private installer read returned the expected Windows header.
- ALL 120 TEST FILES PASSED after the clean patched install.
- CI now rejects high/critical production dependency advisories.

## Remaining sequence

3. Consistent transcript retention and storage-level expiry.
4. Signed Windows distribution: no usable local certificate exists; owner
   confirmed no certificate/cloud signing account yet. Tooling can be prepared,
   but verified publisher signing requires obtaining that credential.
5. Release storage capacity, current/rollback protection and recoverable archival.
6. Incremental modularization of large UI files under existing behavior locks.

No real lesson, customer account, email or payment was used in verification.

## Final verification for steps 1–2

- GitHub Actions run 40765947366 on commit 08640f9: SUCCESS.
  https://github.com/thembones90-sudo/KIDBUSTER/actions/runs/40765947366
- Real CI exposed previously hidden Linux assumptions: Windows-only browser
  paths, Windows-only absolute output-path validation and desktop-hover tests
  running in a browser without fine-pointer capabilities. These were corrected
  without changing the production UI or relaxing its animation contracts.
- CI uses runner Chrome and a private Xvfb desktop. Relative audit output paths
  remain forbidden. The sizing test measures the actual content viewport,
  including classic scrollbar width, as the production code already does.
- Runtime/dependency release source: 08fad4d; later commits through 08640f9
  change only CI/test files, excluded from deployment. No runtime work omitted.
- Staged candidate kidbuster-mf8ctb76u-thembones90-sudos-projects.vercel.app:
  exact bytes, five refusal probes and 24/24 smoke checks PASS.
- Promoted deployment: dpl_HXofzYN6HGrwVJ8Q7oLXETSknJLw.
- Classbuster.com and legacy webhook domain each passed the same exact-byte,
  additional refusal probes and 24/24 smoke checks after promotion.
- Web rollback: dpl_95DgJhi9rppmekDwGzX9owE5dn2v.
- Scout remains version 1.4.9; installer/source selection and recordings were
  not changed by these two website/CI hardening steps.

Step 3 is awaiting the owner's retention-scope choice: existing and new inbox
transcripts, or new arrivals only. No retention purge or policy change has run.
Owner confirmed no signing certificate/cloud signing account exists for step 4.
Steps 3–6 remain outstanding; do not describe the entire hardening plan as done.

## Step3 completed � 2026-10-29

New-arrivals-only twelve-hour policy is live. Existing records retain their
original retention. Independent absolute body expiry survives idle queues,
lease/move/retry and cleanup failures; bodies are removed after consumption
when no surviving queue copy needs them. Reader-aware rollback deployed first.
All123 local files and GitHub40843122444 pass. Candidate/live/legacy checks
pass. See STEP3-TRANSCRIPT-RETENTION-20261028.md for deployment IDs and limits.
Steps4�6 remain outstanding; owner has no signing credential yet.
