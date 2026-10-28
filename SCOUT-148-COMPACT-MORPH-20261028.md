# Scout 1.4.8 compact morph

Owner approved the compact morph: 260 ms in either direction, secondary controls
fade first, shared logo/status/waveforms move to their destination, then native
controls return. Recording and manual device/position policy are unchanged.
Reduce motion stays instant. Reversals start from the current frame; close,
minimize and external window destruction cancel pending callbacks. Render errors
fall back to the complete native destination. No desktop capture or real audio
is used by the renderer or its synthetic tests.

- Desktop runtime source a90de85; later changes adjust existing synthetic
  contracts to inspect the settled destination and wait for native test placement.
- Build scout-1.4.8-compact-morph-20261028-r2.
- CPU/media package verification PASS; 170 frozen executable checks PASS.
- Private installer 1.4.8, 117204408 bytes.
- SHA256 439e24d54b250be9eeefceaf97b2036f51d9845a72eebf57d40306d6d41d6d57.
- Private object releases/scout-1.4.8-owner-20261028/ScoutSetup.exe.
- Upload, full downloaded checksum and exact owner download handler PASS.
- Full website suite: ALL 120 TEST FILES PASSED. Owner download and release
  integrity gates passed after the client cache-tag update.

The first full desktop run exposed assumptions that view changes were instant;
settled layout/control contracts now finish the transition explicitly, with seven
separate animation/lifecycle tests covering real intermediate frames. Transparent
test windows also produced a Windows native-placement artifact. Native dropdown
tests passed on a separate Windows desktop that is never activated or shown;
the final complete source suite is run there too. No user desktop interaction,
recording, lesson data or production customer report is used for verification.

Pre-release web rollback dpl_9vaEYfvwLc1z7LXorNLxYpa38keQ; desktop rollback
1.4.7. Candidate/live checks and the final source-suite result follow publication.
