# Codex staging isolation handoff — 2026-11-02

Branch `release/staging-codex-20261102`, baseline `88838e3`.

Implemented local-only tooling: `tools/release/staging-preflight.cjs`, `tools/release/verify-staging-isolation.cjs`, redacted `staging/*.example.json`, `STAGING-ONBOARDING.md`, and `tests/test-staging-provisioning.cjs`.

Evidence: targeted staging tests PASS (4 checks); existing preview-isolation tests PASS (10 checks); example preflight PASS. Full `npm test` could not start because this isolated checkout lacks installed `puppeteer` (`MODULE_NOT_FOUND`); no dependency install was performed.

No cloud resources, production env, secrets, deployment, payment, webhook, GitHub remote, or production datastore were touched. The requested external handoff path could not be written under the workspace sandbox; this committed in-repo copy is the handoff source.

Remaining operator gates: independently provision and verify separate Upstash and Lemon Squeezy TEST MODE resources; supply only sanitized IDs/hashes; run both scripts; then deploy an immutable protected preview only with explicit approval.
