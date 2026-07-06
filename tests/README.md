# Tests

Automated tests for the pure-logic parts of Kidbuster/Pathfinder — protocol
prompt construction, output validators, and the usage-stats tracker. No
external test framework and no dependencies (consistent with the rest of
this project) — just plain Node.

## Running

```bash
npm test
```

or run a single file directly while iterating on one area:

```bash
node tests/test-blitz.cjs
```

## Why `.cjs`?

`package.json` has `"type": "module"`, which makes plain `.js` files ES
modules by default (no `require`). These tests use `require`/`module.exports`
for simplicity, so they're named `.cjs` to opt out of that on a per-file
basis — nothing else about the project's module setup changes.

## How this actually tests `index.html`

These tests don't maintain a separate copy of the app's logic that could
drift out of sync. `tests/helpers/extract-core.cjs` reads the *real*
`index.html`, finds the `KidbusterCore` IIFE by its exact start/end text,
and evaluates it directly to get the live object — so every test run is
against whatever is actually in `index.html` right now. Same idea for
`tests/helpers/extract-usage-stats.cjs`, which extracts the UI-layer
usage-stats block (`loadUsageStats`/`recordGeneration`/`kidbusterStats`),
providing minimal `localStorage`/`window` stubs since that code (unlike
`KidbusterCore`) isn't DOM-free by design.

If `index.html` is ever restructured enough that the extraction markers
no longer match (e.g. `KidbusterCore` is renamed, or its closing line
changes), the helper throws a clear error naming exactly which marker
failed and which file to update — rather than tests silently testing
stale, hand-copied logic instead of the real thing.

## What's covered

| File | Covers |
|---|---|
| `test-length-format.cjs` | Short/Medium/Long length tiers (MA/Sugarcoat): correct char targets, token substitution, validator enforcement per tier, backward-compatible default |
| `test-trim-rule.cjs` | The mandatory Short-tier content trim rule (omit Pronunciation Focus, cap grammar points/examples, drop per-word pronunciation) and its validator checks |
| `test-wolf-emoji.cjs` | The wolf emoji (🐺) sign-off is expected only when the teacher is Layne; any other teacher name gets no emoji. Sugarcoat's 💖 is unaffected |
| `test-blitz.cjs` | The Blitz protocol end to end: registry wiring, shuffle-bag model selection (no repeats until all 10 are used), 70-120/150 word validation, no-emoji/no-bullets/no-headings checks, leftover-placeholder detection, anti-verbatim-copying check |
| `test-special-remarks.cjs` | Special Remarks / "Teacher Notes" priority wording across MA/Sugarcoat/OF/Blitz, and the terminology bridge in the outgoing user message |
| `test-usage-stats.cjs` | Regression coverage for a real bug: `recordGeneration()` crashing for any protocol missing from the stats tracker's internal defaults (this is exactly what happened when Blitz was first added) |

## Adding a test for a new feature or protocol

1. Create `tests/test-your-thing.cjs` following the pattern in any existing
   file: `module.exports = function run(){ ... return getFailures(); }`,
   plus the `if(require.main === module)` block so it can run standalone.
2. `run-all.cjs` picks up any `test-*.cjs` file automatically — no
   registration needed elsewhere.
3. If a new protocol is added to `PROTOCOLS`, check whether anything in
   `index.html` still enumerates protocols by hand elsewhere (the usage-
   stats tracker did exactly this once and broke) — `test-usage-stats.cjs`
   is written generically over `Object.keys(PROTOCOLS)` specifically so it
   keeps catching this automatically for any protocol added in the future.
