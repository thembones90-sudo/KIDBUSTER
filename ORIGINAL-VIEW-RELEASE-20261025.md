# Original default and secondary three-column view — live

Owner requested the original arrangement as primary, retaining the new view as a
secondary option under Account. Runtime commit `3943f8b` is published on the
canonical release line. Deployment `dpl_26RJ1wsmsSQaHFk6atgNzjwCZS5s` is READY
production at https://kidbuster-q12xzqgpz-thembones90-sudos-projects.vercel.app.
Rollback: `dpl_9gzpCc5LxSmxMFSrv4ffPWqmroph`.
Exact committed archive: `.v2-tmp/deploy-3943f8b`.

The default is settings left and notes above output on the right. Its desktop
height is measured from the actual space below the header, with flexible editor
rows and contained scrolling for longer content. Tablet/mobile retain natural
vertical scrolling. The previous three-column mode, with Classic dimensions
across protocols, remains selectable through Account's Change view button.
The button is in the existing Account action row, closes Account when selected,
and saves the preference locally. Switching changes layout only: notes and
reports are preserved. A browser with no saved preference opens Original.

Verification: all 118 test files passed in a clean full run. Original mode checks
cover all seven protocols at five desktop sizes with all four header controls.
Secondary-mode geometry checks still compare every protocol against Classic.
Account compactness, 44px controls and both themes passed. The first run exposed
extra Account vertical space and a resize timing issue in the test fixture;
the control moved into the existing action row and the test waits for resize
frames before measuring. Neither test was disabled.

Release integrity passed. Protected candidate passed 24/24 live checks plus five
pairing, monitoring, identity-audit and cron refusal probes. Protection stayed on.
After promotion, classbuster.com and kidbuster.vercel.app each passed 24/24.
Actual live Chrome verification covered all seven protocols in both modes at
1909x990 and 1366x650, including the actual Account click flow, using synthetic
local browser state with API requests blocked. Screenshots are in chat outputs.
The live HTML, CSS and view script matched the exact git archive byte-for-byte.

No account or lesson data, paid generation, Scout installation or unrelated
pending code was used or changed. The recovered original checkout is preserved.
