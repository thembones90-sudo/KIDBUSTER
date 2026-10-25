# LingoAce static rating highlight — 2026-10-25

Owner reported permanent shaking of the selected Medium rating's white highlight. Idle workspace scale churn was not reproduced in the synthetic browser fixture. The selected LingoAce rating inherited the generic scale(1.05)/translateY(-1px), transform/glow/filter transitions and layered white highlight. The correction gives LingoAce's qualitative rating buttons a static selection treatment: no transform, no animation, no glow/filter transition, and a fixed white outline/soft glow. Keyboard focus remains visible. Other protocols and all fitting assets are unchanged.

Regression: selected Medium while hovered and idle; transform and animation are none, transition properties exclude transform/glow/filter/all, and button bounds plus outline/glow styles are identical for 60 animation frames in each state. Also requires zero idle workspace style churn over 90 frames and preserves the existing seven-protocol/seven-screen symmetry, Account, Generate and page-scroll checks.

Previous deployment / rollback: dpl_9pqdEAJDTW1XEfhhTSmmnCXJzdF6 (runtime de4098f).
Runtime a5c3d8b; deployment dpl_CPrcefoSXDL6F37iv7niPKHgUVb3.
URL: https://kidbuster-oiy3kax08-thembones90-sudos-projects.vercel.app
Both classbuster.com and kidbuster.vercel.app point to this deployment and passed 24/24 checks. The candidate passed 24/24 plus five additional refusal probes.

All 117 test files passed (work/lingoace-static-rating-full.log). Live browser checks used real static assets with synthetic access and blocked API writes. All five ratings were tested while hovered and idle at 1909x943 DPR1, 1536x864 DPR1.25, and 1366x650 DPR1. Each state produced 60 identical samples of button bounds, outline and glow, with no transform or animation and no motion-related transition. Workspace scale remained constant. Screenshots are saved at outputs/CLASSBUSTER-LINGOACE-STATIC-*.png.

No sizing asset or fingerprint was changed. Existing cross-protocol symmetry, Account, Generate and page-scrolling regressions still pass.
