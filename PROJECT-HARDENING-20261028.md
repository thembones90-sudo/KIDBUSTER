# Project hardening — 2026-10-28

## Step 1: production-runtime CI — completed

- Commit f1a636c: GitHub Actions now uses Node 24.x, matching package.json.
- npm ci replaces npm install; npm cache, read-only contents permission and
  15-minute job timeout are explicit.
- Clean committed export validated using Node v24.18.0 and npm ci.
- ALL 120 TEST FILES PASSED. Pushed to the release branch.
- Real GitHub run 40762807931 started against this exact commit; remote result
  is tracked separately from the successful Windows validation.

## Step 2: dependency advisory — verified, publication pending

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
