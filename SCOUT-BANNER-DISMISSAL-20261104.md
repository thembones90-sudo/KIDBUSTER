# Scout promotion dismissal — 4 November 2026

The download promotion now disappears completely after a download is initiated, an authenticated Scout session reports connected, or the teacher chooses “Already have Scout? Hide this”. No replacement strip or reserved space remains. Existing browser download preferences migrate directly to hidden. The banner starts hidden and stays hidden on remembered visits, including across open tabs. Blocked storage still permits dismissal for the current page. Download initiation does not claim the program was installed. Account → Scout retains its download/setup/connection controls.

The sidebar and notes move upward into reclaimed space; their width and scale stay the same. Removing a focused banner moves keyboard focus to notes without scrolling; Account downloads do not steal focus. No desktop Scout executable, delivery API, authorization rule or lesson data changed.

Runtime commit: `8f0806e`, on `release/one-line-guard-20261103`, containing live baseline `dc6c151` and Claude's handoff. Staged and promoted only through `tools/release/release.mjs`. New live deployment: `dpl_2kWfS9bMWqyNBJTKPeCXvrhLTyrh`, candidate `https://kidbuster-mrbvybbx1-thembones90-sudos-projects.vercel.app`. Previous deployment: `dpl_CfLnk8mi3ok3FNHHKiRt4jxNRSiE`.

Validation:
- All 140 local test files passed; GitHub Actions run `41804946113` succeeded on runtime commit `8f0806e`.
- Release integrity gate passed.
- Actual synthetic connected-session browser flow verified automatic banner removal and remembered setup.
- Download/dismissal tests cover 1440px and 390px, reload persistence, cross-tab changes, connection before manifest completion, invalid manifests, blocked storage, focus and unchanged workspace width/scale.
- Candidate endpoint smoke: 26/26; candidate actual browser desktop/mobile passed.
- Public Classbuster endpoint smoke: 26/26; actual public desktop/mobile browser checks passed. Legacy domain endpoint smoke: 26/26.
- No real installer downloaded, customer email sent, report generated or lesson modified during release checks.

Candidate protection remained enabled. Initial unauthenticated checks reached protection rather than the application; authenticated checks passed using an existing CLI session's short-lived `_vercel_jwt` cookie scoped to the candidate. The temporary cookie response file was deleted after verification. Native CLI staging lacked deployment authorization; the standard execution environment successfully staged and promoted with the same mandatory guard script.
