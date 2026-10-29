# Scout software release capacity — 2026-10-29

Before:966,812,175 bytes across9 objects. After:701,842,974 bytes across6.
The conservative1,000,000,000-byte budget now has298,157,026 bytes available.
A117,194,818-byte candidate plus64MiB reserve passes preflight.

Three obsolete packages were archived outside the source checkout with durable
SHA-256 receipts, re-read verification and conditional ETag deletion:
- Classbuster-Scout-10ZU-Windows.zip:110,784,714 bytes.
- scout-1.0.0-20261024/ScoutSetup.exe:77,375,244 bytes.
- scout-1.1.0-live/ScoutSetup.exe:76,809,243 bytes.

Archives/receipts live in work/archived-scout-releases-20261029 under the parent
workspace. No lesson data is included. Current1.4.9, rollback1.4.8 and extra
recovery1.4.7 remain protected and present. Running Scout was not touched.

An initial full download was interrupted; it did not authorize removal. Bounded
8MiB conditional ranges, four in flight and per-range retries completed the
archive. Only after the full artifact and receipt passed checksum verification
was its remote copy removed. The superseded incomplete file was then removed.

The committed storage tool refuses non-software paths, current/rollback/recent
recovery removal, unverified/corrupt backups, existing-release overwrites and
uploads without safety headroom. Uploads are private and fully downloaded/hash
verified before their result can be used for publication. Release operations
must be serialized: a local preflight cannot reserve global capacity against
other independent upload tools. See RELEASE-CHECKLIST.md for mandatory usage.

Tests exercise capacity refusal, pagination, protected packages, interrupted
archival, corruption, remote metadata races, retry after removal failure and
private verified uploads with synthetic bytes. The actual store was inspected
again after cleanup and the next-installer preflight passed.
