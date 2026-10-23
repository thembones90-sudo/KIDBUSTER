# Classbuster first-time onboarding — review handoff

## Live visual refinement — granite and green

The owner approved and requested direct production publication on 22 October.
The subsequent visual refinement uses neutral granite (`#32363d` → `#23262c`),
the actual Classbuster green (`#87f316`), neutral gray borders and readable cool
white text. It removes the earlier olive/sage cast, adds consistent SVG line
icons, a compact brand header, restrained highlights, clearer footer separation,
and polished button states. Light mode uses neutral silver rather than pale
green. All changes are scoped to onboarding/Scout information presentation;
account state, trials, protocols, generation and Scout release gates are unchanged.
The preview-only instructions below describe the initial review phase, not the
owner's later explicit production approval.

## Scope and source

Based on verified production commit `dca050c904d93c43be6c40d856e63d5db3d0cbe7`
(`feature/scout-download-release-gate`), deployed at classbuster.com on 22 October 2026.
Feature branch: `codex/classbuster-first-time-onboarding`.
Production must NOT be promoted without the owner's review and approval.

## What is implemented

Header-entry refinement: a fresh visitor's **New here? Start here** button opens
the four-stage introduction directly, without an intermediate Help menu. After
finishing or skipping it, the button becomes **Help & guide** and retains replay.
Authenticated existing accounts retain normal Help access; only explicitly
eligible new accounts are automatically introduced. Pre-registration manual
discovery does not create or complete any server-side account obligation.
The report step explains five monthly Classic reports plus five one-time trial
reports per other report style; no quota or entitlement rule has been changed.

- Four-stage introduction: Welcome → Your first report → Meet Scout → You're ready.
- Example notes are revealed inside the introduction, never inserted over a teacher's work.
- Automatic introduction only after an authenticated active account has an explicit new-account marker.
- Existing customers, including customers recovering access or upgrading to Pro, are not enrolled merely because metadata is missing.
- New Free, newly created paid, and newly issued manual accounts are stamped at creation. Manual inventory waits for successful activation.
- Replay from **Help & guide → Replay the introduction** never writes account state.
- Permanent **Meet Scout** entry above the workspace, plus a Scout entry in Help.
- Scout is optional. Its panel explains Windows support, local transcription design, notes import, and installation steps when released.
- Unreleased Scout shows coming soon, with no executable link. Released links use the existing manifest validator, version, SHA-256 and allowlisted HTTPS source rules.
- Keyboard focus trapping/restoration, background inertness, Escape/close, four-step accessible progress, internal scrolling, light/dark and reduced-motion support.

## Account state and failure behavior

The existing authenticated `/api/license-status` route remains the status authority.
GET adds `onboarding: { accountId, eligible, state }`. POST accepts only
`{ action: "onboarding", state: "completed" | "skipped" }` for an authenticated,
activated, active eligible account. Existing installation-binding checks remain enforced.

`onboardingVersion: 1` is stamped only onto genuinely new license records.
No migration infers newness from account age or missing onboarding metadata.
Completion is a separate permanent KV marker keyed by a domain-separated SHA-256
of the stable license identity; atomic SET NX preserves the first recorded final choice.
No license snapshot is rewritten by a guide completion, avoiding payment-update races.
No emails, lesson notes, transcripts or raw access keys are stored in guide markers.
The deployment still has **12** serverless handlers.

If the guide's KV read fails, status reports `unavailable` without blocking account
features. Help replay and Scout information remain usable. A failed completion
write leaves an account-scoped browser receipt plus a visible sync message;
retry happens on reconnection, future status checks, and every 30 seconds while
needed. A teacher is never held inside the guide waiting for storage.

Cross-device persistence requires one successful server write. During a full
storage/network outage, a different browser cannot know an unsynced choice;
the UI deliberately does not promise otherwise. When browser storage also fails,
in-memory suppression lasts for that page and successful server persistence still
works; offline suppression cannot survive clearing/denying all storage.

