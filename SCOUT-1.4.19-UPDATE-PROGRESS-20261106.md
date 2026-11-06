# Scout 1.4.19 — update progress and completion

Owner requested visible progress after clicking an update and a notification when it finishes. Published cumulatively on the 1.4.18 visible-skin/recovery line; native runtime **3dcf4ef**, branch `codex/scout-update-progress-20261106`.

## Behavior

- Update opens a themed progress window and downloads inside Scout, with actual received-byte progress or an indeterminate bar when the server supplies no size.
- Downloads are bounded by time, size, redirects and official GitHub asset hosts. No customer credentials or lesson data accompany requests. A SHA256 match is required before a ready-to-install path is exposed. Cancel/error removes only the owned software cache.
- “Download verified. Ready to install” is deliberately distinct from update completion. Install and restart becomes available only after verification and while Scout is idle. A class starting hides the progress window and blocks installation.
- The bundled Windows helper waits for the guarded Scout process to exit, rechecks the installer bytes under a read lock, runs Setup's real installation progress window, checks the activated executable's version, writes a receipt, and launches Scout. It never kills Scout. If the close gate declines, only our own waiting helper is terminated and the app/lesson remain running.
- Installer tasks preserve existing startup and desktop-shortcut choices. Profiles/lessons are untouched.
- The restarted app consumes the receipt and shows a themed success message only when the running version matches the target. Setup/checksum errors restart the existing app and report failure instead of success.
- Copies older than1.4.19 must install this version once through their previous browser/installer flow. The integrated experience is available from1.4.19 onward. No existing user Scout was restarted or installed during this task.

## Verification

- Final complete native suite: **1204 tests, OK (1 skipped)**.
- Final frozen application checks: **260 passed**.
- Packaged updater/Python and exact bundled helper: **15 passed**. Real synthetic installer executables exercise successful activation/restart, a tampered file that never executes, and failed Setup that preserves the old pointer and profile. Real customer Setup was not run because installed Scout must not be interrupted.
- Real Tk progress tests cover received percentages, disabled install until verified-ready, busy lesson gating, and progress text that never claims completion during download.
- Program-only CPU/media package passed verification before installer compilation. New helper is bundled inside `_internal/ScoutUpdateRunner.exe`.
- Public installer HTTP200, **117274057 bytes**, SHA256 **3fc8a2738389dacf5014517c9abefc68aa717e628884fe935ec20d2bae489aa3**. Complete public download was independently hashed and matches the build receipt, GitHub digest and actual live manifest. Existing unsigned-distribution owner decision remains.

## Website publication

Used mandatory combined publish/sync and guarded stage/promote. Full website rerun: **141 test files passed**; candidate/live/legacy smoke: **26/26 each**. Independent actual live desktop/mobile checks show “Scout1.4.19 · Windows · Included with Pro” (with normal spacing) and retained Download Scout controls.

Initial website gate stopped on test-scout-delivery-link's popover timeout. It passed in isolation. Receipt auto-open requires a visible tab; the private browser fixture now explicitly brings its page forward, preserving every original assertion. A complete rerun then passed before promotion. No production receipt/import behavior was changed.

Live runtime **23f21ef**, deployment **dpl_Fwwx3GyYBP9miSn6bo4pi8PxwFpj**, URL `https://kidbuster-ojrz6fktm-thembones90-sudos-projects.vercel.app`. Rollback prior deployment: `dpl_E1c2FQnYM9qrPbqH8MJYWPaPQ9HR`. Latest-native and live-ancestry guards passed at stage and promotion; the combined tool independently confirmed the actual public manifest.

Future native releases must contain3dcf4ef (update progress) and80ac704 (visible skin choices), as well as the earlier1.4.16 recovery baseline. Do not build a higher version from the older morph/retry worktree and drop these changes.
