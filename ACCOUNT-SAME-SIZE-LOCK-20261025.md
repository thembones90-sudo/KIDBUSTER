# Locked workspace and Account sizing — 2026-10-25

Additional owner correction: every protocol must use the same Classic scale and matching outer panel geometry. Classic control slots are measured synchronously and restored before paint, without changing selections, handlers or DOM parents. Header badge height and stacked output space are stable. Exact geometry is compared across all seven protocols at all seven screen sizes.

Owner correction: Account must retain the exact fitted workspace size, as Generate already does. Opening Account uses the cached empty-workspace dimensions, rather than measuring Account content or resetting zoom. Its content extends the page with normal scrolling. Closing Account preserves the same scale. Existing business handlers and DOM parents remain unchanged.

The owner-approved contract is at the top of AGENTS.md. Vercel's install integrity gate fingerprints the resizing JS/CSS and requires the versioned references. Explicit owner approval is required to change this baseline. Negative integrity tests reject altered assets and missing references. Browser regression verifies exact Account geometry and repeated opening/closing after generation, alongside the existing seven-protocol/seven-screen and Generate checks.

Previous production/rollback: dpl_8XunsdtLuFwhJCSWeJkGrKuENgXd (725eb0f).

Live runtime: de4098f. Deployment: dpl_9pqdEAJDTW1XEfhhTSmmnCXJzdF6.
URL: https://kidbuster-mdyr3mu37-thembones90-sudos-projects.vercel.app
Both classbuster.com and kidbuster.vercel.app were promoted and passed 24/24 checks.
Candidate passed 24/24 plus five additional refusal probes.

All 117 test files passed (work/account-protocol-symmetry-full.log). The focused final sizing regression also exited successfully after deterministic fixture cleanup. Exact geometry matched across seven protocols and seven screens. Live checks on both 1909x943 and 1366x650 verified all protocols match Classic, Account opening/closing preserves exact dimensions, and Generate loading/completion preserves exact dimensions. Reports used only synthetic local provider responses, with real business handlers and live static assets; no customer data or paid generations were used.

Live Classic scale remains 0.7722 at 1909x943 and 0.5194 at 1366x650, matching the previously approved scale. Reports contain 3,550 synthetic characters, grow the page naturally, and have zero internal overflow. Account screenshots and before/loading/report screenshots are saved under outputs/CLASSBUSTER-ACCOUNT-SAME-SIZE-*.

The release guard fingerprints both resizing assets after normalized line endings and requires their versioned references. Negative mutation tests prove the gate rejects changed JS/CSS and missing references. This baseline may only change after a new explicit owner request.
