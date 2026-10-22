# PATHFINDER V2 / RADAR VAN — PRIVATE OWNER DEVELOPMENT LOCK

**Effective:** 2026-10-19. **Authority:** explicit product-owner decision.

RADAR VAN is an unfinished transcription-only companion. Until a separate, explicit authorization from the owner, **NO public release to Free users or paying Pro users** is allowed. It may be tested **only on the Owner Pro / master account** in authorized development environments.

Mandatory release invariants:
- Production RADAR VAN endpoints stay disabled unless a vetted owner-only release is authorized. Never set `RADAR_VAN_ENABLED=true` on a public project merely because preview tests passed.
- Even with `RADAR_VAN_ENABLED=true`, every RADAR VAN browser session, connect/disconnect, ARM, claim/ack, version poll, token issue through the route and device-token ingest MUST reject any non-owner identity with HTTP 403. The owner key is identified by `isFounderLicenseKey` server-side, never by a browser toggle or a Pro plan label.
- The device bearer token is only minted through an owner-authenticated session. Server ingest re-checks that the token belongs to an owner account; old Free/Pro tokens cannot upload.
- The browser shows no RADAR VAN controls to Free or Pro customers (403 -> hidden). Presentation is not a substitute for server authorization.
- Continue transcription-only; no saved audio, audio archive, noise cancellation or recording controls. Keep 24-hour transcript retention policy.
- The public release requires a *new* owner approval, finished product acceptance, user-isolation tests, explicit security/privacy verification, all relevant regressions passing, and staged Preview sign-off. It is not authorized by current owner-only approval.
- Existing tests written for pre-lock public Free/Pro entitlements must be updated deliberately rather than silently weakening the owner gate. Do not deploy unfinished RADAR VAN changes to real users.

**Implementation (local development only):** `api/_lib/radar-van.js` now denies nonowner `accountEntitlement` and `peekRadarVersion` before accessing private inbox state. The existing two route handlers enforce those functions for both normal browser and device-token calls. No RV feature deployment or flag activation is authorized by this change.
