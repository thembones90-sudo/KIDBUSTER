# Locked workspace and Account sizing — 2026-10-25

Owner correction: Account must retain the exact fitted workspace size, as Generate already does. Opening Account uses the cached empty-workspace dimensions, rather than measuring Account content or resetting zoom. Its content extends the page with normal scrolling. Closing Account preserves the same scale. Existing business handlers and DOM parents remain unchanged.

The owner-approved contract is at the top of AGENTS.md. Vercel's install integrity gate fingerprints the resizing JS/CSS and requires the versioned references. Explicit owner approval is required to change this baseline. Negative integrity tests reject altered assets and missing references. Browser regression verifies exact Account geometry and repeated opening/closing after generation, alongside the existing seven-protocol/seven-screen and Generate checks.

Previous production/rollback: dpl_8XunsdtLuFwhJCSWeJkGrKuENgXd (725eb0f).

Verification and deployment results will be recorded after completion.
