# Granite transcript inbox — release evidence

Presentation revision: `9150d56`, based on production revision `ef51c8c`.
Branch: `codex/classbuster-inbox-granite-20261023` (pushed to origin).

Changes: compact sans-serif heading; neutral granite panel/cards; matching source
sections and count badges; inline SVG icons; simple matching empty states; green
import actions; 44px close/menu/action targets. Removed oversized serif styling,
green panel gradients, decorative empty-state box and promotional copy.

Only index markup, scoped inbox CSS and tests changed. No backend, credential,
billing, queue, acknowledgement, automatic import, or owner-only access changes.
Existing behavioral tests verify occupied notes are not overwritten and preview
does not claim/ACK a lesson.

Verification:

- Local release-integrity gate passed; protected release ancestry verified.
- New rendered test: empty/populated at 1440x900, 900x550, 390x780 and 320x480;
  bounded scrollable panel, no horizontal clipping, compact sans-serif text,
  matching empty states and Escape dismissal. Desktop/mobile screenshots inspected.
- Initial full suite failed six installer checks because this new checkout lacked
  its @vercel/blob dependency. `npm ci --ignore-scripts --no-audit --no-fund`
  installed the existing lockfile without source changes. Installer test passed
  in isolation. A subsequent clean full run passed **all 106 test files**.
- Staged production candidate: `dpl_9gnUdf3irmFhf9HUCkrz9g8S3C7u`,
  https://kidbuster-1cynf0vil-thembones90-sudos-projects.vercel.app
- Candidate CSS SHA-256 matches the tested local file. The unchanged candidate
  smoke script passed **23/23** through authenticated Vercel CLI transport.
  Deployment protection was not disabled; public Scout download stays unpublished.

## Published after authenticated verification

The owner signed in to the candidate and explicitly delegated the browser checks.
The UI showed Owner Pro, Full access forever and Unlimited usage; the owner-only
Scout section was available. A synthetic Classic report generated successfully,
Copy became available, and the granite inbox showed separate Krisp/Scout empty
states. No actual student information or account credential was read or copied.
The test draft was cleared and the original Long report preference restored.
The generated Short report raised an existing pronunciation-format validator
warning; generation rules were not changed as part of this visual release.

Before promotion, production had advanced to `1040ca9` (legacy-domain browser
forwarding). Preserved it by merging into this branch: release code `30708d5`.
The inbox, account/backend and import modules were unchanged from the authenticated
candidate; the added forwarding script explicitly does nothing on candidate hosts
or classbuster.com. The combined full suite passed **all 107 test files**.

Final candidate: https://kidbuster-cvnxz6l39-thembones90-sudos-projects.vercel.app
(`dpl_6QbdNPHdyL27nc4DaJNpmvvuoCJx`). Exact CSS hash and all **23/23** candidate
smoke checks passed. Promoted with the owner's explicit publishing authorization.
Rollback recorded immediately before promotion: `dpl_aGEEWFi919HN43i5ooguj5zQXfWo`.

Post-promotion: **23/23 public live smoke checks passed on each hostname**,
classbuster.com and kidbuster.vercel.app. A fresh authenticated Chrome tab on
classbuster.com loaded stylesheet version `20261023b` and visibly rendered the
new granite inbox with both source sections. Existing production workspace was
not altered. The live inbox tab was left open for the owner.

Bounded error-log inspection returned the expected refused unsigned-payment
probe and two existing Node url.parse deprecation warnings; no new inbox runtime
failure was identified. This is a short post-release observation, not ongoing
monitoring or a full product audit.

Local artifacts: `.v2-tmp/inbox-full-tests-clean.log`,
`.v2-tmp/inbox-screenshots/`, `.v2-tmp/authenticated-smoke.mjs`.
