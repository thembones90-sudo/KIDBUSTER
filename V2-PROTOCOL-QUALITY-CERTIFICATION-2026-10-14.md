# Pathfinder V2 — Protocol Output Quality Certification (Phase 1)

**Status: HARNESS READY / REAL MODEL OUTPUTS NOT YET CERTIFIED**

This is a dev-only, fictional-data evaluation for the actual protocol engine. It is not a production smoke test and is not proof of report quality until a teacher or other qualified human reviewer checks real provider outputs. No data from real students, accounts, lessons, email, or Krisp may be used in this phase.

## Evaluation coverage

The 21-case fixture matrix is tools/protocol-output-eval-cases.cjs.

| Protocol | Strong performance | Needs help | Contradictory evidence |
| --- | --- | --- | --- |
| Classic (MA) | 5/5 | 2/5 | 3/5 |
| Sugarcoat (MS) | 5/5 | 2/5 | 3/5 |
| Fairy | 5/5 | 2/5 | 3/5 |
| Blitz | 5/5 | 2/5 | 3/5 |
| Beida | Excellent | try harder please | try harder please |
| OF | High | Low | Medium |
| Preply | Adult | Parent/child | Trial/adult |

These are entirely fictional student notes. The runner obtains prompts from api/_lib/server-generation.js, the same trusted prompt builder used by api/generate.js. It never accepts a separately authored or client-provided system prompt. Blitz deliberately retains its shuffle selection, so its compiled prompt hash may legitimately vary between runs.

A 21-report run is an initial acceptance sample, NOT a statistically meaningful proof that every future report will be accurate. Extra cases should cover 1/5, 6/5, half-step ratings, long notes, injection attempts, non-English input, and each Preply module before a broader release.

## Offline steps (safe, no network)

From PowerShell in A:\PATHFINDER V2:

    node tools/evaluate-protocol-outputs.cjs --check

Validates 21 source-note contracts and trusted prompt compilation without creating provider outputs or contacting any service.

    node tools/evaluate-protocol-outputs.cjs --dry-run

Creates a review bundle under gitignored .v2-local\protocol-evals\, including results.json, human-review-template.csv, and REVIEW-STATUS.txt. It clearly labels itself DRY_RUN_NO_MODEL_OUTPUT. Use --limit 3 for a smaller check, but full certification requires all 21 reports.

    node tests/test-protocol-output-evaluation.cjs

Exercises the fixture matrix, opt-in/credential gates, no-network check/dry-run, fully mocked success, provider failure, truncation rejection, output metadata, and human review requirements. Standard npm test includes it automatically.

## Real Anthropic provider run (21 paid calls max)

**Prerequisite:** The owner must provision a dedicated test-only Anthropic API key, never the existing production ANTHROPIC_API_KEY, a production owner key, or any teacher's license. Never paste keys into prompts, logs, commits, reports, or chat.

Live mode requires BOTH:

- PATHFINDER_EVAL_ALLOW_LIVE set to the exact string YES
- PATHFINDER_EVAL_ANTHROPIC_API_KEY set to a dedicated evaluation key

Then run:

    node tools/evaluate-protocol-outputs.cjs --live --limit 21

The explicit --limit N flag is mandatory for any paid run; there is no silent 21-request default in live CLI mode. Start with --live --limit 1 for a small-cost smoke test before the full run. The runner calls only https://api.anthropic.com/v1/messages, sequentially (concurrency 1), with one request per case, a 90-second timeout, a maximum 3,000 output tokens, and default model claude-sonnet-4-6 to match current production source. PATHFINDER_EVAL_MODEL can override the model in the evaluation environment, but that is not a certification of the actual production model.

No payment, license, Redis, Vercel, email, or Krisp route is called. No production secrets or real student data are read. The runner does not depend on or fall back to ANTHROPIC_API_KEY. For extra safety, live mode refuses to run in any process that even defines ANTHROPIC_API_KEY, without reading its value. Use a clean, test-only shell.

**Cost note:** 21 requests may incur provider charges. The total requests and output-token limits are bounded, but there is no absolute currency spending limit. Review current model pricing and configure a budget before starting live mode.

The runner checkpoints completed synthetic reports after each live request, so a long batch interrupted between calls retains its already-finished results in an in-progress bundle. A later run starts a new bundle; interrupted runs are not automatically resumed. The runner fails closed without the dedicated credentials. It rejects empty, truncated, and HTTP-error responses. It never labels simulated or dry-run results as completed certification. Synthetic outputs are stored only under .v2-local\protocol-evals\.

## Human rubric: six dimensions

Each case receives six human-review marks, 0–5, with explanatory notes.

| Score | Meaning |
| --- | --- |
| 5 | Fully meets criterion without material changes |
| 4 | Minor editing or polishing only |
| 3 | Substantial revisions required |
| 2 | Major failures, not suitable to send |
| 1 | Mostly incorrect or unusable |
| 0 | Missing or fundamentally fails |

1. **Factual grounding.** Compare every declarative statement to source notes. Count unsupported achievement, effort, behavior, attendance, homework, diagnosis, scores, or outcomes. Contradictions must remain unresolved.
2. **Protocol adherence.** Verify the selected protocol's distinctive rules. Examples: Beida two labeled fields and third-person performance; OF section order and lengths; Preply-specific modules; Sugarcoat supportive tone.
3. **Rating/tone fit.** Distinguish 2/5 vs 3/5 vs 5/5; Beida uses Excellent/try harder, OF uses qualitative tiers. Preply has no rating, so enter NA for this category.
4. **English and naturalness.** Evaluate grammar, nonrepetitive language, audience suitability, and absence of unsupported medical/psychological labels.
5. **Formatting and length.** Check mandatory sections, greeting, vocabulary, closing, teacher name/signature, and all platform limits against real format requirements.
6. **Teacher usefulness.** Could a real teacher responsibly send this report without major editing? If not, require a rewrite and explain why.

### Certification gates

- 21 real model responses, not mocks or dry runs.
- **0 unsupported student facts.** Any invented fact blocks certification until corrected and retested.
- **100% mandatory structural constraints** verified by human reviewers.
- **At least 95% of applicable six-dimensional scores** at or above 4/5 and no major-rewrite reports.
- Reviewer name, review timestamp, comments, explicit signoff in the review CSV.
- All provider failures, truncations, empty responses, and unexpected behaviors investigated and rerun.
- Any deployed model/prompt change requires a new evaluation of affected cases.

The automatedChecks object is a warning screen ONLY. No warning does not mean factual accuracy, and no test passing means certified quality.

## Remaining gaps

The matrix does not prove provider performance without test credentials and human grading. P0 launch gates remain separate: Krisp student-data retention, staging isolation, verified Redis ownership, Lemon Squeezy subscription lifecycle, and email delivery.

**Change discipline:** Do not alter the actual prompt engine, index.html, payments, or license logic without a demonstrated output failure and a regression test.
