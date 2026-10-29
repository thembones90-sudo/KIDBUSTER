# Bounded presentation extraction — 2026-10-29

The first UI modularization moves numeric display colors, caption verdicts,
qualitative display labels, protocol-label lookup and logo accessibility/motion
into assets/protocol-presentation.js. Main-page bindings and existing function
entry points remain, preserving the same controls, values and timing. The
module loads synchronously before application initialization; the release gate
refuses a missing module or missing/late dependency reference. Candidate checks
also verify the new asset; the exact-byte wrapper checks its deployed hash.

The canonical KidbusterCore engine is byte-for-byte unchanged (normalizedLF):
6fcdc7246996cc81ac52df7d26677889bbf80c5571272999986f4362cfa5ca4e.
No prompt, entitlement, customer identity, transcript or API behavior is moved.
The approved sizing JavaScript/CSS fingerprints remain untouched. Existing
browser checks verify all seven protocols, colors, ratings, keyboard/logo
behavior, appearance, reduced motion, output and no-menu-resize contracts.

This is an incremental extraction, not a rewrite of the large website entry
point or Scout GUI. Further extraction should keep the same small-module and
full-regression approach; do not claim the monolithic files have disappeared.

## Verified publication

Runtime dda4126, deployment dpl_8khvT5Z4wwRrMCEMLfD2DH4w64Jd, promoted after
all124 local files, GitHub40847836586 and candidate exact-byte/refusal checks.
Both live domains pass exact bytes (including the new module), five additional
probes and24/24 smoke checks. Rollback dpl_GmCY8pikpWJL1mP1HMjJfj45XKot.

The repeated inbox test failure identified a real cross-source status bug:
Scout count events could replace Krisp's unresolved refresh warning with a
normal count. updatePendingCount now retains the warning until a successful
Krisp refresh. The regression explicitly dispatches a Scout count update during
an outage and checks the warning text and button title remain. The full final
suite passes. No actual lesson/customer interaction was used for verification.
