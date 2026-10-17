# PATHFINDER V2 — GREEDISGOOD Friends Discount
Updated 2026-10-17

## STATUS: CREATED AND PUBLISHED IN LEMON SQUEEZY
- Code and invoice-facing name: GREEDISGOOD
- Discount amount: 50% percentage discount.
- Applies to Pathfinder Pro monthly product ONLY.
- Recurring subscription discount: applies every month, applies forever.
- No start date / no expiry date.
- Redemption limit: ONE total per coupon code (not per customer). Therefore only one friend can redeem GREEDISGOOD; further friends require separate coupon codes unless owner explicitly changes limit.
- Existing product and regular subscription were not intentionally changed.
- Store dashboard localized price: RSD1,233/month; 50% means roughly RSD616.50/month before taxes/conversion. Confirm merchant checkout currency if USD $12 / $6 amounts matter.

## RECORDS VERIFIED
- TEST MODE discount ID 1186573; user interface showed entry GREEDISGOOD with zero redemptions.
- LIVE MODE discount ID 1186581; verified by UI Automation that Test mode = OFF and discount status = Active, name = GREEDISGOOD, code = GREEDISGOOD, amount = 50, Pathfinder Pro selected, applies forever = ON.
- Live Product: Pathfinder Pro, monthly, published. Verified on Products page while Test mode = OFF. Product was copied from existing test-mode product.
- No customer purchase, charge, renewal, refund, webhook simulation or external merchant approval was verified during this session.

## IMPORTANT LAUNCH / CUSTOMER SAFETY
- Do not hand out a paid checkout link until merchant acceptance and production payment-webhook / license-activation integration are operational and signed end-to-end.
- V2 staging Lemon Squeezy test key, store and variant credentials were still reported missing in the 2026-10-15 staging status. Local code tests do not prove the hosted billing webhook is live.
- Before paid sales: check pricing/currency, validate $6 first checkout, verify recurring discount, license activation via signed payment webhook and email delivery.
- For multiple friends, owner must decide exact number of 1-use coupons or authorize a common code with a larger cap.

Provider dashboard record: https://app.lemonsqueezy.com/discounts/1186581
Test dashboard record: https://app.lemonsqueezy.com/discounts/1186573

No repository deployment or application source changes were made in this task.

## CLAUDE BILLING AUDIT (2026-10-17)
Code, staging env names and local tests only. No real charge, no Lemon Squeezy API call, no webhook to a live endpoint.

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Live price, currency, interval | OWNER CHECK | Dashboard shows RSD 1,233. `terms-of-use.html` advertises US$12/month. Lemon Squeezy charges in the store currency, so check Settings > Store currency before a friend pays. |
| 2 | Hosted checkout accepts GREEDISGOOD | PASS (code) | `createCheckoutUrl` never sets `checkout_options.discount:false` or `discount_code`, so Lemon Squeezy shows its default code field. Guarded by a new check in `tests/test-payment-provider.cjs`. |
| 3 | First payment discounted 50% | NOT VERIFIABLE YET | Needs a Test Mode checkout (test discount 1186573, card 4242...). |
| 4 | Renewals keep the discount | NOT VERIFIABLE YET | Lemon Squeezy behaviour; check the second test-mode invoice or the subscription's discount in the dashboard. |
| 5 | Signed webhook activates Pro | PASS (code) | `subscription_created` maps to `payment_succeeded`, keyed by `custom_data.license_key`. The amount, variant and discount are never compared, so a $6 payment activates exactly like $12. Atomic webhook, lifecycle and refund tests pass (21/24/27 checks). |
| 6 | Cancel/expiry/refund/recovery | PASS (code) | Event map covers cancelled, expired, payment_failed/recovered/refunded, order_refunded. Refunds are advisory and never auto-revoke. |
| 7 | Isolated credentials per environment | BLOCKER (staging) | `pathfinder-v2-staging` has no `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_PRO_VARIANT_ID` or `LEMONSQUEEZY_WEBHOOK_SECRET` (only `PAYMENT_PROVIDER`). Checkout there returns 500 "Could not start checkout" and webhooks fail with 400. Production (kidbuster) was not inspected by rule. |
| 8 | Merchant approved for live payments | OWNER CHECK | Only visible in the Lemon Squeezy dashboard (store activation status). |

Low-risk note: the webhook does not check which product or variant was bought. Any subscription in the same store grants Pro. That's fine while Pathfinder Pro is the store's only subscription product.

### To finish verification (Test Mode only)
1. In Lemon Squeezy **Test Mode**, create an API key, then copy the store ID and the Pathfinder Pro **test** variant ID.
2. Add a test-mode webhook pointing at `https://pathfinder-v2-krisp-ingress.vercel.app/api/payment-webhook` (or the staging preview alias) with a new signing secret. Subscribe it to the subscription_* and order_refunded events.
3. Add the four `LEMONSQUEEZY_*` values to `pathfinder-v2-staging` (**Preview only**) and redeploy staging.
4. Use a synthetic teacher account to check out with GREEDISGOOD and the test card. Expect a first invoice at 50%, Pro activated, then simulate a renewal from the dashboard and expect the discount kept.
