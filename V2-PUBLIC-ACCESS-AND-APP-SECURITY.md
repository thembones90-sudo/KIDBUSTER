# V2 Staging: Public Website Access vs Protected Application Functionality

Status as of 2026-10-16. This supersedes every earlier statement that the
`pathfinder-v2-staging` Vercel project is SSO-protected.

## Owner decision

On 2026-10-16 the owner had project-level Vercel Authentication (SSO) disabled
on `pathfinder-v2-staging` (`ssoProtection` = disabled) so external testers can
open the app without a Vercel login. This was a deliberate decision. **Do not
re-enable SSO** because older docs, `tools/staging/check-staging-readiness.mjs`,
or test fixtures still describe it as required. Changing it back needs a new
explicit owner decision.

## Two separate layers

| Layer | What it controls | Current state |
|---|---|---|
| **Website accessibility** (Vercel deployment protection) | Whether anyone can load the HTML, CSS, legal pages and `/api/ping` | **Public.** No Vercel login. |
| **Application functionality** (Pathfinder's own server checks) | Whether anyone can generate a report, see license data, use Krisp, use admin tools, start checkout, or change billing | **Protected.** Unchanged and enforced on the server by each API function. |

Turning off SSO only removed the first layer. Every gate in the second layer
lives in the `api/` code and runs on every request, whoever is asking.

## Application gates verified on the public staging alias (2026-10-16)

Read-only probes against `pathfinder-v2-staging-preview.vercel.app`, using no
valid credentials:

| Endpoint | Request | Result |
|---|---|---|
| `/` | anonymous GET | 200, app shell loads, no SSO page |
| `api/generate` | no license key | 401 `missing_key` |
| `api/generate` | made-up key | 401 `invalid_key` (also when a client `systemPrompt` is injected) |
| `api/license-status` | made-up key | 401 |
| `api/krisp-session` | anonymous | 403 |
| `api/krisp-webhook` | made-up token | 401 |
| `api/admin-create-license`, `api/admin-license-lookup` | anonymous POST | 403 owner required |
| `api/payment-webhook` | unsigned | 400 |
| `api/create-checkout-session` | no email / made-up key | 400 / 401 |
| `api/feedback` | no app key | 401 |
| `api/license-signup` | invalid email | 400 |

For any caller with a valid key, generation still goes through the throttle
(per-key rate limit and concurrency cap), then the entitlement/quota hold, then
the server-built prompt (clients cannot supply system instructions), then the
output contract.

## Isolation (checked by variable name and target only; values not read)

- Every staging variable targets **Preview** only. Staging has no
  production-target variables.
- `LEMONSQUEEZY_*` is not set, so checkout and payments **cannot** run.
- No email provider key is set, so self-service signup cannot deliver a key.
  Testers need a key issued by the owner.
- Redis (`KV_REST_API_*`) belongs to staging and is separate from production.
- Still unverified: whether the staging `ANTHROPIC_API_KEY` is a separate,
  spend-limited key. Now that the site is public, this should be confirmed.

## Will anything restore the SSO gate?

- `ssoProtection` is a **project setting**. Deployments, redeploys, alias
  changes and `vercel.json` cannot set it. Only a project settings change
  (dashboard, API or CLI) can turn it back on.
- Main risk: an agent following older docs. These now have a supersession
  pointer here: `AGENTS.md`, `CODEX-V2-CONTINUATION-2026-10-12.md`,
  `V2-STAGING-ISOLATION-2026-10-12.md`,
  `V2-STAGING-PAYMENT-READINESS-2026-10-12.md` and `V2-KRISP-INGRESS.md`.
- `tools/staging/check-staging-readiness.mjs` still reports
  `sso_all_deployments_unverified` when SSO is off. That blocker means "owner
  decision pending in the tool", **not** "re-enable SSO". Changing the checker
  to recognise the approved public mode needs owner sign-off.
- The Krisp ingress hostname override and the deny-all routing rule are now
  redundant but harmless. Leave them in place.

## Open exposure items (owner decisions; no changes made)

1. The public alias does not send `X-Robots-Tag: noindex`, so search engines
   can index it.
2. **Resolved 2026-10-16 (owner-approved):** the 34 older preview deployments
   were deleted. Only the current preview (`of6b7q6m8`, behind both aliases)
   and the old production-target deployment (`czgcp0en9`, see item 3) remain.
   Deleted URLs return 404.
3. `pathfinder-v2-staging.vercel.app` (the project's production domain) serves
   an old deployment with no variables. It is public, and generation fails
   closed with 500 "Could not verify your license". It is broken and confusing
   for testers.
4. Option for 3: delete that deployment, or move staging to the
   project's Production target with Standard Protection. Standard Protection
   keeps the production domain public and protects the per-deployment URLs.

Production (`kidbuster` project, `kidbuster.vercel.app`) is not affected by any
of this.
