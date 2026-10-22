# Classbuster: first-time onboarding implementation

**Working branch:** feature/classbuster-account-onboarding-20261022
**Isolation:** A:\CLASSBUSTER-ONBOARDING, created from exact verified production commit dca050c
**Status:** Pending Vercel preview and owner approval. Production not altered.

## First-time journey
1. Welcome to Classbuster, with Show me around and Skip introduction.
2. Your first report, with three steps and an on-demand example. Detailed legacy Help remains accessible via Explore the full guide.
3. Meet Scout. Its installation is optional. When the approved public manifest is unavailable, Install Scout is disabled and there is an explicit Not now option. Learn about Scout opens a separate informational panel.
4. You're ready. Enter Classbuster returns to the normal workspace.

A compact **Explore Scout** entry remains visible on the workspace, regardless of the user's onboarding choice. A public installer is offered only after a verified asset is published in assets/scout-release.json. The app never downloads or installs Scout automatically. Owner-only RADAR VAN is not released.

## Account identification and persistence
- Existing new-license creation writes onboardingEligible:true; legacy Free and paid accounts without the explicit marker are never auto-toured.
- New Free, direct new Pro and manually issued Pro on *first activation* are eligible. Recovered/older keys are not retroactively converted into first-time accounts.
- After verified email access succeeds, a custom access-key-saved event triggers authenticated re-check of /api/license-status; initial page load, manual key entry and account switching also re-check.
- GET /api/license-status includes onboardingEligible, onboardingState (never / known / unknown), and recorded state. If KV is temporarily unavailable, state becomes 'unknown' and the app does not guess the teacher is new.
- POST /api/license-status requires the validated license and installation ID and accepts only completed/skipped. Onboarding data is stored under a SHA-256-hashed key namespace, not a raw license key.
- A browser fallback prevents recurring prompts if saving temporarily fails; server storage remains authoritative for cross-device use when online. A key from account A is never reused for account B.
- Replaying via Help never rewrites the server state. The older detailed help remains available.

## Accessibility and performance
Keyboard-operable, four-stage progress, responsive 390/1150/1280/1440px, focus trapping, proper topmost Escape behavior, focus restoration, reduced-motion CSS and light-theme contrast. The app does not require Windows or Scout to generate reports.

## Testing
- tests/test-classbuster-onboarding.cjs: actual local Chrome browser, mocked token verification/license responses and installer manifest.
- tests/test-classbuster-onboarding-api.cjs: real API/entitlement modules against local isolated KV stub, tests login/eligibility/storage/error scenarios.
- Existing browser and visual tests updated to reflect the new Help entry, retaining detailed help and Krisp documentation.
- Full suite and preview deployment smoke must pass before production approval.

## Remaining release work
1. Finish local full-suite regression and Vercel Preview validation.
2. Inspect live sandbox-free authenticated verification before promoting to production, without making a real customer purchase.
3. Obtain explicit production release approval.
4. Public Scout installer and transcript backend remain **not yet verified**; the installer manifest must stay unavailable until those independent checks pass.
5. Scout Adaptive optimization (CPU/GPU detection, Lite modes) is **separate future work**, not part of this onboarding branch.

Do not merge into the dirty A:\PATHFINDER V2 worktree. Use Git-based integration from this isolated branch only.
