# Classbuster Scout public download

A responsive Scout install section is ready near the top of the Classbuster application. It remains **hidden until a verified installer is published**. No client binary is provided in this repository or in the accessible GitHub releases.

## Customer-release requirements

1. Recover and finish the Scout Windows app and backend from Leviathan or a trusted backup.
2. Test install, uninstall, startup, microphone permissions, lesson transcription, continuity, lesson presentation and import to Classbuster.
3. Protect Scout API operations server-side; validate owner, ordinary paid, free and unauthorized sessions. Do not expose unfinished beta endpoints.
4. Test and malware-scan the final installer. Record its real SHA-256. Verify downloading and installing on a clean PC.
5. Publish the verified binary as an actual GitHub release asset under `thembones90-sudo`, or at a stable Classbuster HTTPS download URL.
6. Only then modify `assets/scout-release.json` (example below), commit, test, and deploy. This is intentionally a code-reviewed release gate, not a runtime environment switch.

```json
{
  "available": true,
  "platform": "Windows",
  "version": "1.0.2",
  "sha256": "REPLACE_WITH_REAL_64_HEX_SHA256",
  "downloadUrl": "https://github.com/thembones90-sudo/<repo>/releases/download/<tag>/<installer>.exe"
}
```

Versions and example values are illustrative only, not a real installer URL. Never publish an invalid manifest. The UI will not show a link with malformed version/hash, untrusted hostname, non-HTTPS URL, credentials, query parameters, or unsupported file extension. The release manifest defaults to `{"available":false}`.

## Why static release metadata?

The production Vercel deployment already uses its maximum allowed serverless API functions. A separate release-metadata API would exceed that limit. A same-origin static JSON file is both sufficient and deploy-safe.

## Validation and rollback

`npm test` includes manifest validation, hidden-state verification and desktop/mobile browser checks of an example reviewed release. Verify published binary size, content type, checksum, download, install, license status, and transcript import before making the manifest available.

To withdraw a public release, publish `{"available":false}` and deploy. This leaves existing users' application/data untouched and stops new installer promotion. Existing downloaded installers are not remotely revoked.

**This is distribution scaffolding, not a functioning installer or public Scout backend.**
