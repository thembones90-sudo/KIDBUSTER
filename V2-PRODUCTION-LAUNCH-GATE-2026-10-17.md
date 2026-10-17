# Pathfinder V2 Production Launch Gate — 2026-10-17
Status: Production billing configuration repaired; email sender setup and production release verification remain pending.

## Verified achievements
- All **76 test files pass** on V2.
- Latest V2 code and RSD 1,233/month terms are committed to origin/pathfinder-v2.
- Isolated test-mode GREEDISGOOD payment completed at 50% off and actual signed payment webhook unlocked Pro.
- **Dedicated LIVE Lemon Squeezy API key** created on 2026-10-17 under `pathfinder-v2-live-20261017`, verified with a direct authenticated GET /v1/stores returning HTTP 200.
- Live store ID `429633`, currency RSD; published Pathfinder Pro product `1446995`, monthly subscription variant `2258907`, RSD 1,233/month.
- **LIVE signed webhook created:** ID `143499`, URL `https://kidbuster.vercel.app/api/payment-webhook`, 12 subscription/refund event types, test_mode=false, unique 40-character signing secret.
- Local copies of the new live credentials are gitignored in `.v2-local/ls-live-api-key.txt` and `.v2-local/ls-live-webhook-secret.txt`; never print or commit.
- The new API key and webhook signing secret were uploaded to `kidbuster` **Production** Vercel environment as Secret variables. Store and variant IDs were set correctly as Config. `PAYMENT_PROVIDER=lemonsqueezy`, `SITE_URL`, and `PATHFINDER_APP_URL` were set as Production Config variables.
- Existing live deployment was **not changed**. No customer charged.

## Important correction to previous audit
Earlier report of HTTP 401 with the production-configured key was a **false diagnostic**, not evidence that the old key was invalid: `vercel env pull` supplies a fixed-length **redacted placeholder** for Secret variable values (even `PAYMENT_PROVIDER` and `SITE_URL` were placeholders), so an API call made using that placeholder returns 401 by design. Do not draw conclusions about Secret values from exported dotenv files. The new key was verified directly and independently returned 200. Metadata confirms Vercel Secret values updated, but their raw values cannot be independently recovered from the CLI. A production app deploy and signed webhook smoke test remain necessary.

## Actual remaining blocker
**No usable verified transactional email sender/Resend account is connected.**
- Production and staging are missing `RESEND_API_KEY` and `PATHFINDER_EMAIL_FROM`. Production has `PATHFINDER_APP_URL` now; `EMAIL_PROVIDER` remains unconfigured pending provider setup.
- The app's `api/_lib/email-service.js` requires `EMAIL_PROVIDER=resend`, verified sender, and API key to deliver 15-minute signup and recovery links. Do not bypass verification or expose keys.
- Vercel team has no owner-managed custom DNS domain; Gmail history confirms ownership of **asocengine.com** through Porkbun (registered until 2027-09-20), but this is an **ASOC Engine** brand/domain. Do not repurpose for Pathfinder without owner's choice. A mail-only subdomain is feasible once authorized, or the owner can provide a dedicated Pathfinder domain.
- Resend requires a verified sender domain for real customer emails (test sender onboarding@resend.dev can send only to the account owner). Resend account signup/connection and DNS verification are required; not completed.

## Final steps after sender is chosen
1. Set up a Resend account and verify a sender-only subdomain controlled in the user's DNS; create a sending-only API key.
2. Configure staging Preview `RESEND_API_KEY`/`PATHFINDER_EMAIL_FROM` and verify email signup and recovery with approved real test inboxes.
3. Configure production `RESEND_API_KEY`, `PATHFINDER_EMAIL_FROM`, and `EMAIL_PROVIDER=resend` and verify sender access privately.
4. Deploy the reviewed V2 branch to `kidbuster` Production explicitly. Existing deployment must remain intact until these gates pass. Validate signup/recovery, one real verified purchase or owner-approved safe paid test, webhook signature enforcement, Pro/portal, and mobile seven-protocol operation.
5. Check GREEDISGOOD test subscription renewal pricing on 2026-11-17: discounted initial order but non-discounted initial invoice record.

## Secrets, scope, and safety
- Never print secrets in chat/logs, store them in Git, or copy live credentials into staging.
- No production deployment, live charge or customer data mutation was performed during this session.
