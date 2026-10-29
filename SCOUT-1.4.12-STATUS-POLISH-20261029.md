# Scout 1.4.12 status polish — 2026-10-29

Owner requested implementation of the approved wording/color scheme. Native Scout1.4.12 is installed and running (PID36908), with1.4.11 retained for rollback. Source49f2338 + evidence9d6a73e are pushed to the private continuity repository, branch codex/scout-status-polish-20261029. All1836 installed program files were hash-compared; profile untouched, guarded idle handover, no force-stop.

Both views now show Ready with a sage indicator, neutral Auto-detect on/Manual start hints and no ordinary idle yellow. Recording is red; testing/finishing/transcription blue; queued delivery muted blue-gray; confirmed Sent to Classbuster green. Untested/silent inputs neutral; unavailable devices amber and recording failures red. Redundant Ready for next class removed. Capture, manual sources/placement, sender/ACK rules and1.4.11 morph/timer changes preserved.

Verification:1062 source tests (one skip),180 frozen tests and CPU/media package checks passed. Synthetic GUI tests used a never-activated Windows desktop; no microphone or real lesson used. Native-context checks passed after initial sandbox-only executable/desktop access failures.

Installer built successfully from a short source/package path after compiler errors on the long worktree path. All1836 short-path package inputs hash-match the verified package. Installer117199371 bytes, SHA2569526fd153b7545c4bbdc5b1e12cee2032906c113a919aa23898fd978d5cd71dc. Private Blob upload followed capacity preflight and a complete downloaded checksum comparison. Exact handler tested with a synthetic master identity and real scoped URL; no real owner key used or printed. Public download stays unpublished; master-only private gate preserved. Signing remains unavailable.

Storage: obsolete1.2.0 software installer was archived durably with checksum receipt before removal from private release storage. No lesson data was touched. Current1.4.12, rollback1.4.10;1.4.9/1.4.8/1.4.7 remain protected.

Web runtime656394f is based on the existing release branch after d15ed23/5155acc; preserves Redis/Krisp polling and outage navigation repair. Staged deployment dpl_Cx18ZhpSBAosFwobEgszgttZH2bT passed exact committed assets and24/24 smoke checks. Local website run:127 files pass; test-scout-inbox-first timed out waiting for its primary fixture and passed unchanged on isolated repetition. Independent CI and final promotion results follow below.

Rollback website: dpl_8zGNr5WFS1Y9XpR6jYhtsEqVJtKA.

Final verification: browser fixture-only follow-up389a75c uses keyboard activation through the real appearance control to avoid modal snapshot interception, and explicitly foregrounds the primary inbox page because hidden pages intentionally do not poll. All assertions retained; no product behavior changed. Complete local rerun passes ALL128 files. GitHub40957551052 passes on389a75c. Candidate runtime656394f and389a75c have identical production assets/API files; follow-up changes tests only.

Promotion complete: dpl_Cx18ZhpSBAosFwobEgszgttZH2bT is live on Classbuster and legacy webhook domain. Each passes exact committed asset comparisons and24/24 smoke probes. Private download now1.4.12. Native current/running1.4.12 confirmed; prior1.4.11 remains installed rollback. Website rollback remains dpl_8zGNr5WFS1Y9XpR6jYhtsEqVJtKA. Real owner report generation and hardware audio testing were not repeated for this presentation-only update.
