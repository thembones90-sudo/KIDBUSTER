# Pending transcripts — no transient workspace resizing

Owner request: opening Pending transcripts must not change any workspace sizes.

The fitter still ran on popover toggle and other non-resize events. On an empty
workspace it reset zoom to 1, measured, then reapplied the fitted zoom. Prior
checks only compared the settled zoom, missing transient style writes.

The fitter now retains one fit per actual viewport. Same-viewport refreshes
return before any sizing writes; popover toggles no longer request a fit.
Initial font completion and real browser resizing remain supported. The shared
Classic envelope, 80% readability floor, seven protocols, generated report page
scrolling, Account and New Student behavior remain unchanged.

Regression adds a workspace style MutationObserver and frame-by-frame geometry
comparisons for Pending transcripts, Krisp integration and Help, at 1909×943,
1366×650 and 390×844. Existing seven-protocol/seven-screen and repeated report
generation tests remain. The initial baseline failed with transient sizing
writes; the fixed regression passes.

Only index asset-version references change in application HTML. No backend,
customer identity, entitlement, payment, transcript import or Scout installer
changes are included. Headless tests do not control the owner's desktop/browser
or interrupt the active Scout recording.

Previous production / rollback: dpl_3whb1tGibejwr7GzP6LUnJ5uKcXV.

## Verified candidate — not promoted

- Runtime commit: 276392f0c3481b41519831e020e603ae9bd17267, pushed to the
  existing release/classbuster-legacy-safe-20261023 branch.
- Full suite: ALL 117 TEST FILES PASSED. Log: ../no-menu-resize-full-tests.log.
- Static/synthetic release integrity gate: PASS, including the owner-authorized
  sizing fingerprint and its negative tests.
- Exact committed archive deployment: dpl_At72yTbgoZZtgoBkefxPvwTtGut7.
- Candidate: https://kidbuster-dek2ubiw0-thembones90-sudos-projects.vercel.app.
- Candidate checks: five exact-file comparisons; five additional migration,
  pairing and monitoring refusal probes; 24/24 standard live checks passed.
- Log: ../no-menu-resize-candidate-smoke.log. Existing deployment authentication
  was used without disabling protection or exposing credentials.
- classbuster.com was rechecked and still runs the previous production ID above.

Pending: RELEASE-CHECKLIST.md Level 4 owner account/plan/report verification on
this candidate, then owner-authorized promotion. No real account key, report
generation, email or customer transcript was used in release checks. The owner
is teaching and explicitly prohibited taking control of their computer, so no
desktop/browser interaction was performed and the owner check was not simulated
or misrepresented. Running Scout and the user's open tabs remain untouched.
