# Generate keeps the same display size — live

The owner clarified that Generate must not change the initial fitted size.
The previous release explicitly reset the workspace to 100% at Generate and
therefore enlarged the entire page. This release removes that reset and retains
the empty workspace's reference dimensions while preparing and showing reports.
Report length does not participate in scaling. The full report grows naturally
with page scrolling at the same display scale; there are no Output scroll limits.
Account and popovers retain the existing original behavior. Existing application
handlers are unchanged. Asset references are versioned `20261025-2`.

Runtime: `725eb0f` on the canonical release branch.
Archive: `.v2-tmp/deploy-725eb0f`.
Deployment: `dpl_8XunsdtLuFwhJCSWeJkGrKuENgXd`.
URL: https://kidbuster-a1mj74bjj-thembones90-sudos-projects.vercel.app
Both classbuster.com and kidbuster.vercel.app verified on this deployment.
Previous production: `dpl_E5GVzsTeZ8TsJ7UqycUx49X373oq`.
Original pre-resizing fallback: `dpl_5xc42UCfWnVw5JE8D2nhtpHj3kM1`.

Verification:
- All 117 test files passed (`work/generate-stable-scale-full.log`).
- Regression delays the simulated provider response and compares exact canvas,
  notes width/height, teacher input height, logo width and zoom before Generate,
  while preparing, after completion and through a second generation. It also
  retains seven-protocol/seven-viewport, rating 6, Account, popover and reset checks.
- Static and synthetic release integrity passed.
- Candidate passed 24/24 endpoint checks plus five additional refusal probes.
- Both public domains passed 24/24 after publication.
- Live browser HTML matched the committed archive. At 1909x943, zoom 0.7722 and
  canvas width 957.515625px were identical before/loading/completed. At 1366x650,
  zoom 0.5194 and canvas width 644.046875px were identical across all three phases.
  Notes, teacher and logo dimensions also matched exactly. Each simulated report
  contained 3550 characters and had zero internal overflow; the page scrolled
  normally. Account retained zoom 1, and returning from Account restored the
  same saved report scale.
- Live checks used synthetic credentials and intercepted API responses. No paid
  generation, customer data writes, real lesson content or Scout install was used.

Preserve this behavior: fitting is based on the empty workspace, and that scale
continues through Generate and the completed report. Do not interpret original
report behavior as permission to enlarge the interface back to 100%.
