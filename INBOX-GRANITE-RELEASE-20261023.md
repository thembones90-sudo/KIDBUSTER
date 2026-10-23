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

Not yet promoted: awaiting the owner's candidate account/plan, report and inbox
check as required by RELEASE-CHECKLIST.md. Publishing authorization was explicitly
received. Record current production again before promotion; last observed rollback
was `dpl_ADN6X9RxoLMPm5pUHu2Kq3ApMbu6` (ef51c8c). Post-promotion smoke and
CSS verification on both classbuster.com and kidbuster.vercel.app remain required.

Local artifacts: `.v2-tmp/inbox-full-tests-clean.log`,
`.v2-tmp/inbox-screenshots/`, `.v2-tmp/authenticated-smoke.mjs`.
