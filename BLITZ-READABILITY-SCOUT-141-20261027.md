# Owner-authorized readability repair and Scout 1.4.1 publication

## Scope

- Preserve current production lineage d33c151 / runtime a5c3d8b, including static
  LingoAce ratings, all seven protocol prompts and customer authentication.
- All protocols retain the same Classic panel geometry. Desktop height fitting
  stops at 80% (width fitting can require less); short windows scroll normally.
  Narrow screens use the existing stacked layout at native scale.
- Header menu open/close no longer removes/reapplies workspace scaling. Native
  popovers live outside the zoomed workspace so their hit targets remain full size.
- Blitz Voice is an accessible in-page menu backed by the original select value,
  draft persistence, form serialization and protocol handler. No prompt changes.

## Scout current private installer

Explicit owner instruction on 2026-10-27: publish 1.4.1 as current. Master-only
authorization and public release unavailable state remain unchanged.

- Source commit: 6ae15cbd88a1ded0446741d67f56df0acc2a3627
- Build: scout-1.4.1-rc1-20261026
- Blob: releases/scout-1.4.1-owner-20261027/ScoutSetup.exe
- Bytes: 116568848
- SHA256: aa0ce0099bb324014d610f8d510c7455d0d31872d6459be7ab8111f0de75d910
- Private upload followed by a full downloaded-byte/hash comparison: PASS.
- Authenticode: NotSigned. Native install/repair/upgrade/rollback acceptance has
  not been completed; publication is explicitly owner-authorized despite that.
- Installed/running desktop Scout was not stopped, replaced or restarted.

## Regression and release evidence

`test-initial-workspace-fit.cjs`: seven protocols at seven viewport sizes,
identical outer geometry, readable scale, rating 6 stability, synchronous and
settled menu-click stability, mouse/keyboard Blitz Voice selection, repeated
generation, Account and New Student behavior.

Full suite log: ../blitz-readable-release-tests.log (local evidence, not deployed).
Result: ALL 117 TEST FILES PASSED. Release integrity gate passed. All Blitz
protocol/archetype/voice tests passed; index changes are asset references only.
Protected candidate and live smoke checks are recorded in the follow-up release
receipt after promotion. No real customer reports/emails/payments are test data.

Previous production rollback: dpl_CPrcefoSXDL6F37iv7niPKHgUVb3.
