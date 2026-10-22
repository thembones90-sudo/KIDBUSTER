# Pathfinder V2 three-model benchmark

Compares **Claude Sonnet 4.6** (`claude-sonnet-4-6`, current production), **Claude Haiku 5.5** (`claude-haiku-5-5`) and **Claude Sonnet 5.5** (`claude-sonnet-5-5`) on all seven protocols, using the trusted server prompt builder (`api/_lib/server-generation.js`) and the same output contract and single-repair rule as `api/generate.js`.

Isolated by design: it never changes production model selection, never touches licensing, billing, Vercel, KV or customer data, and writes every artifact to the git-ignored `.v2-local/model-benchmark/`.

## Fairness rules
- **Same prompts:** each prompt is built once per transcript × protocol × repetition and shared by all three models (Blitz's random style model and Classic's random style variant would otherwise differ per model). Every record stores the prompt SHA-256.
- **Production-identical requests:** the request body is built with the production `buildCacheableSystemBlocks` (loaded verbatim from `api/generate.js`); `tests/test-model-benchmark.cjs` captures what `generate.js` really sends and asserts the benchmark body is identical except `model`.
- **Profile `production`** adds no `thinking`, `effort` or `temperature`. This measures "swap the model ID and change nothing else". Consequence to note when reading results: Sonnet 4.6 does not think by default; Sonnet 5.5 (effort `high`) and Haiku 5.5 (effort `medium`) think adaptively by default — thinking tokens are billed as output and count toward `max_tokens: 3000`, so truncation is a possible, recorded outcome.
- **Same validation:** first draft → contract → at most one repair (same model, draft only, 55 s budget, ≥ 12 s needed to start it) → accepted or not. Refusals (`stop_reason: refusal`), truncation and HTTP errors are recorded as their own outcomes; no server-side fallback is used, so each model is measured on its own.

## Phases
| Phase | Reports | Contents |
|---|---:|---|
| `initial` | 21 | real authorized transcript (private) × 7 protocols × 3 models × 1 |
| `full` | 126 | 3 transcripts × 7 protocols × 3 models × 2 repetitions |

`full` currently uses the real transcript plus two committed fictional transcripts (`mixed-fictional`, `scaffolded-fictional`). To use real anonymized transcripts instead, place them in `.v2-local/` and add `private` entries in `config.cjs`.

## Steps
```powershell
# 1. Offline plan and spend estimate (prints an APPROVAL CODE)
node tools/model-benchmark.cjs plan --phase initial

# 2. Free model-ID check (needs the dedicated evaluation key; no generation)
$env:PATHFINDER_EVAL_ANTHROPIC_API_KEY = '<dedicated eval key>'   # or --key-file .v2-local/<file>
node tools/model-benchmark.cjs verify-models

# 3. PAID run — only after the owner approves the plan's code and cap
$env:PATHFINDER_EVAL_ALLOW_LIVE = 'YES'
node tools/model-benchmark.cjs run --phase initial --approve <code> --max-spend-usd 1.00

# 4. Blinded teacher packet (model identities hidden, order randomized, names replaced)
node tools/model-benchmark.cjs blind --run .v2-local/model-benchmark/<runId>

# 5. Comparison (deterministic now; add --scores once teachers fill scoresheet.csv)
node tools/model-benchmark.cjs report --run .v2-local/model-benchmark/<runId> [--scores <filled scoresheet.csv>]
```
Gates on `run`: `PATHFINDER_EVAL_ALLOW_LIVE=YES`; a dedicated evaluation key (never the production key — the run refuses if `ANTHROPIC_API_KEY` is set); a committed, clean tree; a successful `verify-models`; `--approve` equal to the code of the *current* plan (any change to prompts, jobs, profile, commit or estimate changes the code); `--max-spend-usd` at least the estimated upper bound; the run stops if actual spend reaches the cap.

