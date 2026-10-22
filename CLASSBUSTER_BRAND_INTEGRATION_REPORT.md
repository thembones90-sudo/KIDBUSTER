# Classbuster Brand Integration Report
Date: 2026-10-22
Workspace: C:\Users\user\Documents\CLASSBUSTER-WORK
Branch: feature/classbuster-brand-migration

## Scope
Integrated the supplied Classbuster Brand Transition Kit into the existing GitHub-main application clone. This is NOT the newer production source on Leviathan. No production deployment, data migration, or customer-account changes were made.

## Implementation
- Installed 42 supplied branding assets under assets/brand/classbuster/.
- Applied the approved raster horizontal logo across the existing seven protocols, page title, metadata, favicons, and legal pages.
- Added a mobile tooltip overflow fix.
- Updated brand-specific browser/live smoke tests and added tests/test-classbuster-brand.cjs and tests/fixtures/classbuster-brand-sha256.json.
- Updated CI Node version to 24.x and npm install to npm ci.
- Updated visible licensing copy from Pathfinder Pro to Classbuster Pro without changing entitlement logic.
- The kit includes interpretation-only SVGs; do not use them as approved display art.
- site.webmanifest differs from the original archive because the app-specific manifest was configured. All other installed kit files match the archive.

## Verification
- Full local npm test output: work/brand-regression-results.txt; result ALL 22 TEST FILES PASSED. Production-only live test is skipped by default.
- Focused branding checks: work/brand-focused-results.txt; passed.
- Local live-style smoke: work/brand-local-live-results.txt; passed.
- Asset check: node work/brand-final-audit.cjs verified 42 assets, with only site.webmanifest changed from source archive.
- Storage-key declaration comparison against before-brand-index.html: unchanged.
- git diff --check: passed.
- Screenshots: work/brand-before-1440.png, work/brand-before-390.png; do not confuse work/classbuster.com-*.png (old production snapshots) with post-brand local screenshots. The brand tests produce screenshots in their configured output location if retained.

## Production release blocked
The public Vercel application has newer source code missing from this GitHub main clone. Leviathan's A:\PATHFINDER V2 contains newer local changes which must be reconciled before production release. Existing customers' origin-scoped browser data cannot automatically transfer from kidbuster.vercel.app to classbuster.com. Owner-only Scout permissions need server-side checks for ordinary paid and owner accounts. Payments/webhooks and customer continuity require verification.

Domain DNS, HTTPS, and www redirect were separately verified working by Codex in its migration report. This branding branch has not been deployed. Preserve kidbuster.vercel.app and existing data.

## Release rule
Do not deploy this clone over the newer production system. Recover or compare the newer source, merge approved branding selectively, run full production-equivalent tests and checkout/webhook checks, then release with a rollback plan. Do not push or overwrite an existing branch without review.
