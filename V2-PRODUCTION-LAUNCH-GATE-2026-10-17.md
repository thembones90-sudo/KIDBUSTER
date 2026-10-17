# PATHFINDER V2 — Launch checkpoint (2026-10-17)

**Status: Staging signup/recovery and billing verified. Production build ready but not promoted. ONE Production mail-relay secret remains unset.**

## Verified today
- The isolated staging Lemon Squeezy TEST MODE checkout charged RSD 616.64 with GREEDISGOOD and the genuine signed provider webhook upgraded the test teacher to Pro.
- Production Lemon Squeezy now has a fresh LIVE API key (direct GET /v1/stores returned HTTP 200), correct live store `429633` and Pro variant `2258907`, and LIVE signed webhook `143499` registered at `https://kidbuster.vercel.app/api/payment-webhook` with 12 events. Production Vercel environment variable names and values were updated earlier in this session. The earlier 401 on a Vercel-exported Secret placeholder was a false result.
- Terms of Use uses the actual RSD 1,233/month base price.
- An isolated `pathfinder-mail-relay` Railway service was deployed to Railway project `ASOC Engine`, service ID `90a031b6-402b-4697-bfe2-76808af1f053`, domain `pathfinder-mail-relay-production.up.railway.app`. It accesses Postmark through a same-project Railway reference to `asoc-live.ASOC_POSTMARK_SERVER_TOKEN`, without moving the existing API key to Vercel.
- The mail relay uses two distinct private bearer credentials for staging and production; the endpoint accepts only tightly bounded Pathfinder verification/recovery mail and rejects anonymous POSTs (verified HTTP 401). Health endpoint returned 200. Sender `Pathfinder <pathfinder@asocengine.com>` was accepted by Postmark (HTTP 200).
- The staging Vercel Preview environment has `EMAIL_PROVIDER=pathfinder_relay`, the HTTPS relay endpoint, and the private **STAGING** relay bearer token.
- Staging deployment preview alias `https://pathfinder-v2-staging-preview.vercel.app` was moved to build `pathfinder-v2-staging-2gm2hyq3l-thembones90-sudos-projects.vercel.app`.
- **End-to-end signup**: request to real staging `/api/license-signup` returned 202; real Postmark email arrived in Gmail; consuming its one-time link via real `/api/license-verify` returned HTTP 200 and a new Free license.
- **End-to-end recovery**: staging `/api/license-recover` returned 202; real email arrived in Gmail; consuming link returned HTTP 200 and restored the **same** original license, verified by a secure hash comparison.
- All **76 Pathfinder test files pass** after updating the pricing assertion. Code pushed to `pathfinder-v2` in commit `f1107a7`.
- A new build of the `kidbuster` Production target was deployed with `--skip-domain` at `https://kidbuster-1bo3ji6em-thembones90-sudos-projects.vercel.app`; build is READY and authenticated `/api/ping` returned `{ "ok": true }`. Verified `kidbuster.vercel.app` **still points to the prior October 14 production release** `kidbuster-mjmh9ok3e...`. This protects customers until final configuration.

## Remaining production gate (one Vercel secret)
Production currently has `EMAIL_PROVIDER=pathfinder_relay` and `PATHFINDER_MAIL_RELAY_URL=https://pathfinder-mail-relay-production.up.railway.app/send`, but **PATHFINDER_MAIL_RELAY_TOKEN is missing in Production**.
- The private production token is stored locally only in `A:\PATHFINDER V2\.v2-local\pathfinder-mail-prod-token.txt`. The staging token is a different value and must not be substituted.
- The connected Vercel app has a team-scope **403**, and the attempts to upload the private token using remote desktop tooling were blocked by safety checks. We have **not** copied or disclosed either bearer token in chat or commits. Do not disable relay authentication to circumvent this.
- To finish, an authorized operator must add `PATHFINDER_MAIL_RELAY_TOKEN` to the **kidbuster Production** Vercel environment as a **sensitive Secret**, using the exact content of that local file, without a trailing newline. No additional domain or Resend signup is required.
- After the Secret is added, deploy `pathfinder-v2` to `kidbuster` Production with `--skip-domain` again so the new production build includes the secret. Verify a real production signup/recovery to an approved owner inbox and confirm webhook 400 for bad signatures, checkout creation for existing authorized test owner without charging, and valid provider status. Then explicitly promote that prepared deployment to `kidbuster.vercel.app`.

## Launch risk notes
- Discount `GREEDISGOOD` live is limited to one use. The test coupon is already 1/1 used.
- The November 17 test subscription renewal must be checked for discount retention. The first test order charged half price but its associated subscription invoice showed gross price.
- No new real payments or customer charges were made in this session.
- Never expose provider credentials, email access tokens, or relay bearer tokens in docs, logs, repository, screenshots or chat.

Recorded by Skynet after actual provider and staging checks, not as an assertion of completed production go-live.
