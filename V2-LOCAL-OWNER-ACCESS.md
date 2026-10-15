# Pathfinder V2: Local owner access (12 October 2026)

This is an **isolated local development environment**. Production owner credentials are not copied, read, or validated here. The original static Python preview at `http://127.0.0.1:8765/` has been replaced with a Node localhost server on the same address, supporting a minimal backend for owner/licensing tests.

## Access as V2 owner
1. Open `http://127.0.0.1:8765/` on SKYNET.
2. Open Windows PowerShell and run:
   `Get-Content 'A:\PATHFINDER V2\.v2-local\v2-owner-key.txt' | Set-Clipboard`
3. In V2 click **Access / Change code**, paste the code into V2 and confirm.
4. V2 should show **Owner Pro** with owner code tools. Your **live master key remains unchanged** and deliberately does not authenticate locally.

## Start or restart the local server
From `A:\PATHFINDER V2` run `npm run dev:v2:local`. It listens ONLY on `127.0.0.1:8765` and serves the V2 interface plus the following local, minimal API routes:
- `GET /api/ping`
- `GET /api/license-status`
- `POST /api/admin-create-license`
- `POST /api/admin-license-lookup`, including owner-only batch preview/retirement/new stock generation.

It blocks real payment, external model generation, email signup/recovery, Krisp webhook creation/sync and other integrations while local staging isolation is incomplete. Those routes return HTTP 503. Do not use locally generated keys for live customers.

## Local-only files
- `A:\PATHFINDER V2\.v2-local\v2-owner-key.txt`: dedicated random V2 **development** owner credential, generated once at startup.
- `A:\PATHFINDER V2\.v2-local\licenses.json`: separate, persistent local development KV database.
- `.v2-local/` is ignored by Git. Never share its contents or commit the files.
- No production owner keys, production KV tokens, real customer licenses or Krisp credentials are used.
- Browser localStorage still holds the last saved code on `127.0.0.1:8765`; selecting the new V2 owner code is necessary once after replacing the static preview.

## Verification
2026-10-12: local API `GET /__v2/health` 200. Local owner returns Founder=true, plan=pro. Wrong key returns 401. Owner can create an unactivated test manual code, first claim starts its 30-day clock, later same-browser checks preserve its expiry. Real Puppeteer/Chrome UI test at the local dev server returned `Owner Pro`, `ownerToolsVisible=true`, no JS page errors. Full `npm test` suite: **21/21 files passed** after local KV adapter change.

## Restrictions
This is not a separate Vercel production deployment. No V2 staging URL, real payment integration, model generation or real Krisp transcript sync has been configured. Production Pathfinder remains completely separate.

## No-restart local owner alias (October 12)

While the original localhost:8765 server stays running, launch `npm run dev:v2:alias` to provide an alternative V2 owner-access bridge at **http://127.0.0.1:8766/**. The custom owner alias is stored privately in `.v2-local/v2-owner-alias.txt` (Git ignored); the existing generated V2 owner key remains in `.v2-local/v2-owner-key.txt`. The bridge accepts the alias only from localhost, replaces that one owner code in requests to the existing local backend, and never changes live Pathfinder credentials, server processes or production data. Never push the local alias file or use it as a production administrator password. The production master account is untouched.

Verified over HTTP: original localhost:8765 rejects the alias (401); alias bridge localhost:8766 returns Pro/active/founder (200); wrong code rejected (401). Verified in actual headless Chrome: Change code -> alias -> Owner Pro, Owner code tools visible, zero page errors.
