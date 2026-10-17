# Pathfinder V2 — Customer Journey Audit (2026-10-17)

Auditor: Claude (Opus 5.5), independent review by Codex (read-only).
Scope: what a brand-new teacher experiences, end to end.
Branch `pathfinder-v2`. Audit started at `e9b16c2`, the build running on production. Fixes: `8d61ece`, `15b1074`, `2f3d4d4`.
Staging after fixes: `pathfinder-v2-staging-ktu6fichz` (preview alias and Krisp ingress alias).
**Production was not changed.** Fixes need owner approval to deploy (see section 8).

## Evidence legend
- **REAL**: real services. Staging Vercel + Redis, real Anthropic generation, real Postmark email to a disposable mail.tm inbox, real browsers, Lemon Squeezy Test Mode.
- **PROD-SAFE**: production probes that read only, or are rejected by authentication. No email sent, no account touched.
- **MOCK**: automated test with a stateful fake backend or in-memory KV.
- **CODE**: verified by code inspection only.
- **NOT TESTED**: stated with the reason.

All accounts were synthetic: mail.tm inboxes, `example.test` addresses, and the Test Mode Lemon Squeezy subscriber. No real customer was read, used or changed.

---

## 1. Findings and fixes

| ID | Sev | Finding | Status |
|---|---|---|---|
| F1b | **P1** | Owner report (after F1): the teacher name vanished after a refresh following New student/Reset, because it lived only inside the lesson draft that those actions delete (the old "Layne" default had hidden this). | **Fixed:** name and sign-off are stored separately and persist until the teacher edits them; nothing removes them. The one-time "Layne" cleanup was removed at the owner's request. |
| F1 | **P1** | Every new teacher's **Teacher field was pre-filled with "Layne"**, so reports went to parents signed "Teacher Layne". Production at `e9b16c2` still does this. | **Fixed on staging.** Not yet on production. |
| F2 | P2 | A missing student name reached the server and showed "Could not generate feedback. Request failed (400). Invalid generation request: studentName is required". | Fixed |
| F3 | P2 | Email-link limit was 5 per 15 min **per IP**, shared by everyone on the same school, agency or mobile-carrier network. The 6th teacher was refused. Reproduced live on staging. | Fixed (30 per IP, still 5 per mailbox) |
| F4 | P2 | The email link opens in a **new tab**. The original tab stayed on the sign-up window until reloaded. Reproduced in Chrome, Edge, Firefox and WebKit. | Fixed |
| F5 | P2 | Technical error text: "Rate limited — …", "The API is temporarily overloaded", "Server error (500)", "Request failed (400). …". The server's own friendly throttle message was thrown away. | Fixed |
| F6 | P2 | "Used up" messages did not say when Classic resets, or that other protocol trials still work. | Fixed |
| F7 | P2 (financial) | A second completed checkout while a subscription is active leaves the older one **still billing**, with no signal to anyone. | Fixed. Owner review flag, owner key lookup, owner notification (Sheet if configured). |
| F8 | P3 | "Select a quality rating" while the UI says "performance rating". | Fixed |
| F9 | P3 | Verification email is one technical line ("Use this secure link within 15 minutes to access Pathfinder: <url>"). The sender address is `pathfinder@asocengine.com`. | **Open.** The Railway relay only accepts this exact text. Change relay and app together. |
| F10 | P3 | Free accounts log a 403 for `/api/krisp-session` on every page load. It's console noise; teachers can't see it. | Open (cosmetic) |
| F11 | P3 | The one-time token remains in the browser's history database. The address bar and back/forward entries are clean. The token is single-use and already consumed. | Accepted |
| F12 | P3 | Opening another account's email link in a signed-in browser silently switches accounts. The message doesn't name the account. | Open |
| F13 | P3 | After `subscription_payment_recovered`, status stays `past_due` until Lemon Squeezy's next `subscription_updated`. This is by design. | No change |
| F14 | Info | GREEDISGOOD: the order charged 50%, but the initial subscription-invoice record shows the gross amount. | Check the 2026-11-17 renewal invoice |
| F15 | Info | Staging throttle measured at **2 reports/min and 1 in flight** per account. Production values were not read; the code default is 10/min and 3 in flight. | Owner: confirm production values |

