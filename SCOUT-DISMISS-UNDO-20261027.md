# Scout inbox: Dismiss → Undo for three seconds

Explicit owner request: remove the native Scout lesson-dismiss confirmation;
offer Undo on the Dismiss button for three seconds instead.

- The existing card remains visible, with Dismiss changed to Undo for 3000ms.
- No dismiss request is made before expiry. Undo cancels the timer entirely.
- Expiry changes the button to Dismissing… while the existing protected backend
  operation runs. Only a successful server response removes the lesson.
- Poll redraws preserve the original grace window. The card cannot be claimed
  or automatically imported during a pending dismissal. Other lessons remain
  unaffected; concurrent dismissals have independent Undo timers.
- Account reset/sign-out cancels pending timers. Generation/key checks prevent
  an old account's delayed action from being sent under a new account's key.
- Failures restore a retryable Dismiss button without claiming deletion or
  falsely promising that an uncertain network request changed nothing.
- Token replacement/disconnect confirmations and Krisp behavior are unchanged.
- The Scout client reference is cache-busted. No backend, access gate, stored
  content or desktop Scout change is included.

Verified with synthetic data only:

- test-scout-dismiss-undo.cjs: exact grace boundary, Undo, independent lessons,
  account switch, in-flight duplicate clicks, non-OK and offline responses PASS.
- test-radar-van-browser.cjs: real headless browser + in-memory backend PASS,
  including Undo cancellation, polling, delayed removal, deduplication, existing
  claim/ACK/import resilience and mobile behavior.
- test-scout-automatic-notes.cjs: automatic import and occupied-note protection
  PASS; no report generated and Krisp state untouched.
- Release static/synthetic integrity gate and git diff --check PASS.

Logs: ../scout-dismiss-browser-final.log, ../scout-dismiss-auto-regression.log.
The full release suite has not been rerun for this change; it must pass before
deployment. This change is committed but not published. The previous sizing
candidate does not contain it or the newer Copy suggestions label correction.
No real transcript was dismissed, no user browser tab was controlled, and the
installed/running Scout was not changed.
