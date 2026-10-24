# Live transcript card parity — 2026-10-24

## Provider logo follow-up — live

Commit `35bbb97c724bb07b79092ac7a70c6a7e05d04ca7` on the same source branch is
now live at classbuster.com, deployment `dpl_7bragfFQeuzHUfhgKNknEYVgQUiB`.
Export: `.v2-tmp/deploy-35bbb97`. Krisp uses `krisp-neutral.png` on a pale
backing; Scout uses `premium-v1/compass-classic.png`. Both are 28px, decorative,
and use the existing brand assets without recoloring. No transcript behavior changed.

All 114 test files passed; candidate 24/24 checks plus five refusal probes passed.
After promotion both public domains passed 24/24. Public HTML, inbox CSS and
both PNG assets matched the tested export byte-for-byte. Populated visual QA
used synthetic data only. Rollback is the prior deployment
`dpl_FPg7cuvgFqLvuZVP2nt96TfxAsjv` listed below. Preserve this logo follow-up
along with the card parity changes in future integrations.

## Original card parity release

Live at https://classbuster.com: deployment `dpl_FPg7cuvgFqLvuZVP2nt96TfxAsjv`,
commit `2dc0783ae6292c069b30f388ac25c84337572085`, branch
`codex/scout-card-parity-20261024` (pushed).

Source worktree:
`A:\CLASSBUSTER-LEGACY-LIVE-RELEASE-20261023\.v2-tmp\scout-card-parity-20261024`.
Deployment was made from an exact `git archive` export, `deploy-2dc0783`.
The base was the existing live release `4dfe5d6`, whose public index matched
the pre-release site exactly. This preserves the released Classic Medium
evidence improvements and Scout 1.1.0 installer/download configuration.

Scout cards now match Krisp's content-left/actions-right hierarchy. Explicit
`studentLabel` is the title when present; otherwise a readable dated Lesson
title replaces generic Scout-generated titles. Custom supplied titles remain.
Names are never inferred from transcript text or the workspace's Student field.
Duration, friendly date/time and two-line italic previews have matching visual
hierarchy. Both sources say `Import into notes`. Redundant nested Krisp badges
are hidden only in the inbox, keeping existing IDs and handlers intact.
Mobile cards stack actions underneath. More/excerpt/Dismiss controls remain.

No webhook, queue, claim/ACK, authentication, protocol instruction or generation
logic changed. CSS comments in index.html were shortened to keep the existing
600 KB limit; comparison proved all non-comment source text was identical.

Verification:
- All 114 test files passed in the clean exported release.
- New real-browser test covers provided names, unnamed fallback, no speech-name
  guessing, XSS-safe text, matching action labels and desktop/mobile geometry.
- Existing Scout pending/claim/overwrite/ACK regressions and granite tests passed.
- Release integrity passed; candidate 24/24 live checks and five refusal probes
  passed; deployed CSS/client SHA comparisons matched the tested source.
- After promotion, classbuster.com and kidbuster.vercel.app each passed 24/24.
- Public index, Scout JS and inbox CSS matched the exported bytes exactly.
- Signed-in live inbox opened successfully (both providers empty at check).
  Populated visual preview used synthetic data only; no real lesson was claimed,
  dismissed or generated for verification.

Rollback: `dpl_E8LEHP3wvgqieCbwVJ546BXx2oGE`,
`https://kidbuster-8b215fs5n-thembones90-sudos-projects.vercel.app`.

Integration warning: canonical working index.html and Classic test edits belong
to concurrent work and were NOT overwritten or included. Before a future release
from another branch, preserve the runtime changes from `c7681a8` and the
comment-only size fix from `2dc0783`; do not revert live card parity accidentally.
