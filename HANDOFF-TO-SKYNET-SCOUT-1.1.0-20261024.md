# Handoff to Skynet — Scout 1.1.0 (live transcription) — 2026-10-24

From Claude. Read this before touching Scout, the Scout download, or production.

## 1. What happened

**Problem the owner reported:** Scout took minutes to process a lesson; Krisp takes ~10 s.
Cause: Scout transcribed both full tracks only after the lesson ended, on the CPU, uncapped.

**What was built (Scout repo `A:\RADAR VAN`, commits `9bff863`, `1a5116f`, pushed to
`thembones90-sudo/classbuster-scout`):**
- `radar_van/pc_profile.py` — per-PC plan. A one-minute scan (Windows voice reads a sample,
  real models are timed) picks the most accurate model that runs >= 8x real time within half
  the physical cores (max 4 threads). Rescans on hardware/rule change or Settings > Re-check
  this PC; slow/lagging lessons step it down. Saved as `pc_profile.json` inside the profile.
- `radar_van/live_transcription.py` — transcribes 30-90 s pieces during the lesson (cut at the
  quietest moment) from the growing WAVs into `live_transcript.json` with a SHA-256 per piece.
  At the end only the tail is transcribed; any fingerprint mismatch falls back to the old full
  pass. On in frozen builds; `CLASSBUSTER_LIVE_TRANSCRIPTION=0` disables it.
- 836 Scout tests pass (34 new), package verified, 63 frozen checks pass.

**Real lessons today (owner's PC):** transcript ready 95 s and 75 s after the lesson with the
old Scout; **1 s and 3 s** with 1.1.0. All delivered. Live work ran at 19-56x real time,
never fell behind, never skipped.

**Installation found broken and fixed (owner approved):**
- The 1.0.0 `ScoutSetup.exe` had been run **from inside Codex**. Codex is an MSIX app, so
  Windows virtualized the "per-user install" to
  `%LOCALAPPDATA%\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\Classbuster Scout\`.
  The real `%LOCALAPPDATA%\Classbuster Scout` did not exist; the Start menu shortcut pointed
  nowhere; the Startup shortcut still launched the A-drive build. The note
  `SCOUT-INSTALLER-RELEASE-20261024.md` describes an install that was in fact virtualized.
- Now: `scout-1.1.0-live` is installed in the real `%LOCALAPPDATA%\Classbuster Scout`
  (profile copied with `publish_scout.py --import-profile`, 50/50 files verified). Start menu
  and Startup shortcuts point to it. It is running and processing real lessons.
- Old copies (Codex-virtualized 1.0.0 and A-drive zz6) are untouched backups.
- **Never run installers or Scout tooling from inside Codex.** To find the real Scout, use
  psutil on the running `Scout.exe` from an unsandboxed process.

**Website (`A:\CLASSBUSTER-LEGACY-LIVE-RELEASE-20261023`):** commit `0d31915` (on top of live
`45be673`) points the owner-only download at `releases/scout-1.1.0-live/ScoutSetup.exe`,
SHA-256 `eb16045dfa3af3dc002e498f30c59f80b4afaa93aa53f50a59ec0bfdaee03b81`, version 1.1.0,
client cache tag `20261024-scout-110`. 113/113 test files pass. **Not deployed.**

## 2. What needs to be done

1. **Upload the installer (owner).** Claude may not read the Blob write token, so the owner runs,
   in their own PowerShell:
   `vercel blob put A:\ScoutSetup-1.1.0.exe --pathname releases/scout-1.1.0-live/ScoutSetup.exe
   --access private --multipart true --rw-token <BLOB_READ_WRITE_TOKEN>`
   Source: `A:\RADAR VAN\phase10c_work\scout-installer-1.1.0\ScoutSetup.exe` (copy at
   `A:\ScoutSetup-1.1.0.exe`, same hash). Do not replace or delete the 1.0.0 artifact.
2. **Confirm the upload.** `vercel blob list-stores` in a linked folder should show
   `classbuster-scout-private` with one more file (was 3 files, 285.1 MB).
3. **Release the website change.** Only after step 2: `git archive 0d31915` (or a later commit
   that contains it) into `.v2-tmp`, `vercel deploy --prod --skip-domain`, candidate smoke and
   probes, promote, then verify classbuster.com and kidbuster.vercel.app. The owner has
   approved this release. Owner then clicks Download Scout to confirm the file and hash.
4. **Installer test.** Install, repair and uninstall into an isolated folder, as done for
   1.0.0. The installer refuses while any `Scout.exe` runs, so do it **only between lessons**
   (lessons seem to start every 30 min, :29 and :59) and restart the owner's Scout afterwards
   from the Start menu shortcut.
5. **Optional cleanup, with the owner's OK:** remove the Codex-virtualized 1.0.0 install and the
   A-drive autostart leftovers once 1.1.0 has run for a day. Two short 08:00 test recordings
   are `paused_auth` (Settings > Retry pending lessons).
6. **Later (not started):** graphics-card (CUDA) package downloaded only on NVIDIA PCs, and
   an anonymous speed report. The owner's speaker output is 7.1 surround (8 channels, ~1 GB
   per lesson); switching Windows output to stereo would shrink recordings about 4x.

## Rules that still apply
Scout stays owner-only; no public download. No production secrets read by agents. Deploy only
from a clean commit export. Never close Scout during a lesson. Never copy profiles by hand.
