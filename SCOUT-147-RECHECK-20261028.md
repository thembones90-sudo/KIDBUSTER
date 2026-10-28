# Scout 1.4.7 recheck release

The recheck found independent web production work at 2a5eb5d and a selected
Scout 1.4.6-r3 build. Production lineage was merged into the canonical release
branch; its read-only scout-receipt review path and review-exit behavior remain.
The rejected 1.4.6 reconstruction was prevented from replacing the still-running
1.4.5. The corrected build is based on recovered exact 1.4.5 source, preserving
the manual input/output/position lock and separation of delivery from recorder
status. The legacy results window is not used for its receipt action.

- Desktop source c7e727d; full source suite 1039 tests, one skipped, PASS.
- Compiled executable suite 163 tests, PASS; CPU/media package PASS.
- Read-only installed 1.4.5 comparison: audio_capture, gui, scout_reliability,
  settings and lesson_flow unchanged.
- Private installer version 1.4.7, 117180443 bytes.
- SHA256 741e428ba4992ed5c7e571b1012b6988c2c7925177740a43d0590e1749b6b24f.
- Private path releases/scout-1.4.7-owner-20261028/ScoutSetup.exe.
- Upload, complete download checksum and exact authorized download handler
  using synthetic identity/real private storage: PASS.
- Final web suite: ALL 120 TEST FILES PASSED.
- Release integrity gate: PASS.

The server acknowledgement now includes only the conservative stored-record
student label. Duplicate retries use the original stored record, not a changed
retry payload. Desktop names remain in memory only, scoped to the device token.
The receipt is exposed only after durable SENT and revalidated at click time.
The browser link never imports, acknowledges, dismisses or generates reports.

Owner-only download restrictions remain. No temporary upload endpoint is added.
Twelve-hour retention is excluded pending the requested review. There is no new
remote updater: installed-version handover continues only when idle.

Pre-release rollback web deployment: dpl_8duu2zkpEpUtoPcuyHJZgKrVnKWx.
Candidate, live checks and installation outcome are recorded after verification.
