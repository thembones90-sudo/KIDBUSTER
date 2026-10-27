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

Release is not yet promoted. Production rollback remains
dpl_3whb1tGibejwr7GzP6LUnJ5uKcXV, confirmed through authenticated alias inspection.
