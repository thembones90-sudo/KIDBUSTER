# Step 3 â€” new-transcript retention compatibility

The owner chose NEW transcripts only. Existing Krisp/Scout inbox records retain
legacy policy and representation; no blanket purge or age-based migration runs.

Phase A adds a backwards-compatible reader for per-record content references,
absolute PXAT support to test/local KV adapters, and a queue writer that can store
explicitly marked records under independent twelve-hour deadlines. Production
ingress is deliberately not marked yet. Phase A is the safe reader-aware rollback
for the later policy cutover. It also creates content-free timing receipts when
legacy Krisp items are handed to the browser, preserving their old window if the
browser defers them instead of importing them.

Phase B will mark newly accepted webhook/Scout records at receipt time. Queue
references contain no transcript text, previews, titles or student labels. Bodies
expire individually; a later arrival, lease, move or retry cannot reset the first
receipt deadline. Existing unmarked records retain current configured retention.
Content-free delivery/deduplication receipts have independent lifetimes.

Synthetic tests cover a mixed legacy/new inbox, idle body expiry without an inbox
poll, later arrivals, original deadlines after queue moves/deferral, account
isolation, invalid expiry and failed index publication. No real lessons are used.

## Policy cutover implementation — 2026-10-29 (not promoted yet)

New records accepted by both ingestion handlers use retentionVersion1 and an
absolute receipt+12h deadline. Legacy defaults remain unchanged. API responses
include newTranscriptRetentionHours alongside the old compatibility fields.
ACK/dismiss/import cleanup runs only after the queue write commits, retaining
shared pending copies; cleanup failures leave only individually expiring bodies.
Synthetic handler tests verify delivery, mixed old/new queues, retries after
expiry, later arrivals, connection continuity and cleanup failures. No existing
production transcripts have been migrated or deleted.
