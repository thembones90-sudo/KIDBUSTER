# PATHFINDER V2 — Product, Payments, Design and Growth Plan
Status: approved project objectives, implementation work pending. Date: 2026-10-12.
Applies only to the V2 development branch and the isolated local workspace `A:\PATHFINDER V2`.
North star: **Save teachers time without reducing professional quality. Trust is the product.**
Do not change the official Pathfinder site or the main branch until an explicit go-live approval.

## Objective and outcomes
Build a safe, polished, self-service subscription business for ESL teachers. We will measure actual teacher value, not just ship a pretty UI.
- Primary adoption milestone: **100 weekly active teachers** (define as at least one successful report generation in 7 days).
- Business milestone: **100 paying teachers** with healthy retention and positive unit economics. This is distinct from 100 registered accounts.
- Pricing hypothesis: **$12/month Pro**, to validate against costs and conversion. 100 paying accounts would represent $1,200 gross monthly subscription revenue *before* fees, taxes, refunds and model costs.
- No invented traction: current users are described by the founder as a small, enthusiastic group; exact baselines need instrumentation.

## Lane A — Secure, trustworthy app (release blocker)
A1. Require email ownership verification for any previously issued license retrieval. Remove account enumeration and unverified existing-key disclosure from signup and recovery; test both.
A2. Rate-limit identity endpoints and unauthenticated routes. Establish abuse limits and log only privacy-safe diagnostic metadata.
A3. Move prompt authorization to the server with protocol allowlisting, bounded inputs, and server-controlled generation budgets. Preserve approved report behavior and protocol versions.
A4. Make Free allowances atomic under concurrency with an idempotent reservation/refund or equivalent correct enforcement.
A5. Preserve persistent KRISP ARM; replace matched transcript single-slot and non-atomic pending updates with durable queue plus ack/recovery. Test concurrent arrivals and browser reload.
A6. Define a minimal student-data retention/deletion process, explicit privacy information, and optional telemetry that does not contain transcript content.
A7. Align CI with Node 24, audit deprecated dependencies and document test/rollback procedures.
Exit gate: reproducible tests cover the abuse paths and known races; no unintended live data interaction.

## Lane B — Design, readability and conversion
B1. Keep the distinct Pathfinder brand, seven protocol theme identities and `--toxin-rgb` treatment. Modernize typography, whitespace, consistency, hierarchy, focus treatment and visual balance; do not randomly repaint everything.
B2. Create a dedicated marketing/entry experience, separate from the workspace: hero with clear audience/outcome, 3-step explanation, honest time-saving demonstration, protocol examples, trust/privacy summary, pricing, FAQ and one strong Free CTA.
B3. Keep the productive workspace fast for existing teachers; fewer confusing controls on first use, show advanced settings progressively, improve multi-step feedback and mobile layouts.
B4. Make login, free signup, existing-account access, Pro upgrade, post-payment state, trial counts and cancellation status obvious. Explain the Free and Pro differences in plain English.
B5. Add before/after anonymized report examples; one short captioned demo and real testimonials only with explicit permission. Never use real child data as marketing screenshots.
B6. Check desktop and mobile widths, font size, contrast, keyboard navigation, focus visibility, reduced motion, loading/empty/error states and readable layouts at common zoom settings.
B7. Run first-use comprehension sessions with 5 teachers who have never seen Pathfinder. Observe: who it's for, what to do next, can they finish a report, can they discover checkout?
Exit gate: existing protocol flows and tests pass; teachers can understand the offer and produce a first report without coaching.

## Lane C — Billing and license fortification (release blocker)
C1. Verify Lemon Squeezy merchant activation and payout readiness in the merchant dashboard. No assumption from historical email alone.
C2. Keep test and live stores, credentials, variant IDs, signing secrets, webhook destinations, customer/license data and Vercel project settings strictly separate.
C3. Validate webhook signature using raw request bytes, reject invalid payloads, cap body size, log event IDs, maintain durable idempotency and safe replay handling.
C4. Treat cancellation as **cancel at period end**, respecting `ends_at` / paid-through state; downgrade on actual expiry (or an explicitly supported immediate revocation) and handle resumption.
C5. Reconcile lifecycle: created, updated, renewed, failed, recovered, paused, resumed, cancelled, expired, refunded, chargeback if supported. Do not let old out-of-order events override newer confirmed states.
C6. Make checkout success, delayed webhooks and Pro activation understandable to customers; add safe retries/reconciliation and support-friendly diagnostics.
C7. Provide account page: actual current plan, next billing/ends-at date if available, receipt/customer portal link, cancellation access, plan changes and self-service verified recovery.
C8. Verify failed checkout, duplicate and reordered webhooks, free->Pro->cancel->expiry->repurchase, renewal, paid-through access, manual gifting, and insufficient store configuration in integration tests.
C9. Update old documentation that incorrectly says Free has 20 monthly generations and treats unverified key recovery as desirable. Canonical commercial rules: five monthly Classic uses and five lifetime trials per other protocol, subject to product verification.
Exit gate: automated + dedicated Lemon Squeezy TEST MODE end-to-end flows succeed, with **zero** real charges and no production customer records; live production launch needs separate approval.

