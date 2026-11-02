# Classbuster staging onboarding (one page)

This documents the already-created protected Vercel project `classbuster-isolated-staging` (no environment variables, deployments, or Git link); these tools do not create paid services, read secrets, deploy, or alter `kidbuster`.

1. Copy the two `staging/*.example.json` files to operator-only local files. Replace placeholders with redacted labels only. Never put tokens, webhook secrets, teacher emails, owner keys, or Google Sheets URLs in Git or logs.
2. Obtain explicit operator approval and independently provision a disposable Upstash database and Lemon Squeezy **Test Mode** store/variant/webhook. Record distinct Redis database IDs and mode-specific product variant IDs, plus locally computed 64-hex credential fingerprints. Lemon Squeezy Test and Live can use the same store ID; the mode-specific API key, webhook, and variant must be independently verified. Console metadata and Vercel variable scopes cannot prove resource separation.
3. The protected project is `classbuster-isolated-staging` (`prj_nv9khsQRl2OMMTaw15lfdq8LXu8m`). Add only sanitized variable name/scope metadata to the manifest; never record values. Keep public access disabled/protected. Use a dedicated test email destination or disable it, and disable Google Sheets unless it has a dedicated test endpoint. Do not reuse owner keys.
4. Run local checks:

   `node tools/release/staging-preflight.cjs staging/classbuster-staging.manifest.example.json`

   `node tools/release/verify-staging-isolation.cjs staging/provider-evidence.example.json`

   These examples intentionally fail until operator evidence is supplied. A passing scope audit remains necessary but is not sufficient; run `audit-preview-environment.cjs` against sanitized Vercel target metadata too.
5. Set the staging-only nonsecret runtime value `LEMONSQUEEZY_MODE=test` (Production remains live/default), then have a second reviewer confirm in Upstash and Lemon Squeezy consoles: database IDs and credentials differ; Lemon is Test Mode; its test API key, product variant and webhook are not Live; the store ID may be shared across modes; email/Sheets destinations cannot reach production. Record reviewer/date/pass only. Cryptographic fingerprints require this independent console verification; no real secret values ever enter code or JSON examples. Example files are intentionally NO-GO.
6. Only after gates pass may an operator deploy an immutable candidate, using the exact commit recorded in the manifest: `vercel deploy --prod --skip-domain` from an exported archive, then protected-preview refusal smoke. This command is documentation only and is not run by staging tooling. Never run positive payment/webhook tests without separate explicit approval.

The verifier distinguishes scope separation from actual resource isolation. It deliberately cannot prove provider facts from Vercel metadata and never accepts matching variable names as evidence.
