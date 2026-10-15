# PATHFINDER V2 | Atomic Payment Webhook Processing

**Date:** 2026-10-12
**Location:** `A:\PATHFINDER V2`
**Branch:** `pathfinder-v2`
**Production:** Unchanged. This is an isolated local development change.

## Implemented

- Replaced unsafe deduplication read-before-write with account-scoped distributed serialization. `api/payment-webhook.js` verifies provider HMAC, resolves the existing owner license, then acquires a unique `paymentLock:<SHA256(licenseKey)>` using **Redis SET NX EX** before checking whether that exact signed body was already processed.
- Distinct signed events for the same account (creation, renewal, cancellation, resumption, expiry) are serialized as well as identical redeliveries. If another event is in flight, the new request gets **HTTP 503** plus `Retry-After: 2` rather than altering customer entitlements concurrently. Retryable errors are never acknowledged as successful billing updates.
- After acquiring the lock, the handler performs duplicate detection, the existing subscription lifecycle state machine, and only then writes a processed marker. Completed duplicate receives **HTTP 200** with `duplicate:true`. KV lookup errors and failed processing return **HTTP 500**, preserving provider retry semantics.
- Deduplication markers are written via one atomic `SET EX` command, not a `SET` followed by a separate `EXPIRE`; retention increased from 30 to 90 days.
- The lock uses 120-second TTL for crash recovery, and randomly generated 192-bit owner tokens. Token-checked Redis Lua release prevents an expired worker from accidentally deleting another worker's replacement lock.
- `resolveSubscriptionLicenseKey` ensures signed events resolved by customer/email index and those carrying checkout custom data contend for the **same account lock**.
- Maximum webhook body is **256 KiB**, with bounded buffering and **HTTP 413** before signature verification if exceeded. Provider signatures still use the original body bytes.
- Isolated local and memory KV adapters mirror TTL/NX/token release semantics for tests, while preserving the existing synchronous single-winner activation test guarantee.

## Verification (synthetic only)

`tests/test-atomic-payment-webhook.cjs` tests:
- first delivery intentionally paused before license record write; concurrent duplicate and a different event both get 503 without corrupting subscription state;
- first delivery commits exactly once; identical replay returns 200 duplicate; blocked cancellation succeeds on retry;
- event without custom license key and event with one race on the same customer-indexed lock;
- simulated write failure **after** license update but **before** dedup marker: responds 500, later retry safely marks complete;
- 32 simultaneous signed retries are either safely retryable or recognized duplicates;
- SET NX first winner, token ownership, 120-second-style crash expiry recovery (with synthetic clock), obsolete token cannot delete newer holder's lock;
- oversized body is rejected with 413;
- KV outage returns 500; retry after recovery successfully applies a synthetic payment;
- existing 64-browser manual license activation concurrency tests remain passing.

`npm test`: **25/25 test files passed**, including Chrome/Puppeteer browser smoke, manual activation race tests, payment lifecycle fixtures, and the new atomic-webhook adversarial test. `git diff --check`: clean.

## Deliberate limitations and next release gates

- **This is a time-limited lock, not an ACID transaction over all customer indexes and the license record.** A worker that somehow continues to write after its 120-second lease expires is not fenced by a single Redis transaction. The provider's webhook functions must be configured to terminate below the lease deadline, or fencing/CAS should be implemented before distributed production rollout.
- Redis SET NX EX and Lua compare-delete are supported by the installed Upstash SDK, but **not yet exercised against a real isolated Upstash staging instance**. Memory and local persistence tests do not prove production distributed atomicity.
- A lock released by a crashed serverless function will survive until its TTL ends. Provider retries are required and `503` is the deliberate response during contention.
- Refunds/chargebacks, payment failure/dunning policies, subscription reconciliation, and more complete provider-state handling remain separate tasks.
- No live customer credentials, payment events, Krisp deliveries or production database records were accessed or modified.
- Existing local V2 preview servers at ports `8765`/`8766` were **not restarted**. Backend source changes become visible in that preview on its next planned restart. Master aliases remain unchanged.

## Files

`api/payment-webhook.js`, `api/_lib/kv-client.js`, `api/_lib/licensing.js`, `api/_lib/subscription-lifecycle.js`, `tests/test-atomic-payment-webhook.cjs`.
