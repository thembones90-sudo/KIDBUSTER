# LingoAce static rating highlight — 2026-10-25

Owner reported permanent shaking of the selected Medium rating's white highlight. Idle workspace scale churn was not reproduced in the synthetic browser fixture. The selected LingoAce rating inherited the generic scale(1.05)/translateY(-1px), transform/glow/filter transitions and layered white highlight. The correction gives LingoAce's qualitative rating buttons a static selection treatment: no transform, no animation, no glow/filter transition, and a fixed white outline/soft glow. Keyboard focus remains visible. Other protocols and all fitting assets are unchanged.

Regression: selected Medium while hovered and idle; transform and animation are none, transition properties exclude transform/glow/filter/all, and button bounds plus outline/glow styles are identical for 60 animation frames in each state. Also requires zero idle workspace style churn over 90 frames and preserves the existing seven-protocol/seven-screen symmetry, Account, Generate and page-scroll checks.

Previous deployment / rollback: dpl_9pqdEAJDTW1XEfhhTSmmnCXJzdF6 (runtime de4098f).
Verification and deployment results pending.
