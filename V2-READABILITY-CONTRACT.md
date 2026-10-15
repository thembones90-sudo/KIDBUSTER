# PATHFINDER V2 — Readability and Visibility Acceptance Contract
Owner mandate, October 12, 2026. Applies to every V2 surface: marketing, onboarding, account/payments, 7 protocol modes, Krisp, editing workspace, reports and all modals.

## Release-blocking behavior
- All user-facing information and actions must be fully visible: no clipped native controls, offscreen buttons, overlapping labels, inaccessible hover-only information, obstructive fixed bars, or unintended horizontal page scrolling.
- Audit viewport widths **320, 360, 390, 430, 768, 900, 980, 1024, 1280, 1440, 1920px**; include narrow laptop/tablet landscape, not only 390px phones.
- Audit browser zoom **100%, 125%, 150%, 200%** with correct viewport/zoom semantics, including mobile text scaling. Use actual Chrome screenshots and measurements. Document any unavoidable scroll containers and prove their affordances are visible.
- Aim for **16px primary body/instructional text**; generally keep meaningful secondary text >=14px. Small decorative metadata may be 12-13px only where functionally justified, visibly legible and high contrast. Never shrink text to make broken layout fit. These are local design goals, not claims that a given pixel size guarantees accessibility.
- Controls should have >=44x44 CSS-pixel comfortable targets where feasible. Keyboard navigation, focus indicators, functional tooltips via hover/focus and accessible names are required.
- Check WCAG 2.2 AA contrast targets: >=4.5:1 for normal text, >=3:1 for large text and meaningful UI boundaries, with documented exceptions as appropriate.
- Validate long teacher/student names, long report text, protocol variants, validation errors, billing errors, free/pro states, empty states, and multiline labels. Avoid truncating critical content.
- Keep native operational elements completely visible rather than sacrificing workspace function for promotional sections. Marketing and workspace are distinct surfaces.
- Preserve all protocol colors/theme variables (`--toxin-rgb`), nested Generate `.btn-label`, workflow semantics and persistent Krisp ARM.
- Maintain automated multi-viewport overflow/legibility assertions and targeted visual/keyboard regression checks. Passing only unit tests or CSS inspection is not enough. Log real browser measurements and review screenshots.
- Testing cannot certify perfect readability for every human; real novice-teacher trials, screen readers and manual visual review remain required release gates.

## Confirmed progress
- 2026-10-12: fixed Help copy from obsolete 20 to **5** Free Classic reports; protected by `tests/test-customer-copy.cjs`.
- 2026-10-12: Chrome identified protocol-tooltip horizontal overflow at 768px; fixed responsive tooltip placement, confirmed 768px scroll width = viewport width; increased experience-bar instruction labels/details to 13px (an initial improvement, **not final compliance**).
- V2 full regression after change: 33/33 test files passed, including added 768/900/980px overflow checks.
- All work local to `A:\PATHFINDER V2`. No push, merge or deployment authorized.

## Next tasks
1. Inventory CSS computed text sizes and touch targets across screens, including account/access dialogs, report editor/results, and marketing page when created. Flag specific selectors below 14px with evidence.
2. Run multi-viewport and zoom visual QA, find actual defects before modifying CSS, then address largest readability issues in small tested commits.
3. Add screenshot review and keyboard/focus accessibility test coverage. Verify without altering live production.
