# Scout inbox student names

Owner reported that Krisp cards show student names while Scout cards show only
Lesson/date. Scout's display already prioritizes studentLabel, but older desktop
uploads leave it empty. The server previously returned that empty value unchanged.

The inbox summary now enriches missing labels from the same lesson's full,
role-labelled transcript. Explicit labels always win. Teacher direct greetings
and student "my name is" introductions provide evidence. Generic words, ordinary
third-person mentions, teacher names and conflicting candidates are excluded.
Uncertain lessons retain their dated fallback. No cross-provider/time matching,
AI service, new content storage, queue mutation or client sizing change is used.
Existing pending items benefit on read; no reupload or datastore migration needed.

Regression covers repeated/unpunctuated greetings, Unicode names, explicit label
priority, teacher exclusion, conflicting names, story characters, unsafe text and
the actual in-memory inbox summary of an unlabelled legacy-style record.

Validation: ALL 119 TEST FILES PASSED, including browser/card parity, inbox,
automatic notes, owner-only authorization and release integrity/negative tests.
The sandbox run could not connect headless Chrome to its loopback servers; a clean
full run with normal process/network permissions passed. Synthetic fixtures only.
Log: ../scout-student-names-full-native-tests.log.

## Live receipt — 2026-10-27 18:21 Europe/Belgrade

Runtime 84eb99ac2be60ed26ba9416b9e8f8f9f5e0bf3ff is live on classbuster.com:
dpl_6wangLPv258VpmDaergr63kYkyWk. Previous/rollback deployment:
dpl_3whb1tGibejwr7GzP6LUnJ5uKcXV.

CLI staging failed with Not authorized. The connected deployment API built the
exact pushed Git SHA successfully, but assigned production domains directly:
the supplied top-level skipAutoAssignDomains field was not honored by the
connector. Do not use this connector operation expecting a staged production
candidate. Alias inspection confirmed the direct assignment; the owner was told.

Immediate post-deploy verification passed on BOTH classbuster.com and
kidbuster.vercel.app: five exact-source comparisons, five migration/pairing/
monitoring refusal probes and all 24 standard smoke checks. Logs:
../scout-names-live-smoke.log and ../scout-names-legacy-smoke.log.

Owner-account Level 4 account/plan/report checks were NOT performed on this
release before direct assignment. Do not represent synthetic/refusal checks as
equivalent. No real account credentials, lesson contents or customer actions were
used. Desktop Scout and installed download version are unchanged by this release.

This includes the prior explicitly requested but previously unpublished changes:
stable menu geometry (276392f), Copy suggestions (96b3796) and Scout Dismiss/Undo
for three seconds (e286148). All are included in the clean 119-file test run.
