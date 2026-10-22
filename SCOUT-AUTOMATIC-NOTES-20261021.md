# Scout automatic lesson notes — 21 October 2026

Initially implemented locally; subsequently published with explicit owner approval. See `SCOUT-AUTOMATIC-LIVE-20261021.md` for deployment identity, verification and rollback. No live account settings were directly changed by the deployment checks; connected browsers migrate on refresh.

## Approved behavior

- New Scout connections enable automatic notes import without ARM/DISARM.
- Existing connected browser sessions upgrade automatically on their next full session read, without rotating the desktop credential.
- Empty notes and an idle/empty report accept one finished transcript. Occupied notes, an existing report, and active generation block import. A draft typed during the fetch is rechecked before applying.
- Older pending lessons and overflow are eligible for automatic import, in received order. Existing server leases, browser ACK receipts, duplicate IDs and account scoping remain in use.
- A notice next to the notes field announces imports or waiting lessons without requiring the account panel to be opened.
- Disconnect revokes the device credential and stops automatic import. It does not erase notes or waiting lessons.
- Import never generates a report, changes protocol/rating, or calls Krisp settings mutations.

## Compatibility and safeguards

`automatic` is a persisted Scout connection property. The new browser requests it on Connect and migrates older connections through the authenticated `enable-automatic` action. Old backend ARM APIs remain for rolling compatibility with older clients; a stale ARM/DISARM request cannot pause an upgraded automatic connection. It receives an explicit `409 automatic` response instead. Disconnect remains the stop control.

Pending records use the existing claim lease and acknowledgement rules when imported automatically. Matched records keep their existing lease rules. Exhausted automatic attempts remain available for manual recovery instead of being discarded. Queue retention/capacity are unchanged; this is not indefinite transcript storage.

All session/ingress owner-only and optional single-master checks are unchanged. No credentials were read, generated, rotated, logged or deployed. No changes to the installed Scout executable are needed for this browser-side feature.

## Verification

- New real-browser + real-handler test: `tests/test-scout-automatic-notes.cjs`, 29 checks passed using synthetic transcripts, localhost, in-memory KV and blocked external browser requests.
- Owner-only and single-master security tests passed.
- Updated end-to-end browser recovery suite: 82 checks passed, including lost ACK/reload recovery, account isolation, storage unavailable, mid-fetch draft protection and mobile controls. Combined with the 29 new checks, 111 focused automatic-import/browser checks passed.
- Metadata regression passed after updating its asset-version expectation.
- The full `npm test` run completed but was not green: 50 checks failed across 94 files. The account compact-layout assertion and the older Free/Pro entitlement/metadata-browser/polling fixtures predate the new owner-only contract. The initial old Scout browser test also expected removed ARM controls; that suite was updated separately to the automatic contract and owner fixtures. See the focused browser log for its final result rather than treating the first full run as a final clean result.
- Full-run log: `scout-automatic-full-tests.log`. Updated recovery/browser log: `scout-automatic-browser-tests.log`.

No live Pathfinder delivery or browser import was executed during this implementation. Prior live Scout delivery receipts are not evidence that this new browser code is deployed.
