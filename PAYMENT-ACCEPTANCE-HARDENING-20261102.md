# Payment acceptance hardening — 2026-11-02 (Claude, branch release/staging-claude-20261102)

Status: source change on the Claude isolation branch only. NOT deployed, NOT merged.
Tests were written but NOT executed in this session (the session could not run
`node`/`npm test`). Before merging, run `npm test` and confirm every file passes.

## Problem
`/api/payment-webhook` granted Pro for ANY correctly signed Lemon Squeezy event:
- Test and live mode share store 429633, and MONETIZATION-TESTING-CHECKLIST.md
  told the owner the live webhook "can reuse the same secret string". A test-mode
  checkout (card 4242) reaching production would have granted real Pro.
- The product/variant was never compared (V2-FRIENDS-DISCOUNT-2026-10-17.md
  "low-risk note"): a subscription to any other product in the store granted Pro.
- A shareable checkout link or index pointing at the owner key could attach a
  subscription to the owner account (or retry forever as a 500).

## Change
`api/_lib/providers/lemonsqueezy.js` — acceptance policy after HMAC verification:
| Check | Refusal reason |
|---|---|
| `LEMONSQUEEZY_MODE` live (default) and event `test_mode: true` (meta or attributes) | `test_mode_event_in_live` |
| `LEMONSQUEEZY_MODE=test` and event lacks `test_mode: true` | `live_event_in_test` |
| Invalid `LEMONSQUEEZY_MODE` value | fails closed (HTTP 400, provider retries) |
| `LEMONSQUEEZY_STORE_ID` set and `store_id` differs | `foreign_store` |
| `subscription_created` with variant not in `LEMONSQUEEZY_PRO_VARIANT_ID` ∪ `LEMONSQUEEZY_ALLOWED_VARIANT_IDS` | `foreign_variant` (`variant_policy_unconfigured` if both empty) |

Events for a subscription already on file are deliberately NOT variant-gated, so
cancellation/expiry of an older variant can never be ignored into permanent Pro.
Identifiers absent from a payload (synthetic fixtures only; real payloads always
carry them) are not refused, except that test mode requires the explicit flag.
Signature header: arrays and non-64-hex values are refused; hex case-insensitive.

`api/payment-webhook.js` — refused events return 200 `{ignored:true}` (no retry
storm), change nothing, write a `payment_ignored` event and alert the owner
(per reason per day for mode mismatches; per event for store/product refusals).
Owner/founder keys are refused before AND after account resolution.

Release safety:
- `scripts/verify-release-integrity.cjs` (Vercel install gate) now requires each
  policy branch, the route's refusal stop and the owner check; 8 new mutation
  cases in `tests/test-release-integrity.cjs` prove the gate fails without them.
- `tools/release/candidate-smoke.mjs` gains 2 refusal-only probes (well-formed
  forged HMAC → 400; GET → 405). Expected smoke count becomes **26/26** (was 24).
- New regression `tests/test-payment-acceptance-policy.cjs` drives the real route.

## Required coordination (Skynet / Codex staging infra)
- Isolated staging that accepts Lemon Squeezy TEST purchases MUST set
  `LEMONSQUEEZY_MODE=test` (Preview/staging only). Without it, staging test
  purchases are refused as `test_mode_event_in_live` — safe, but staging payment
  journeys will not activate Pro.
- Production must NOT set `LEMONSQUEEZY_MODE` (or set `live`). Suggest the preview
  audit/staging readiness tooling (Codex-owned) check both.
- Synthetic staging tools (`tools/staging/guest-webhook-*.mjs`) send payloads
  without `test_mode`; under `LEMONSQUEEZY_MODE=test` they would be refused.
  Add `meta.test_mode: true` there if they are run against test-mode staging.
- If the owner sells any retained legacy Pro variant, list it in
  `LEMONSQUEEZY_ALLOWED_VARIANT_IDS` before deploying. Production env var
  presence was NOT inspected (listing was not permitted in this session).
- A refused but legitimate event can be replayed from the Lemon Squeezy
  dashboard (Webhooks → resend) after correcting configuration.
