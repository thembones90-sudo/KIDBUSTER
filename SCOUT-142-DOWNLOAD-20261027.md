# Scout 1.4.2 repair download

Supersedes faulty 1.4.1 for the existing master-only pilot. Public release stays
disabled and all access gates are unchanged. Preserve the d2953db/f032c6c live
site lineage and the shared protocol geometry/menu fixes.

Desktop source: 5204626 in Scout integration worktree.
Fixes UnboundLocalError in _lim_snapshot and keeps the refresh heartbeat scheduled
after rendering failures; dark scrollable Audio & lessons pages replace the
white native table/tab presentation and clipped recovery actions.

- Source: 1011 tests OK, 1 skipped.
- Compiled EXE: 113 tests OK, including the new heartbeat failure regressions.
- CPU/media package verified.
- Installer: 117180530 bytes, unsigned.
- SHA256: 4af74d957ce2ac83055001c50211788f3956c8323e31ca62afd1a9a7dbdf4b05
- Private blob: releases/scout-1.4.2-owner-20261027/ScoutSetup.exe
- Full private download and exact download-handler signed URL both checksum verified.
- Website: all 117 test files passed (../scout142-web-tests.log).
- Installed via the normal versioned publisher with explicit owner authorization;
  shared profile and the ended lesson fragment remain intact. Runtime PID 19252
  was observed from the new 1.4.2 version directory; normal auto detection started
  a new recording after launch. No real readiness test was run.
- The desktop helper cannot target the borderless actual widget, so real-widget
  clicks/visual state were not independently verified. Synthetic details-window
  visual QA and frozen recording/UI regressions passed.

Rollback website deployment: dpl_4uJzn6qYWdL7FfX3hBr6UzDrLMKq.
