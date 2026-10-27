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
