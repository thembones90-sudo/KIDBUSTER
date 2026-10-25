# Original behavior restored and locked

The owner requested restoration of application controls and behavior from before
all resizing patches. Pending resizing work was stopped and was not promoted.

Live deployment: `dpl_5xc42UCfWnVw5JE8D2nhtpHj3kM1`.
Original runtime: `79e3e8e` (deployable files match `0650f80`).
Canonical restoration: `2ab8a53`; index.html, assets and tests match `79e3e8e`.
Both classbuster.com and kidbuster.vercel.app point to the original deployment.

Locked baseline:
- Original 1240px centered layout and native control sizes, without canvas zoom.
- Original Account opening, expansion, controls and natural page scrolling.
- Rating selection and explanations do not rescale the application.
- Full generated reports grow normally and the page scrolls as before.
- No internal Output scroll containers or fit-original assets.

Do not resume or publish resizing patches or change these control behaviors
without a new explicit owner request for that change. Previous resize-release
documents are historical. The unpromoted `0bf3623` candidate and uncommitted
rounding adjustment are superseded by this rollback.

Verification after rollback:
- Both public domains passed all 24 endpoint smoke checks.
- Live HTML SHA-256 matched the restored original source exactly.
- Live synthetic owner fixture: Account heading is 20px, wrapper is 1240px,
  computed zoom is 1, and fit-original script is absent.
- Rating 6 retains zoom 1.
- Actual generation UI with a simulated 3550-character report retains zoom 1,
  scrolls the page and has zero internal Output overflow.
- Static and synthetic release integrity passed. No paid generation, customer
  data writes, real lesson content or Scout installation was used.
- This was a promotion of the previously verified original deployment, not a
  newly built resizing release. No claim of a fresh full-suite run on the rollback
  is made; the resizing test run was stopped at the owner's rollback request.

The accidental `deploy-ab153bd` project was deleted at the owner's request and
was previously verified as not found. It is not part of this restored baseline.