Codex review (round 2, diff passed on stdin; its read-only sandbox could not read the A: drive):
- **Rejected:** "duplicate never detected because `subscription_created` ≠ `payment_succeeded`". The provider adapter maps `subscription_created` → `payment_succeeded`. The new test proves it: it fails before the fix and passes after.
- **Accepted and fixed:** the limiter consumed a mailbox's allowance even when the IP was already refused. It now checks the IP first.
- **Accepted and fixed:** a third checkout erased the earlier duplicate review. It's now kept as `earlier`.

## 2. Phase results

### Phase 1 — Brand-new teacher (REAL, staging + Chrome)
| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | First visit | PASS after F1 fix | Screenshot; empty Teacher field after fix |
| 2 | Free plan understandable | PASS | Account panel: "Free / Active / 0 used - 5 left this month"; trials 0/5 ×6 |
| 3–4 | Register, email arrives | PASS | 202; real email in ~5 s, subject "Verify your Pathfinder email" |
| 5–6 | Click link, Free active | PASS | "Email verified. Your Pathfinder access is ready on this browser." |
| 7–9 | Refresh, close and reopen browser, return | PASS | Persistent Chrome profile; account kept |
| 10 | Account panel | PASS | Plan, status, usage and trials correct |
| 11 | Reopen used link (signed in) | PASS | Calm "already active" notice (the e9b16c2 fix) |
| 12 | Expired link | MOCK | `test-license-routes` (expired token 400, no account). The 15-minute wait was not run live. |
| 13 | Malformed link | PASS (REAL) | No key granted. Signed-in browser keeps its account. |
| 14 | Another account's link | CODE | It switches the browser to that account (F12) |
| 15 | Request another email | PASS | Newer link works; older unused link also still works until it expires (accepted) |
| 16 | Register with existing email (case/space variant) | PASS | Becomes recovery; **same key**, no duplicate |
| 17–18 | Recovery by email | PASS | "Recover your Pathfinder access"; **same key** |
| 19 | Back/forward after verification | PASS | Token never reappears |
| 20 | Token removed from URL/history | PASS (address bar, session history); F11 | |
| — | Token replay | PASS | Same token a second time: 400 |
| — | Link on a different device with no account | PASS | "This secure link is invalid or has expired. Request a new one." |

### Phase 2 — Free generation (REAL, staging, real Anthropic)
Classic, synthetic teacher 1:
- Invalid request (no student name): 400, **count unchanged** (0).
- Reports 1–5: count advanced 0→1→2→3→4→5. The account panel matched.
- Double-click with the same request ID: one 200; the second is refused (in-flight). Replaying the completed ID: 409 `duplicate_completed`, **not charged again**.
- With 1 left, two concurrent requests: exactly one succeeded. Staging's in-flight limit refused the other, so the quota-race path itself is covered by `test-atomic-generation-quota` / `test-quota-hold-boundary` (MOCK, plus earlier real-Redis guest checks).
- 6th report: 402 `limit_reached`, count stays 5/5, trials untouched.
- Rejected and throttled attempts never consumed allowance (every 429 left counters unchanged).

Trials, synthetic teacher 2:
- Sugarcoat, Fairy, Blitz, Beida, OF and Preply each generated a real report. **Only that protocol's counter moved; Classic stayed 0.**
- Fairy exhausted 0→5. The 6th Fairy attempt got 402 `trial_exhausted`. Sugarcoat, Beida and Classic still worked afterwards: **independent allowances confirmed.**
- Protocol shapes read from the real outputs: Sugarcoat "Love, Teacher … 💖"; Fairy "Love, Teacher"; OF Strengths / Areas for Improvement / Learning Suggestions; Blitz one paragraph with no greeting; Preply a short tutor message.
- Pro removes limits: an account at 5/5 generated Classic right after a signed Pro activation (REAL).
- Monthly rollover: CODE (`currentUsagePeriod` = UTC `YYYY-MM`) plus existing unit tests.
- Failed provider call or timeout does not consume allowance: MOCK (`test-atomic-generation-quota`, "known upstream failures compensate the reservation").

