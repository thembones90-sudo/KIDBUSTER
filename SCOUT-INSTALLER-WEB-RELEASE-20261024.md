# ScoutSetup.exe download live — 2026-10-24

The owner requested a normal Windows installer and Scout branding. Canonical
download integration commit: `5ca97f0`. To respect the explicit protocol release
hold, published clean safe commit `bd1eb0e` (approved `ac96efd` baseline plus inbox
styling and installer patches), not the canonical checkout's ongoing protocol
changes. All later protocol/benchmark edits remain preserved in the checkout.

Production: `dpl_36LXAuGs97aBjR9oXUZ4nNFP9RJc` on classbuster.com.
Rollback: `dpl_ATRos17RwKdy4ZVYbdtLfAVtMzb5`.
Release integrity, all 109 test files, 24 live checks per hostname, five extra
candidate refusal probes and exact live client hash passed. Anonymous/nonowner
downloads remain forbidden. Public Scout release manifest remains unpublished.

Private artifact: `releases/scout-1.0.0-20261024/ScoutSetup.exe` (77,375,244 bytes),
SHA-256 `cde12397d764d857d7929b30cc97392ab33d897797e3472245b0f688b24ea7a7`.
Actual private download via tested handler matched the full artifact hash/size.
No customer database writes, emails, checkouts or real lessons used in tests.

Desktop source report: `A:\RADAR VAN\SCOUT-INSTALLER-RELEASE-20261024.md`.
Owner separately approved local installation/profile copy; 20 profile files
matched hashes and the original ZIP profile stayed intact. New Scout.exe process
was running and responsive at the per-user installed path. Installer is unsigned;
no publisher certificate configured. Existing internal legacy module names are
retained for data compatibility, not shown as the app's executable/product name.

The source change is integrated into the canonical release line as well, so a
later authorized canonical deployment retains the installer download. Do not
promote unapproved protocol work merely to include this release documentation.
