# Pathfinder V2 growth and launch plan

Status: execution plan only. No campaign, customer message, tracking service, deployment, or payment was activated.

## Launch gate

Do not send paid traffic until all of these are evidenced in the isolated staging project:

- verified email signup and recovery deliver successfully;
- a Lemon Squeezy TEST MODE checkout upgrades the same account automatically;
- renewal, paid-through cancellation, expiry, failure/recovery, pause/unpause and refund-review paths match the deterministic tests;
- invalid webhook bypass and invalid Lemon signatures both fail;
- Redis ownership and permanent retention are confirmed by the owner;
- desktop and mobile generation complete successfully for all seven protocols;
- Krisp receives, queues, imports and deduplicates synthetic transcripts;
- privacy, terms, refund and support destinations are present and reviewed.

## North-star funnel

Measure one anonymous installation funnel without storing transcript or report content:

1. `landing_view`
2. `access_started`
3. `email_verified`
4. `first_generation_delivered`
5. `third_generation_delivered`
6. `checkout_started`
7. `subscription_activated`
8. `week_2_active`
9. `month_2_renewed`

Required dimensions: UTC day, acquisition source/UTM, protocol, Free/Pro plan and coarse device class. Never attach names, emails, license keys, lesson evidence, generated reports, Krisp text, webhook URLs or payment identifiers to analytics events.

Initial operating targets for the first 100 verified teachers:

| Metric | Target | Action if missed |
| --- | ---: | --- |
| Verified email to first delivered report | >= 65% | Simplify first-run access and sample evidence |
| First to third delivered report within 14 days | >= 40% | Improve return prompts and saved-draft cues |
| First report to checkout start | >= 8% | Test value framing after a successful report |
| Checkout start to activated Pro | >= 70% | Audit checkout errors, pricing clarity and mobile flow |
| Activated Pro retained through month two | >= 75% | Interview churned teachers; fix reliability before acquisition |
| Successful generations | >= 98% | Stop campaigns and investigate generation/provider failures |

These are hypotheses, not promises. Re-baseline after the first 100 verified accounts without moving goalposts inside an experiment.

## Acquisition sequence

### Phase 1: 20 design partners

- Recruit directly from existing teacher relationships and small ESL communities where participation is permitted.
- Offer normal Free access; do not manufacture testimonials or urgency.
- Conduct five structured interviews after teachers have produced at least three real reports.
- Record only consented quotes and separate product feedback from marketing permission.

Exit criterion: 12 teachers reach a third report, at least five return in week two, and no P0/P1 trust defect remains.

### Phase 2: 100 verified teachers

- Publish one conversion-focused page showing the seven protocols, an anonymized before/after workflow, Free limits, Pro price, cancellation terms and Krisp support.
- Test only one major message at a time: time saved, protocol accuracy, or transcript-to-report workflow.
- Use source-tagged links for partner referrals, teacher communities and instructional content.
- Cap spend until subscription activation and month-two retention are measurable.

Exit criterion: funnel targets have statistically useful direction, support volume is manageable, and paid acquisition has a defined maximum customer-acquisition cost.

### Phase 3: hundreds of active teachers

- Scale the two sources with the best activated-Pro cost, not the most clicks.
- Build protocol-specific guides and teacher workflow examples from observed questions.
- Add a consent-based referral mechanism only after billing and entitlement automation are proven.
- Review cohort retention monthly by signup source and first-used protocol.

## Experiment ledger

Every experiment must state:

- hypothesis and primary metric;
- audience and start/end dates;
- one controlled change;
- minimum sample or time window declared before launch;
- guardrails: generation success, recovery success, refund/support rate and cancellation rate;
- result, decision and whether the change was retained.

Never optimize clicks at the expense of verified activation, successful reporting, renewal or customer trust.

## Pricing and unit economics

Before paid acquisition, record the real monthly Pro price, Lemon fees, tax handling, model cost per successful report, support allowance, refund rate and month-two retention. Define:

`maximum CAC = conservative gross profit over the chosen payback window`

Do not infer lifetime value from annualized monthly revenue before renewal cohorts exist. Start with a short payback window and widen it only when observed retention supports doing so.

## Immediate owner decisions

- Confirm the staging Upstash database is owned and permanent.
- Supply TEST MODE Lemon and staging email configuration directly in provider consoles.
- Approve or reject the dedicated Vercel automation-bypass secret described in the staging readiness checklist.
- Choose the public Pro price, refund terms, support address and privacy/terms URLs before conversion copy is finalized.

