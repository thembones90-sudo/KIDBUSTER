# Pathfinder V2 — Production launch evidence (2026-10-17)

## PUBLIC RELEASE: LIVE
- Public URL: **https://kidbuster.vercel.app/**
- V2 production deployment ID: `dpl_HNrY7qsKPavRipiHWoNSs7Gr2K7A`
- Immutable deployment URL: `https://kidbuster-8jrb1kzpz-thembones90-sudos-projects.vercel.app`
- Public alias explicitly assigned to this new release using `vercel alias set` on 2026-10-17.
- Previous deployment for emergency rollback: `dpl_Dxaawc9L7Xc6ppWpveeyWfYQnHeQ` / `kidbuster-mjmh9ok3e-thembones90-sudos-projects.vercel.app`.
- V2 source branch `pathfinder-v2`, commit `6b2be1a` before this documentation update.

## PRODUCTION VERIFIED
1. All **76** automated test files passed after correcting legal price assertion.
2. Public desktop GET /: HTTP **200**, all seven protocol labels present (Classic, Sugarcoat, Fairy, Blitz, Beida, OF Protocol, Preply), no browser page JavaScript errors.
3. Public mobile GET /: successful (304 browser cache response), document title Pathfinder and no horizontal overflow at 390px.
4. Public GET /api/ping: **200** `{"ok":true}`.
5. Public Terms of Use: **200**; displays **RSD 1,233/month** base billing amount.
6. Protected pre-cutover production build: real verified Free signup on owner-controlled synthetic Gmail alias. Signup POST returned **202**, Postmark relay delivered genuine email to Gmail; actual one-time link returned **200**, new active Free license.
7. Protected pre-cutover production build: recovery POST **202**, actual recovery email delivered through Postmark, one-time link **200**, and the **same original license** returned rather than a duplicate.
8. Public POST /api/payment-webhook with unsigned synthetic event: **400**, invalid webhook request.
9. Public POST /api/create-checkout-session with invalid license and no verified auth: **401**.
10. Live Lemon Squeezy API key authenticated using GET /v1/stores: **200**. Live store `429633` (RSD); published Pro product `1446995`, default monthly variant `2258907` at 123300 minor units (RSD 1,233); official Lemon Squeezy docs say the sole default variant normally has `status=pending`.
11. Live Lemon Squeezy webhook `143499`, `test_mode=false`, callback `https://kidbuster.vercel.app/api/payment-webhook`, configured for 12 subscription/payment/refund events, separate valid signing secret in Production Vercel.
12. Production `EMAIL_PROVIDER=pathfinder_relay`; `PATHFINDER_MAIL_RELAY_URL=https://pathfinder-mail-relay-production.up.railway.app/send`; **PATHFINDER_MAIL_RELAY_TOKEN Production Secret installed by owner at Vercel**, confirmed in environment metadata. Its real operation proven by the end-to-end production email tests above.
13. Railway Postmark relay health **200**, unauthenticated POST **401**. Separate staging and production bearer tokens. ASOC Postmark token stays in Railway referenced variable, never copied into Vercel.
14. Earlier staging Lemon Squeezy Test Mode GREEDISGOOD checkout actually charged half price and signed payment webhook activated Pro. Staging signup and recovery end to end also independently passed.
15. No actual live customer payment/charge was initiated by Skynet during launch.

## Open follow-ups — not launch regressions
- **A full LIVE paid checkout creation and actual payment-to-Pro webhook activation have NOT been independently tested**. The synthetic production teacher's signup/recovery and failure authorization paths passed, and direct Live Mode provider API/store/product/webhook were verified. The first deliberately approved low-risk live purchase remains the final monetization transaction proof. Do not represent it as already confirmed.
- **Recurring GREEDISGOOD forever** must be verified against the test subscription on **2026-11-17**; initial test charge was 50% off but its invoice showed gross price.
- Live GREEDISGOOD discount `1186581` is 50% forever limited to **one** total redemption. Test coupon is consumed.
- Production test created a synthetic owner-controlled Free test account; it has no purchased subscription. Clean up via existing admin controls if desired, without touching other customer data.
- Keep using V2 automated tests and post-deploy smoke checks for future releases. Emergency rollback: reassign `kidbuster.vercel.app` to `kidbuster-mjmh9ok3e-thembones90-sudos-projects.vercel.app` only if a verified production regression is found.

## Security
- No customer tokens, provider API keys, webhook signing secrets, or bearer credentials recorded here.
- No staging credentials copied to production; live and staging webhook and mail tokens are separate.
- Public endpoint rejecting invalid signature confirmed after cutover; 401 checkout authentication confirmed.
- No live charges made during the audit.
