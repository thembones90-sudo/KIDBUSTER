# Scout 1.4.18 — visible skin choices, 6 November 2026

Owner found the 1.4.17 dropdown indistinguishable from a label. Settings now has a bold **Choose skin** heading followed by three permanently visible, one-click options: **Scout**, **Bloom**, **Toxin**. Preview colors distinguish the options; the active skin has a checkmark and accent border. Switching updates the open dialog and both Scout views, saves the existing appearance preference, and never calls recording commands. The compact dropdown has been removed. This changes no audio, retry, delivery, model acquisition, manual device selection or position logic.

Native runtime: `80ac704` on private branch `codex/scout-clear-skin-choices-20261106`, based on cumulative1.4.17 source4b8635f. App and installer metadata consistently report1.4.18. Build and tests used isolated QA directories, not an installed profile. The running Scout was not stopped, upgraded or restarted.

Validation of final source/build:
- Complete source suite: **1188 tests, OK (1 skipped)**.
- Standard regressions extracted from the actual frozen executable: **259 passed**.
- Additional Settings/skin tests extracted from the packaged executable: **8 passed**, including visible choices, real button invocation, selected state, palette refresh, persisted appearance, and no recording commands.
- Program-only CPU/media package verification passed before installer compilation.
- Initial draft testing exposed a mapping assertion before Tk processed its map events and a Windows text-encoding conversion. The assertion now waits for Tk update; UTF-8 text was restored. Those draft runs/builds were stopped; final source was fully retested and rebuilt in separate corrected directories. Only the final artifact below was published.

Published using the mandatory combined `publish-scout-and-site.mjs publish` path. It verified the native/installer identity, published GitHub, ran all141 website test files and integrity checks, committed manifest98ffa9d, enforced newest native release and live ancestry at staging/promotion, verified the protected production candidate, promoted and independently verified production manifest equality. No direct deployment/alias shortcut was used.

Live deployment: `dpl_E1c2FQnYM9qrPbqH8MJYWPaPQ9HR`, URL `https://kidbuster-h6t03zw4o-thembones90-sudos-projects.vercel.app`, runtime manifest commit `98ffa9d`. Prior deployment: `dpl_5qA2VL9p1GsMKs4bAAoSinBhXVRX`.

Public installer: `https://github.com/thembones90-sudo/KIDBUSTER/releases/download/scout-1.4.18/ScoutSetup.exe`.

Independent complete public download: HTTP200, **117222926 bytes**, SHA256 **07ccd6afd826f53949da51e22e86675565068562a2269ac8c9bc9ce15ec0ee8e**. Rehashed bytes match GitHub's asset digest, local build receipt and the actual live Classbuster manifest. Installer remains unsigned under the prior owner decision.

Candidate and production smoke:26/26 each. Legacy integration domain:26/26. Independent live browser checks at1440px and390px confirm Account now reads “Scout1.4.18 · Windows · Included with Pro” with normal spacing, using the real manifest; Download Scout remains available. No new real purchase, email sign-in, physical audio class or customer upgrade was performed for this UI change.

Existing1.4.17 installations receive the change only after applying1.4.18. Never interrupt an active lesson to install it.
