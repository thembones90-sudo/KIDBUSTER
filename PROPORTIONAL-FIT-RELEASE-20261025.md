# Original whole-page proportional fit — live

Owner explicitly requested that the complete original page scale uniformly to
the available browser screen, like a vector, with no page scrollbar. The original
centered layout is preserved. No secondary layout or stretched panel sizing is
introduced in this release.

Runtime commit: `947f02a` on `release/classbuster-legacy-safe-20261023`.
Exact archive: `.v2-tmp/deploy-947f02a`.
Deployment: `dpl_5VAp2wsDwcTTJPHX5eMfmrkhwE7n`, READY production.
URL: https://kidbuster-b4vfw2l53-thembones90-sudos-projects.vercel.app
Rollback: `dpl_5xc42UCfWnVw5JE8D2nhtpHj3kM1`.

`assets/fit-original.css` retains the original 1240px canvas and a small external
margin. `assets/fit-original.js` measures the canvas at its native size, then
applies the same scale to both axes, capped at 100%. It recomputes on browser
resize, content size changes and font readiness. A small rounding allowance
prevents single-pixel overflow. There is no overflow-hiding rule masking content.
Native popovers are moved outside the scaled canvas so their viewport positioning
and normal-size controls remain correct. Protocol, generation and account logic
are unchanged.

Verification:
- Clean full suite: all 117 test files passed.
- New proportional-fit contract: seven protocols at seven browser sizes, including
  1909x943 (the reported screen), 1366x650, 1280x600, 1024x768 and 390x844.
- Original geometry tests now distinguish intrinsic CSS dimensions from scaled
  screen dimensions; assertions for themes, native controls, keyboard selection,
  labels, containment and functionality remain. Real visible protocol cards replace
  direct clicks on hidden one-pixel radio inputs.
- Native popover and resize checks passed. Reset-animation tests explicitly drive
  real WAAPI phases rather than depending on wall-clock timing under system load;
  exit/entry appearance, single reset, interruption, focus and cleanup remain tested.
- Static/synthetic release integrity passed.
- Candidate: 24/24 plus five pairing/monitoring/identity-audit/cron refusal checks.
- After publication both public domains passed 24/24.
- Actual live Chrome tested all seven protocols at 1909x943 and 1366x650 with all
  four header controls visible. Document scroll width and height did not exceed
  the viewport at all. Horizontal and vertical scale ratios matched within .002.
- Live HTML, fit script and stylesheet matched the exact archive byte-for-byte.

Screenshots in the chat outputs: CLASSBUSTER-LIVE-PROPORTIONAL-1909.png and
CLASSBUSTER-LIVE-PROPORTIONAL-1366.png. Visual QA used synthetic browser state,
no account credentials or lesson data, and blocked API requests. No paid generation,
production data modifications or Scout installation was performed.

HTML SHA-256: `81d540baec3023f98c45889244bb0ea9be64a287d0373cd1e5feb2206306585a`.
JS SHA-256: `d041c69256b92212cf29d0e7295efb6780459dcc2d167918a21f9da9e03a92e5`.
CSS SHA-256: `cdbc36e4646b21f88d520efa0482e3f1f9e5ec2ead107c0ef409b0f7f69599ad`.
