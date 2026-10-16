# V2 Feedback Intelligence

Added 2026-10-16. The feedback card under each generated report is now the
owner's main signal from teachers.

## What teachers see
Three tabs under every report:
- **Rate report:** 1–5 stars plus an optional comment.
- **Report a bug:** a description is required; stars are optional.
- **Suggest an idea:** a description only.

## What is stored
- **Primary store: Pathfinder's own Redis**, not the Google Sheet. Staging has
  no Sheet, so before this change every submission there failed with 500. If
  `GOOGLE_SHEET_WEBHOOK_URL` is set, rows are still mirrored to the Sheet
  (best effort).
- **Report link:** every delivered report returns a random 16-hex
  `generationRef` and writes content-free telemetry: protocol, rating tier,
  length, Preply module, model, repair outcome, advisory check messages,
  latency and output length. Feedback that sends this reference is joined on
  the server, so the owner sees which protocol, model or repair path got a
  low score or a bug. A reference only joins for the same account.
- **Privacy:** no notes, transcript, report text, student name or license key
  is stored. The account is a one-way hash. The teacher's own comment is the
  only free text (max 1000 characters). Everything expires after 180 days.
- Telemetry failures never block delivering a report.

## Where the owner reads it
- **Owner panel** (Account, visible only to owner keys): the "Teacher
  feedback" section, then **Show feedback** for a digest of totals,
  per-protocol scores, bugs, low ratings and ideas.
- **Full dashboard:** `/feedback-dashboard.html` (noindex; data loads only
  with an owner key; renders comments as text only).
- **API:** `GET /api/feedback?limit=500` with an owner `x-app-key`. Anyone
  else gets 403. It lives in the existing feedback handler to stay within the
  serverless function budget.
- **For Claude:** `node tools/feedback-pull.mjs` prints a Markdown digest
  (`--json` for raw data, `--url` for another host). It reads the owner key
  from `.v2-local/owner-key.txt` (gitignored) or `PATHFINDER_OWNER_KEY` and
  never prints it.

## Tests
- `tests/test-feedback-intelligence.cjs`: telemetry privacy, server-side
  join, cross-account join refused, categories, owner-only summary,
  delivery when telemetry fails, and dashboard and hub XSS safety.
- `tests/test-feedback.cjs`: the Sheet mirror. A failed Sheet no longer
  loses feedback.
- `tests/test-browser-smoke.cjs`: tabs, validation, and the category and
  reference in the payload.