## Outputs (git-ignored)
`<runId>/manifest.json` (commit, approval code, prices, estimate, spend), `jobs/<job>.json` (raw provider responses for every call, raw first draft, repair text, final text, contracts, usage, cost, latency), `final/<job>.md`, `metrics.jsonl`, `prompts.private.json`, `review/REVIEW-PACKET.md`, `review/scoresheet.csv`, `review/KEY-DO-NOT-SHARE-WITH-REVIEWERS.json`, `COMPARISON.md`, `comparison.json`.

## How results are separated
- **Deterministic (software):** acceptance, repairs, hard-limit violations in the first draft, refusals, truncation, latency, cost per accepted report.
- **Hallucination candidates (heuristic):** phrase matches for human checking — never verdicts.
- **Confirmed hallucinations and subjective scores (teachers):** factual grounding, educational usefulness, writing quality, personality, send-ready — from the blinded scoresheet only.
- "Strongest per protocol" ranks by teacher factual score, then confirmed hallucinations, then acceptance, then cost; without scores it says *deterministic only*. "Most economical" picks, per protocol, the cheapest model whose reports were all accepted and (when reviewed) scored factual ≥ 4 with zero confirmed hallucinations.

## Independent review (Big Pickle)
Give the reviewer the run directory **without** sharing the KEY file until scoring is done. Verify: `npm test` (`tests/test-model-benchmark.cjs`), prompt hashes identical across models in `jobs/*.json`, raw responses vs. final texts, spend in `manifest.json` vs. summed `costUsd`, and that `COMPARISON.md` follows from `comparison.json`.

## Extending to OpenAI models
Add an adapter beside `callProvider` in `core.cjs` that maps the same system prompt (unsplit) and user message to the other provider and returns `{ok,status,data:{content:[{type:'text',text}],usage,stop_reason}}`, plus a price row in `config.cjs`. Validation, repair, blinding and reporting are provider-neutral. Note that production prompts were written and tuned for Claude.

## Lesson-comprehension before/after (2026-10-19 brief)
Compares the engine before (`3f4a669`, checked out at `.v2-local/wt-engine-before`) and after (this branch) on identical prompts-inputs, Haiku 5.5 at the production `haiku-high` profile. Cases: `tools/comprehension-cases.cjs` (fictional, with ground truth). The real Luka lesson runs as phase `comprehension-real` once the owner places `.v2-local/luka-preply-56min-private.txt` (its settings and ground truth are in `.v2-local/luka-preply-56min.settings.json`).
```powershell
$env:PATHFINDER_EVAL_ALLOW_LIVE = 'YES'
node tools/model-benchmark.cjs verify-models --key-file .v2-local/eval-anthropic-key.txt
node tools/model-benchmark.cjs plan --phase comprehension --profile haiku-high --models claude-haiku-5-5                                  # after arm: prints code
node tools/model-benchmark.cjs plan --phase comprehension --profile haiku-high --models claude-haiku-5-5 --core-root ../wt-engine-before # before arm
node tools/model-benchmark.cjs run  --phase comprehension --profile haiku-high --models claude-haiku-5-5 --arm after  --key-file .v2-local/eval-anthropic-key.txt --approve <after code>  --max-spend-usd 0.50
node tools/model-benchmark.cjs run  --phase comprehension --profile haiku-high --models claude-haiku-5-5 --arm before --core-root ../wt-engine-before --key-file .v2-local/eval-anthropic-key.txt --approve <before code> --max-spend-usd 0.50
node tools/comprehension-compare.cjs report --before <before runDir> --after <after runDir>          # free
node tools/comprehension-compare.cjs judge  --before <before runDir> --after <after runDir> --plan   # prints judge code and estimate
node tools/comprehension-compare.cjs judge  --before <before runDir> --after <after runDir> --approve <judge code> --max-spend-usd <cap>
```
Repeat with `--phase comprehension-real` for the Luka lesson. Outputs stay in the git-ignored `.v2-local/model-benchmark/`.
