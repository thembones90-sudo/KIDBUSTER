#!/usr/bin/env bash
# Adds the Lemon Squeezy TEST MODE values to pathfinder-v2-staging (Preview only).
# Values are piped from gitignored files in .v2-local and never printed.
# Prerequisite: node tools/staging/ls-test-setup.mjs
set -euo pipefail
cd "$(dirname "$0")/../.."
V=./.v2-local/vercel-cli/node_modules/.bin/vercel.cmd
S=(--scope thembones90-sudos-projects --project pathfinder-v2-staging --yes)
ids=.v2-local/ls-staging.json
add(){ printf '%s' "$2" | "$V" env add "$1" preview "" $3 "${S[@]}" >/dev/null 2>&1 && echo "added $1 (preview)" || echo "FAILED $1"; }
add LEMONSQUEEZY_API_KEY "$(tr -d '\r\n' < .v2-local/ls-test-api-key.txt)" --sensitive
add LEMONSQUEEZY_WEBHOOK_SECRET "$(tr -d '\r\n' < .v2-local/ls-webhook-secret.txt)" --sensitive
add LEMONSQUEEZY_STORE_ID "$(node -p "require('./$ids').storeId")" --no-sensitive
add LEMONSQUEEZY_PRO_VARIANT_ID "$(node -p "require('./$ids').variantId")" --no-sensitive
