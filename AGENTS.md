# Pathfinder V2 — Instructions for Coding Agents

You are working on the **development clone**, not the official Pathfinder deployment.

## Non-negotiable boundaries
- Work exclusively in `A:\PATHFINDER V2` and its subdirectories. Never write project artifacts to C:.
- Current Git branch: `pathfinder-v2`. The production branch `main` and the public site `https://kidbuster.vercel.app/` must remain unchanged.
- **Do not push** the V2 branch until staging is verified isolated. Do not merge, cherry-pick, or deploy to official production without explicit owner approval.
- Do not read, copy, or reuse production secrets or customer data from any other local project, Vercel environment, or connected service.
- No live payment actions, Krisp deliveries, emails to real customers, or production datastore modifications.
- Do not copy `.env.local` from `A:\PATHFINDER OFFLINE` or any other existing project. V2 currently has no environment credentials on purpose.
- **Public staging (2026-10-16):** project SSO on `pathfinder-v2-staging` is deliberately **disabled** by owner decision so external testers can open the app. Do not re-enable it without a new owner decision; application gates (license, quota, throttle, owner-only admin) are the protection. See `V2-PUBLIC-ACCESS-AND-APP-SECURITY.md`.
- V2 has an isolated (originally SSO-protected) Vercel project `pathfinder-v2-staging` (created 2026-10-12). Persistent staging Redis, Lemon Squeezy test-mode credentials, and approved nonproduction deployment are still missing. An isolated *temporary* Upstash guest DB was used solely for real Redis concurrency checks and expires 2026-10-15 unless claimed. Never connect production credentials.

## Architecture/product rules
- Read **`CODEX-V2-CONTINUATION-2026-10-12.md` first**, then `PATHFINDER-constitution.md`, `V2-DEVELOPMENT.md`, `V2-MASTER-PLAN.md` and `DECISIONS.md` before structural changes. The older `CODEX-V2-HANDOFF-2026-10-12.md` is historical and describes already-fixed bugs.
- The V2 workstreams include security/reliability, visual design and onboarding, fully automated subscriptions, and consent-based customer acquisition. Preserve a clean distinction between customer marketing pages and the operational report-writing workspace.
- Preserve all seven protocols, teacher names and sign-offs, official formatting, the nested Generate button `.btn-label`, and protocol color theming via `var(--toxin-rgb)`.
- Krisp ARM is persistent until explicit DISARM. Never clear the armed state automatically on transcript arrival, workspace reset, or token rotation.
- Krisp transcript and queue identity is the stable license identity, **not** the rotating webhook token.
- Every feature change needs regression coverage. Prefer small commits and deterministic tests.
- Security and reliability have priority over aesthetics and additional features.

## Baseline and release checks
- Base revision: `441d0c1d63136eb83f4b6b73156fc32fd6f0b8d3`.
- On 2026-10-12 the new clone passed all 19 test files, including browser smoke, with Node 24.
- Use local `npm test` for each change. Never count `test-live-smoke.cjs` as a real production smoke result when it reports SKIP.
- No production release without separate review of security, payment state, Krisp concurrency, privacy, performance, and rollback.