### Phase 3 — Form and Generate button
- Validation names the missing field and makes no request: empty notes, no rating, no teacher name (new), no student name (new), OF without pronoun. MOCK in `test-customer-journey`; REAL for student name before the fix.
- Unicode: student "Милица 李", teacher "Zoë Đorđević", Cyrillic/Chinese/emoji notes. REAL, all three lengths, names exact in greeting and sign-off.
- Lengths are **ceilings** (Short ≤2,400, Medium ≤3,000, Long ≤4,800 characters). Short notes give similar sizes. Not a defect.
- Extremely long notes (>100,000 characters): server 400. The page now says "These lesson notes are too long…" (MOCK). The live attempt was rate-limited.
- Notes survive failed generations (MOCK). Late responses never overwrite a newer report (existing `test-reused-email-link`, `test-critical-autocopy`).
- `.btn-label` preserved (`test-generation-waiting-messages`).
- Refresh during generation, slow network: covered by existing generation-attempt tests (MOCK). NOT TESTED live.

### Phase 4 — Account states (REAL, signed Test Mode events on staging)
| State | Backend | UI label (CODE plus earlier tests) |
|---|---|---|
| Free active / exhausted | plan free, remaining 5→0 | "x used - y left this month" |
| Pro via payment | plan pro, sub active, billing paid | Pro / Unlimited |
| Duplicate created event | unchanged | — |
| Cancelled in paid period | still **Pro**, ends_at kept | "Pro until <date>" |
| Resumed | Pro active | |
| Payment failed / past_due | still Pro, billing payment_failed | "Payment recovery", portal hint |
| Expired | **Free**, remaining 0 (already used this month) | "Subscription ended" |
| Re-subscribe after expiry | checkout 200 | |
| Forged event | 400 | |
| Invalid key | 401 everywhere; the page removes the key | |
| Account switch and stale responses | existing `accountStatusRequestId` guard (CODE) | |
| Same account on two devices | REAL: verified on a second browser profile via recovery link | |

### Phase 5 — Krisp (REAL backend + real Chrome, synthetic webhooks)
- Session, webhook URL on the Krisp ingress alias, ARM, transcript arrives matched, ack: PASS.
- **ARM persists** after a match, after the ack, after three imports and after a page refresh. It went off only on an explicit DISARM.
- Duplicate delivery ignored, invalid token 401, disarmed transcript goes to the pending inbox, claim, dismiss: PASS.
- Regenerate: old URL 401, new URL works. Free account: 403.
- Browser: the transcript fills the notes field and the word counter updates ("23 words · 129 characters"). All seven protocol colours apply, including the ARM button border.
- NOT TESTED: delivery from the real Krisp app (payload shape from existing tests).

### Phase 6 — Payments (Lemon Squeezy Test Mode, staging)
- Free → Pro checkout URL: REAL (pathfinderapp.lemonsqueezy.com).
- Unauthenticated Pro checkout goes to email verification first (202): CODE plus `test-checkout-ownership`.
- Coupon field shown; GREEDISGOOD charged RSD 616.64 of 1,233.27; signed webhook activated Pro. REAL, earlier today.
- Repeat webhook is idempotent; failed, recovered, cancelled and expired as in Phase 4 (REAL).
- Billing portal for the subscriber: REAL (Lemon Squeezy /billing URL). Free account gets 409.
- Double-click checkout gives two checkout links (not two subscriptions). If both were paid, F7 now flags it.
- Checkout with another email: 403. Naming another key: 403. Owner key: 403. Unauthenticated with a key in the body: 401.
- NOT TESTED (needs owner authorization): a live-mode payment.

### Phase 7 — Browsers and sizes (REAL browsers against staging)
| Browser | Real sign-up via page form → email → link → real report | Layout 390 / 768 / 1280 / 1440 |
|---|---|---|
| Chrome (installed) | PASS, signed by the teacher, account 1/5 | no overflow; Generate and output visible |
| Edge (installed) | PASS | same |
| Firefox (Playwright build 1465) | PASS | same |
| WebKit (Playwright build 2083) | PASS | same |
- 390 and 768 are **viewport emulation** inside real engines. **Mobile Safari on a real iPhone and Android Chrome on a device were NOT TESTED.** WebKit desktop is the closest proxy available.
- Keyboard: every control reachable by Tab, each with a visible focus indicator. Rating selectable with Enter.
- Console: no page errors. Only Vercel's preview-only toolbar script was blocked by CSP (not on production), plus F10.

