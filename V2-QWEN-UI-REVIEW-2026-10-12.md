# Pathfinder V2 | Qwen 30B UI audit, reviewed
Date: 2026-10-12 | Branch: pathfinder-v2 | Local only. No production/push/deployment changes.

## Execution and scope
- Model: `qwen3-coder:30b` locally served through Ollama (Q4_K_M, 8,192-token review context).
- Input: selected line-numbered current `index.html` excerpts covering the V2 experience bar, account controls, Help and signup.
- Model did not edit source or run browser tests. Raw model response: `A:\AI ENGINE\QWEN AGENT\work\PATHFINDER-30B-V2-UX-REVIEW.json`.
- Independent reviewer verified claims directly in V2 source. Do not blindly copy model severity or its line references.

## Verified finding and implemented correction
- `index.html` Help screen previously said **20 Classic reports/month** even though the signup experience said **5** and product rule is **5**.
- Minimal correction: Help copy now says **5**. Correct Free signup text and protocol selectors preserved.
- Added `tests/test-customer-copy.cjs` to reject the stale number, assert the Free modal, email verification message and seven protocol selectors.
- Full `npm test`: **33/33 test files passed** on SKYNET after the edit (browser smoke included). The local/live smoke file may SKIP external live integration; passing suite is not staging proof.

## Rejected or unverified suggestions
1. **Reject:** Qwen proposed changing the `Classic` header mode badge to `Free`. It is a reporting protocol label, not a subscription tier, and its recommendation confuses two different concepts.
2. **Unverified UX hypothesis:** Upgrade CTA may be hard for a first-time visitor to notice. Requires usability test or browser inspection; do not relocate paid controls on model advice alone.
3. **Unverified accessibility hypothesis:** Protocol selector colors and keyboard focus might require improvement. Radio controls are labeled and decorative icons are aria-hidden; independently measure contrast/focus and test keyboard/screen reader behavior before changing semantics.
4. **Source limitations:** This task did not evaluate real traffic or conversion, billing functionality, or actual mobile screenshots. It is not a complete visual acceptance test.

## Next independent UI task
Run focused browser/keyboard checks at 390px, 768px and 1280px, using a synthetic demo user only. Audit first Free CTA visibility, tab/focus flow, protocol tooltip accessibility, typography sizes and the Generate button at default/125% zoom. Capture reproducible measurements and propose the smallest valid improvements. Avoid concurrent edits to API, Codex security/billing work and production. Separately plan the public marketing landing page with anonymized demonstration and accurate $12/month messaging.

## Follow-up: real Chromium layout defect and fix
- Actual computed typography was measured in Chrome at 390/768/1280px, not inferred from CSS alone. Onboarding step-detail was 10.5px, label 12px, intro copy 11px (and small mobile brand copy).
- **Confirmed tablet overflow:** at 768px, document scrollWidth was 920–930px against 768px client width. Element scrollWidth tracing isolated `.protocol-select` (891px internal scroll content), despite its flex-wrap being active.
- Root cause: absolutely positioned `.info-icon::after` tooltips use width:max-content and left:0. Invisible opacity-zero pseudo-elements still contributed to horizontal overflow when icons were near the right edge.
- Fixed tooltip layout for 561–980px with a fixed, right-inset viewport-bounded tooltip. Existing <=560px phone tooltip arrangement remains intact; no protocol semantics changed.
- Enlarged onboarding copy, step labels and details to 13px. Brand promise now 13px desktop/tablet and 12.5px mobile.
- New Chrome checks in `tests/test-browser-smoke.cjs`: no overflow at 768, 900 and 980px; all three step text sizes >=13px. Existing 390px mobile check retained.
- Before 768px scrollWidth: 920–930px. After: 768px. Local run: **all 33 test files passed**. Chromium measurement JSON lives in `A:\AI ENGINE\QWEN AGENT\work\PATHFINDER-UX-COMPUTED-MEASUREMENTS.json`, generated only on A:.
- This issue was found by independent Chromium checks following Qwen's UI review; don't attribute the specific tooltip root-cause discovery to Qwen, which did not identify it.