## Review and testing

Final local regression result: **all 87 test files passed**, including the new
onboarding suite and existing activation, licensing, billing, generation, Krisp,
appearance, and seven-protocol suites. The runner's opt-in live smoke test is
reported as SKIP there; hosted Preview smoke is a separate result.

Changed files:
- `api/_lib/onboarding.js`: account identity, eligibility, durable completion.
- `api/_lib/license-service.js`: stamp only new accounts.
- `api/license-status.js`: authenticated read/write guide state; no new route.
- `assets/onboarding.js`: four stages, focus, replay, Scout panel, sync retry.
- `assets/onboarding.css`: responsive green/graphite, light/dark and motion.
- `assets/scout-release.js`: share only already-validated public release metadata.
- `index.html`: narrow account-status hooks, permanent Scout entry, Help replay and branding.
- `tests/test-onboarding.cjs`: dedicated route + real browser regression coverage.
- `tests/test-browser-smoke.cjs`: update the permanent Help-label contract.
- `tests/test-hotfix-licensing.cjs`: supply the browser window in its isolated VM harness.
- `tools/check-onboarding-preview.cjs`: read-only hosted guide acceptance and screenshots.
- `vercel.json`: disable only this feature branch's automatic Git deployment.
- `CLASSBUSTER-ONBOARDING-REVIEW.md`: this handoff.

The dedicated test uses real route handlers, in-memory KV, a test-only email
transport, and real headless browser pages in separate browser contexts. No real
email, payment, microphone, student data or provider-generation request is sent.
Coverage includes registration/activation, existing recovery, new Pro, manual
activation, immutable completion, account switching, fresh-device reads,
reload/logout/login, replay, example notes, Scout release/unavailable states,
offline retry, focus, light mode, reduced motion, and all four stages at
1150/1280/1440/390px.

Screenshots: `.v2-local/onboarding/screenshots/` (four desktop stages, four mobile
stages, Scout in light appearance). Regression evidence lives alongside them.

## Preview safety

The `kidbuster` project has shared Production/Preview database and integration
environment targets. The feature branch disables Git auto-deployment for itself
to avoid publishing a customer-data-connected test surface. Manual Preview
deployment is instead targeted to the existing isolated `pathfinder-v2-staging`
project. No environment values are copied or changed, and no production customer
data is used. Existing deployment protection stays unchanged.

Review without registering: **Help & guide → Replay the introduction**.
The permanent **Meet Scout** button is available without replay.

Verified Preview:
https://pathfinder-v2-staging-7hr6g0daa-thembones90-sudos-projects.vercel.app/

Deployment `dpl_AEAit3DH1RH6Gqh9PmcQ1XpYgzoT`, target **Preview**, status **Ready**,
application commit `d3639c51b787ca2dbf5e92728bbcfdd2266c99ce`.
The existing hosted live smoke suite passed all checks (all seven protocols).
The additional hosted onboarding check passed four-stage replay, permanent Scout,
unavailable installer safety, no pre-registration launch, Escape and focus at
1440px and 390px, with no JavaScript exceptions. API status without credentials
returns 401 with `Cache-Control: no-store`; both new assets return 200.
Hosted screenshots are `preview-1440-stage-1.png` through `preview-1440-stage-4.png`
and the corresponding `preview-390-stage-*` files in the screenshot directory.

Production remained on `dpl_Fx1zWZGpUPu3rySEEdLkZ87rCavQ`, independently rechecked
after Preview deployment. No production promotion or customer account mutation occurred.

Hosted real-email, provider checkout and independently durable external-KV tests
are not proven by synthetic regression tests. They remain a separate integration
acceptance gate before production promotion. Scout's public installer is still
unavailable by design. The Windows app/engine/installer are untouched.

The dependency install reports pre-existing high-severity audit advisories;
dependencies and lockfile are unchanged by this onboarding-only change.
