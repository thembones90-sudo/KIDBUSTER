# V2 Krisp webhook ingress

> **Superseded 2026-10-16:** project SSO on `pathfinder-v2-staging` is now deliberately **off** by owner decision (public staging for external testers). Application-level license/quota/owner gates remain enforced. Do not re-enable SSO from statements below; see `V2-PUBLIC-ACCESS-AND-APP-SECURITY.md`.

Vercel SSO prevents Krisp from delivering to the protected app hostname. V2 therefore uses a dedicated hostname on the same isolated project:

- Protected app: `pathfinder-v2-staging-preview.vercel.app`
- External webhook only: `pathfinder-v2-krisp-ingress.vercel.app/api/krisp-webhook`

The ingress alias has a hostname-specific deployment-protection override. A published project-level routing rule denies every other path with 403 and `Cache-Control: no-store`. Its reviewed metadata is in `tools/staging/krisp-ingress-route.json`. This file documents the platform rule; deploying source alone does not install it. The fence must exist and be verified before allowing a protection override. Never exempt the app hostname, disable project SSO, or put an automation bypass secret in a connection link.

Every V2 release must assign BOTH aliases to the same tested READY preview deployment. Verify externally, without authentication: other ingress paths return 403; a fake webhook token returns the application's 401 JSON, not Vercel's login page; the app hostname remains protected. The published project-level fence survives deployment rollback. Keep that rule when moving either alias.

Existing users must copy their connection link again and replace the old app-hostname URL in Krisp. This changes only the hostname; it does not rotate the token, reset ARM, or change the stable license/queue identity. Only a real successful webhook delivery confirms the provider connection. Do not mark it connected just because a link was copied.

No original production deployment, credentials, or customer records are used by this ingress.
