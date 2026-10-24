# Scout 1.2.0 download — release ready, waiting for upload — 2026-10-24

From Claude. **Next website release must be built from `integration/scout-installer-privacy-v3`
(`b51c110`, pushed), not from a side branch or an older snapshot.**

- `b51c110` = release branch tip `5148ca5` merged with live `c566e5e` (card parity, logos,
  Classic Medium). Only conflict: client cache tag (now `20261024-scout-120`). 114/114 tests.
- Owner-only download points to `releases/scout-1.2.0/ScoutSetup.exe`, version 1.2.0,
  116,500,482 bytes, SHA-256 `31c537daf8c90e67a68e8eb2f6db602741b4ec6eb6c6fa08bd351d3870a66765`.
  Built from the installed privacy build (`scout-delivery-privacy-v3-20261024`) plus the fixed
  `ScoutLauncher.exe` (Scout commit `734b629`).
- Isolated install / repair / uninstall test passed 15/15 on the real PC between lessons
  (`A:\RADAR VAN\phase10c_work\installer-test-privacy-v3.ps1`). The installer writes the Start
  menu shortcut even with `/NOICONS` and uninstall removes it: back up and restore shortcuts in
  any future test. No registry leftovers.

## Remaining
1. **Owner uploads** `A:\ScoutSetup-1.2.0.exe` (same hash) in their own PowerShell:
   `vercel blob put A:\ScoutSetup-1.2.0.exe --pathname releases/scout-1.2.0/ScoutSetup.exe
   --access private --multipart true --rw-token <BLOB_READ_WRITE_TOKEN>`
2. Confirm: `vercel blob list-stores` shows `classbuster-scout-private` at 5 files.
3. Deploy `b51c110` from a clean `git archive`, smoke + probes, promote (owner approved), verify
   both domains. Then fast-forward `release/classbuster-legacy-safe-20261023` to it once the
   canonical checkout's uncommitted Classic work is committed or moved (not done while it is
   in progress).
