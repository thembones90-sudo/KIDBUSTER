# Pathfinder V2 Production Launch Gate — 2026-10-17

## Read-only production audit result
**Hold unrestricted paid-customer launch.** Do not deploy V2 over the existing `kidbuster` Production target until the two externally backed blockers below are resolved and a real end-to-end smoke test passes.

### Confirmed progress
- GREEDISGOOD first test-mode payment successfully charged half price, and its genuine signed provider webhook unlocked Pro in isolated staging. Test order 9780881; staging subscription 2614679 (per Claude's provider verification).
- Test mode renewal pricing requires follow-up at the 2026-11-17 renewal. The first order was discounted but the subscription invoice shows the undiscounted gross total.
- V2 local test suite: **ALL 76 TEST FILES PASSED** on 2026-10-17.
- Terms of Use corrected to the RSD 1,233/month base price, consistent with the Lemon Squeezy store's RSD billing. The checkout determines actual payable totals and tax.
- V2 branch and pricing change were pushed to `origin/pathfinder-v2` (commit `b235e35`).
- The production site `kidbuster.vercel.app` remains available (HTTP 200); previous production deployment dated 2026-10-14 was not modified.
- Store owner merchant onboarding was approved in earlier Lemon Squeezy dashboard check.

### Production launch blockers
1. **Production Lemon Squeezy API authentication fails:** all four Lemon Squeezy variable names exist on `kidbuster` Production, but a read-only `GET /v1/stores` using the production-configured API key returned **401 Unauthorized**. This must be fixed with an authorized Live Mode API key, proper Live Mode Store/Variant IDs and a matching signed Live Mode webhook on the exact production endpoint. Merely seeing variable names is not proof of operation. The temporary local production environment audit file was securely excluded from Git and deleted after verification. No live payment attempted.
2. **Verified email sender not configured:** `kidbuster` Production lacks `RESEND_API_KEY`, `PATHFINDER_EMAIL_FROM`, `EMAIL_PROVIDER`, and `PATHFINDER_APP_URL`. The V2 email service requires `EMAIL_PROVIDER=resend` with a usable API key and verified sender to email signup/recovery tokens. V2 staging Preview has `EMAIL_PROVIDER` and `PATHFINDER_APP_URL` but lacks `RESEND_API_KEY` and `PATHFINDER_EMAIL_FROM`, so live delivery was not tested there either.
3. **Sender domain / provider access:** Vercel team reports **0 managed custom domains**; no verified Resend sender domain or Resend API credential was located or established. Operator must provide a verified, owned email domain/sender or access to a suitable transactional mail service. Vercel's `vercel.app` domain is not an owned DNS domain for third-party sender verification.

### Follow-up runbook (with owner/provider access)
1. Provision and verify a transactional sender domain and Resend account; establish private API key and sender.
2. Add provider configuration to **staging Preview only**, then verify a genuine email verification signup + recovery link end to end with approved test inboxes.
3. Create/obtain valid **LIVE** Lemon Squeezy API key, verify Live Mode store and Pro variant IDs, and register/verify production webhook with a distinct signing secret. Keep all secrets in provider settings, not the repository.
4. Add the correct variables to `kidbuster` **Production** after independently confirming their sources. Test read-only provider authentication and checkout creation before taking a real payment.
5. Deploy reviewed V2 Production intentionally (the Vercel `vercel.json` explicitly disables automatic `pathfinder-v2` Git deployments), validate all protocols, signup/recovery, hosted checkout, webhook ownership, Pro access, portal, cancellations and signature rejection. Owner must authorize an actual controlled live payment if required for final billing proof.
6. Only then open external paid marketing and share the live GREEDISGOOD code. The live discount allows one redemption; test-mode discount has already used its one redemption.

### Safety and deployment scope
- No new live payments, customer changes, or Lemon Squeezy live API keys were created by this audit.
- No Vercel Production environment variables, webhook configurations, or deployments were changed.
- This file and pricing copy are in the nonproduction V2 branch; `kidbuster` Production is unchanged.

Record written by Skynet after direct CLI and provider API inspection on 2026-10-17.
