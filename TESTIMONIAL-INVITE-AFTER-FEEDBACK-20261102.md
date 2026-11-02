# Testimonial invitation after feedback — 2026-11-02 (NOT DEPLOYED)

Owner request: CLAUDE-TESTIMONIAL-REDESIGN-TASK.md. Built on
`release/testimonials-candidate-20261102` @ `50d5efc` (contains live web 7d1938d
and the payment hardening 7896e56/0b9265f; no billing code touched).

## Behaviour
- After the EXISTING post-report feedback is confirmed saved (`/api/feedback`
  answers `stored:true`), `index.html` dispatches `classbuster:feedback-saved`.
  `assets/testimonial-invite.js` then (350 ms later) opens an optional dialog:
  "Help other teachers discover Classbuster" with **Share my story** / **Not now**.
- Every star rating (1–5) and every idea is invited. Bug reports are not.
  Failed or unconfirmed saves never invite. Generation/copy/feedback are untouched.
- Share my story shows the submitted comment as an EDITABLE draft, an optional
  name form and teaching context, the privacy explanation, and a required box
  allowing Classbuster to email the account address to ask before publishing.
- Escape, ×, Not now, Discard and clicking the backdrop close immediately. Focus
  is trapped inside and returned to the feedback area. Mobile uses a bottom sheet.
- Frequency cap (localStorage `classbuster.testimonialInvite.v1`, timestamps and a
  counter only): once per page; 21 days after Not now; 180 days after three Not
  now answers or after a story was sent.
- The dialog lives under `<body>` outside `.wrap`: no zoom/geometry change and
  no body-overflow change (which would alter the fitted viewport width).

## Server (no new secret, no migration; existing KV)
- `POST /api/feedback?kind=testimonial` (same function, function budget unchanged).
  Requires an active license or owner/founder key; the shared legacy app key is
  refused (no identity to ask for approval). Validates a 16-hex proposalId, story
  10–800 chars, no emails/links/phones/bidi controls, `contactOk:true`.
- Stored as `tp:item:<n>` with `status:'received_private'`, `publishable:false`,
  the hashed account tag, contact email read from the SERVER license record, and
  a feedback link only if that feedback belongs to the same account. 180-day TTL.
- Idempotent per (account, proposalId) via SET NX; failures release the
  reservation and return 503 (never fake success). Limit 3 per account per day.
- Never sent to the Google Sheet or any third party; never written to
  `assets/testimonials/testimonials.json`.
- Owner `GET /api/feedback` now also returns `testimonialProposals`; the owner
  feedback view lists them as "private, not published". Publication stays the
  manual process in TESTIMONIALS-GUIDE-20261102.md.
- Feedback POST response adds `feedbackId` (backwards compatible).

## Tests
`tests/test-testimonial-proposals.cjs` (auth, validation, storage, linking,
idempotence, rate limit, owner-only listing, no third-party/public publication,
outage) and `tests/test-testimonial-invite.cjs` (browser flow, dismissal, cap,
editable draft, consent, idempotent retry, focus trap, mobile, geometry).

## Hardening 2026-11-02 (CLAUDE-HARDEN-TESTIMONIAL-20261102.md) — NOT DEPLOYED
1. **Privacy policy:** new anchored Section 7a (`#testimonial-proposals`) plus a
   Section 2 entry: exact contents (story, optional name/context, account email
   read server-side, one-way account ref, own-feedback link), owner-only, no
   Sheet/analytics/third party/public page, 180-day expiry, optional contact
   only, publication only with separate consent to the exact quote and naming,
   withdrawal. Effective date 2 November 2026. The form links to it.
2. **Listing cost:** `listTestimonialProposals` reads the sequence-indexed
   window with ONE MGET per ≤100 keys: default listing = 2 Redis commands
   (was 100 GETs); limit capped at 200 (≤3 commands); bounded gap step-over
   (max + 100 ids); fallback to small GET groups only if an adapter lacks MGET.
   Keys are unchanged (`tp:item:<n>`), so earlier proposals are still read;
   nothing is deleted.
3. **Idempotency:** claim is `pending:<token>` with a 60 s expiry (stale-claim
   recovery = expiry). Record is written first, then committed atomically
   (`compareAndSetValue`, one Lua command) to `stored:<n>`. A pending claim
   answers **409 `in_progress`, `retryable:true`, `Retry-After: 2`** — never 200.
   200 is returned only with a positive stored id. A worker that lost its claim
   withdraws its own copy; failure cleanup is token-guarded and never deletes a
   newer claim or a committed value. Daily limit uses the atomic bounded
   counter and is refunded on failure. Legacy c12ac39 values: a number is a
   stored id; a tokenless `pending` is taken over atomically (it had a 180-day
   expiry and could never recover). The browser retries a 409 twice (1.5 s)
   with the same proposalId and accepts success only with a numeric id.
Tests added to `tests/test-testimonial-proposals.cjs` (sections 10–15) and
`tests/test-testimonial-invite.cjs` (4b). Asset tag bumped to `v=20261102b`.
Tests could NOT be run in the hardening session (node execution not
permitted there): run `node tests/test-testimonial-proposals.cjs`,
`node tests/test-testimonial-invite.cjs` and `npm test` before staging.

## Owner approval required before release
1. Approve the copy, the 21/180-day cap and inviting after ideas but not bugs.
2. Approve storing the account email on a proposal (owner-only, 180 days) and
   update privacy-policy.html accordingly before release.
3. Normal staged release + smoke per AGENTS.md. Nothing was deployed.

## Owner decision 2026-11-02: invite every protocol user, one story per account — NOT DEPLOYED
- **Trigger:** also 2.5 s after any successful report in any protocol
  (`classbuster:report-generated`), besides saved feedback. Signed-in accounts
  only. Skipped (retried at the next report or saved feedback) while the
  teacher is typing, while another app dialog is visible, or when the status
  check fails. Not now still rests 21 days (180 after three).
- **One story per account:** after a story is stored the server sets
  `tp:done:<account tag>` = proposal id (no expiry, no personal data). A
  different later proposal answers **409 `already_submitted`** and stores
  nothing; a retry of the SAME proposal still answers 200 duplicate. The browser
  then never invites again (`sentAt` is now permanent).
- **New device:** `GET /api/feedback?kind=testimonial` → `{submitted}` (one Redis
  GET), asked only just before an invitation would open; a positive answer is
  remembered locally, so a known sharer costs nothing afterwards.
- Daily limit (3/day) kept as a backstop. Two different stories sent at the
  same instant from two devices can both be stored (no per-account lock); the
  owner sees both.
- Privacy Section 7a discloses the report trigger and the marker.