## Lane D — Distribution, marketing and sales
D1. Positioning: a purpose-built report-writing assistant for online English teachers, *not* a generic AI prompt wrapper. Message: 'Turn lesson notes into polished student feedback, with the reporting standards already built in.' Validate claims with real lessons.
D2. First customer segment: independent online ESL teachers regularly required to write detailed post-lesson reports, including LingoAce and similar platforms. Secondary: Preply tutors and teacher teams with recurring feedback needs. Test which segment has urgency and willingness to pay.
D3. Capture exact anonymized before/after examples and time-to-report data with consent from 3-5 satisfied existing users. Ask what they would miss if Pathfinder vanished, not merely whether they like it.
D4. Launch with a short demonstration (30-60 seconds), specific screenshots, a simple landing page, transparent $12/month Pro terms and meaningful Free trial. Use one URL and one CTA.
D5. Small-group/peer growth: personalized, permission-based peer invitations, teacher ambassadors, referrals, trusted admin collaborations. Do not spam or circumvent moderated groups; approach admins for sanctioned demos rather than dropping covert promo.
D6. Build a repeatable pipeline: 25-50 highly relevant qualified contacts/week, teacher replies, demos, Free activations, first reports, paid upgrades, retention. Initial quantities are an experiment, not guaranteed results.
D7. Founder-led demos, honest educational tips, relevant teacher communities, short video demonstrations and platform-specific examples. Concentrate on 1-2 channels until attribution shows the cost of gaining an active user.
D8. Test landing page headline and first-run activation before chasing more traffic. Referrals should reward real customers and not create abuse or negative margin.
D9. Only then consider team seats, school volume pricing, partnerships or broader English teacher audiences when user demand supports it.
Exit gate: track and review an honest weekly acquisition funnel, follow up with users respectfully, and report actual conversion and churn.

## Illustrative funnel mathematics, NOT forecasts
For 100 paying users at an assumed 20% Free-to-Paid conversion, we would need about 500 qualified Free users. If 20% of qualified landing visitors become Free users, that implies about 2,500 qualified visits. Actual ratios may be dramatically different. Improve conversion and retention before paying for more traffic.
Gross monthly revenue at $12: 25 paying = $300; 100 = $1,200; 300 = $3,600. Net revenue must subtract processor fees, tax, refunds, AI inference and support.

## Minimum privacy-respecting measurement
Product: unique Free accounts activated (verified), first successful report, weekly active teacher, time-to-first-report, successful vs failed generations, complaints/corrections per report, response time and cost per generation.
Conversion: unique qualified landing visit -> click Free -> verified signup -> first successful report -> second report -> Pro checkout started -> paid -> active after 30 days.
Billing: webhook failure rate, median/p95 time-to-Pro activation, duplicate/reordered event outcomes, payment failed/renewed/recovered, customer support tickets.
Growth: outreach delivered with consent, replies, demos, signups, active teachers, paid conversions, referrals, 30-day retention, churn, net monthly recurring revenue.
Never log or send student names, full transcripts or lesson content to conversion/marketing analytics.

## Execution order (workstreams overlap)
Gate 0: protect prod, retain isolated V2 test suite, obtain separate protected staging + test store.
Sprint A: critical license leaks, test-mode billing lifecycle and safe staging configuration. **Do not accelerate broad sales until safe.**
Sprint B: create the landing page + workspace style system; test with cold users while backend reliability work continues.
Sprint C: robust Krisp/concurrency, account self-service, full payment lifecycle E2E, zero-regression.
Sprint D: recruit 3-5 case studies, pilot consent-based outreach, build real funnel dashboard; iterate first-run conversion.
Sprint E: independent security/regression/billing checks, price/value review, explicit production release approval.
After launch: monitor conversion, payment correctness, support, retention and inference margins weekly.

## Nonnegotiable release checklist
[ ] No unverified account takeover/recovery vulnerability.
[ ] Subscriptions never revoke paid-through access prematurely.
[ ] No shared production databases, tokens, secrets, callbacks or billing records during staging tests.
[ ] All 7 protocols preserved, including stable Krisp license identity, ARM persistence and button/theme invariants.
[ ] Browser, unit, integration, checkout and cancellation tests passed.
[ ] Real teacher first-use experience and accessible mobile/desktop layouts validated.
[ ] Customer-facing terms, privacy notice, cancellation path, support and pricing are accurate.
[ ] V2 promotion and rollback approved explicitly by owner.

## References and evidence
- Project: `PATHFINDER-constitution.md`, `DECISIONS.md`, `V2-DEVELOPMENT.md`, `MONETIZATION-TESTING-CHECKLIST.md`.
- Lemon Squeezy test/live separation: https://docs.lemonsqueezy.com/guides/developer-guide/testing-going-live
- Official subscription event semantics: https://docs.lemonsqueezy.com/help/webhooks/event-types
- Official webhook signatures, delivery and retries: https://docs.lemonsqueezy.com/guides/developer-guide/webhooks
- Comparable generic teacher-AI pricing reference (not equivalent functionality): https://www.magicschool.ai/pricing
