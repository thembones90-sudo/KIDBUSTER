# Scout 1.4.17 production verification — 6 November 2026

The owner explicitly selected 1.4.17 after it superseded the initial 1.4.16 emergency assignment. Its cumulative native source includes the 1.4.16 model-download/retry recovery fixes and the restored Settings skin selector. No installer was rebuilt, no active recording was stopped, and no customer profile or lesson was deleted.

## Live result

- Deployment: `dpl_BLG2sQTeHamTDxWqBt5hK1yejfU1`, READY, `https://kidbuster-855x8qski-thembones90-sudos-projects.vercel.app`.
- Release stamp commit: `4299666ae59cf9a1a7565cafacc20cb3c7a7450a`.
- Public manifest: `https://classbuster.com/assets/scout-release.json`, available true, version **1.4.17**.
- Installer: `https://github.com/thembones90-sudo/KIDBUSTER/releases/download/scout-1.4.17/ScoutSetup.exe`.
- Complete independently downloaded artifact: HTTP 200, **116,633,177 bytes**.
- SHA-256: `da9233a3519bb75488e23f7d15d20de8cfac079c3779855d42db6467d2e38afe`, matches GitHub's asset digest and the actual live manifest. Installer ProductVersion reports 1.4.17. It remains unsigned by prior owner decision.

## Release and checks

Used the required `publish-scout-and-site.mjs sync --version 1.4.17` workflow. It ran the website suite and integrity check, verified newest native release digest, staged a production candidate with domain assignment skipped, checked the protected candidate, rechecked guards at promotion, promoted, checked production, and verified the live manifest. All completed with exit code zero. No direct deployment, promotion or alias assignment bypassed these tools.

The initial 1.4.16 candidate was never promoted. During verification, another release of the identical 4299666 runtime became live as `dpl_HtZSkrxeSBy38bX6tKgnqYhrDAXQ`; our guarded stage recorded 4299666 as its live baseline and preserved it. The pre-incident deployment was `dpl_2kWfS9bMWqyNBJTKPeCXvrhLTyrh` (1.4.15). Do not roll back the manifest alone to an older Scout recovery build.

- Full website suite: **141 test files passed**, also supported by GitHub CI run `42213384308` success on 4299666.
- Candidate, production, and legacy integration domain: **26/26 smoke checks each**.
- Independent live browser checks: public download CTA and actual Account Download Scout handler select exactly the verified 1.4.17 URL; downloaded-banner preference still removes the promotion. Account click used synthetic browser access with API calls intercepted; it is not evidence of a new real customer login or purchase.
- Native 1.4.17 source: `release/scout-1417-skin-sync-20261106`, commit `4b8635f`. Independently ran **101 skin/UI tests** plus **4 installer consistency tests**, all passed, using isolated source and temporary state. The earlier fixture import failed without tests on PYTHONPATH; corrected invocation passed. An earlier source log had one installer-version failure; the current installer alignment commit and all four current installer tests passed. No broad fresh 1188-test claim is made for this audit run.
- Settings → Skin offers **Classbuster Scout**, **Bloom · Cherry Blossom**, **GLA Toxin**. Verified real menu action changes the appearance live, persists valid selections, safely falls back for invalid settings, and does not invoke recording commands.

The local Codex CLI environment successfully staged and promoted with the same project/account identifiers that failed from the other execution environment. No project permissions or deployment protection settings were broadened. Protected candidate smoke used the existing CLI session's temporary `_vercel_jwt` cookie, scoped only to the matching candidate hostname, held in memory after deleting the response-header file. No credential was printed or committed.

## Customer follow-up

The live release is verified. Christopher, Devin, Sissy and Kara's individual installations and recovered deliveries have not been independently confirmed here. They should finish recording, exit Scout, install over the existing version, remain online for first-use model download, and retry pending lessons. Never clean-uninstall or remove undelivered recordings. Capture the actual processing stage/error if a lesson still fails.

The additional customer screenshot describes the existing import guard: Scout refuses to overwrite occupied notes/output. Confirmed at claimItem in assets/radar-van-client.js. It is not a Krisp conflict. That UI behavior was intentionally left unchanged in this emergency installer-manifest release and remains a separate follow-up.