### Phase 8 — Security and privacy
PROD-SAFE and REAL, identical on staging and production:
- Fake or missing keys: generate 401, license-status 401, checkout 401, krisp-session 403, krisp-webhook 401.
- Owner-only endpoints with a fake key: feedback GET 403, admin-create 403.
- payment-webhook: unsigned 400, forged signature 400. license-verify with a random token: 400.
- Headers: CSP, HSTS, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`. Staging is noindex.
- The expired-link UI fix (`e9b16c2`) grants nothing. An invalid token on a browser without an account stores nothing (REAL + MOCK).
- The rate limiter still stops floods: 31st request from one IP, 6th per mailbox (MOCK).
- Staging and production use separate Lemon Squeezy modes, webhooks, secrets and mail-relay tokens (launch record; env names verified on staging only).
- Production `index.html` is byte-identical to `e9b16c2`.

### Phase 9 — Copy
Rewritten (all shown to teachers):
- "Add your name in the Teacher field first. It appears in the report's sign-off."
- "Add the student's name before generating."
- "Pick a performance rating before generating."
- Classic limit: "You have used your free Classic reports for this month. They come back on the 1st of next month. Any protocol trials you have left still work, or upgrade to Pro…"
- Trial used up: "You have used your 5 free <Protocol> reports. Classic still works with your free monthly reports, and so do any other protocol trials you have left…"
- Busy: "Pathfinder is busy right now. Wait a few seconds and try again. Your lesson notes are still here."
- Server error: "Something went wrong on our side. Your lesson notes are still here…"
- Signed in from the link tab: "You are signed in now. Select Generate feedback when you are ready."
- No account: "Sign in with your email to generate reports. Your lesson notes are still here."

Recommended, not changed:
- Email body (F9).
- The "Change code" button and the "access code" vs "access key" wording are used inconsistently.

## 3. Regression gates added (all in `npm test`, 79 files passing)
- `tests/test-customer-journey.cjs` (new, release gate). Real page in Chrome, stateful fake backend, 9 journeys:
  - fresh visitor
  - link sign-in and token removal
  - field validation with no request sent
  - signed Classic report and usage
  - limit and trial messages
  - plain server errors
  - reused and invalid links
  - two-tab sign-in
  - teacher name persists through refresh, reset and New student
- Before the fixes it **fails 12 checks**.
- `tests/test-duplicate-subscription.cjs` (new): fails before the fix.
- `tests/test-verification-rate-window.cjs`: shared-network and limiter-order checks.
- Updated for the empty Teacher default: `test-security-headers`, `test-generation-waiting-messages`.

## 4. Production-safe smoke (2026-10-17, against kidbuster.vercel.app)
GET `/` 200, `/api/ping` 200, terms 200, plus every auth-negative probe listed in Phase 8. No signup, recovery or generation was run on production; no production account was touched.

## 5. Outstanding limitations
- No live-mode payment (requires your explicit authorization).
- GREEDISGOOD renewal retention: check the 2026-11-17 test renewal invoice.
- Real iPhone Safari and Android Chrome not tested (no device lab).
- Real Krisp app delivery not tested.
- 15-minute link expiry and month rollover not observed live (unit-tested).
- F9 email copy needs the relay changed together with the app.
- Production throttle values (F15) not read by rule.
- Owner notification for F7 reaches you only if `GOOGLE_SHEET_WEBHOOK_URL` is set. Otherwise it's visible in the owner key lookup and the server log.

## 6. Synthetic data left on staging
- mail.tm teachers: 1 exhausted then Pro then expired, 2 with Fairy exhausted, plus cross-browser accounts.
- Two `example.test` accounts and the Test Mode subscriber `2614679` (renews 2026-11-17; keep it for F14).
- Production: none created by this audit.

## 7. Launch confidence
- **Core teacher journey (sign up, verify, return, recover, generate, understand allowances):** high. Verified against real services in four browser engines.
- **Payments:** Test Mode verified end to end. Live-mode purchase still unproven.
- **The one issue that affects real teachers today is F1.** Production reports are signed "Teacher Layne" unless the teacher changed the field.

## 8. To release these fixes to production (owner approval required)
Commits: `8d61ece`, `15b1074`, `2f3d4d4` (on top of `e9b16c2`). All 79 test files pass. Staging `ktu6fichz` is verified.
Deploy the same way the launch was done, then repeat the section 4 smoke checks. Rollback: re-alias `kidbuster.vercel.app` to the current production deployment.
