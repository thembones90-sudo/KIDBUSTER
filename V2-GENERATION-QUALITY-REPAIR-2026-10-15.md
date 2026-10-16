# Pathfinder V2 — Generation Quality Repair (2026-10-15)

**Branch:** `pathfinder-v2-genquality` (isolated worktree, branched from reference commit `0256245`). **Not pushed, not merged, not deployed to production.**
**Commits:** `80a3743` → `01f1eb7` → `dca3da8` → `c9aaa1e` (+ this report).
**Model:** `claude-sonnet-4-6` (unchanged).
**Independent audit (Big Pickle): PENDING — not performed.** See §10.

Deterministic results (tests, contract checks) prove structure and instruction presence. They do **not** prove educational accuracy. Content judgments below are an AI-assisted review by the implementer, not teacher certification.

## 1. What changed

### Prompt grounding (Judgment layer, versioned per the constitution)
- One shared `EVIDENCE_GROUNDING_RULES` block embedded in all seven protocols' cached static text: this lesson only (no invented history); support is not independence; a transcript records words, not sounds (no pronunciation diagnosis); transcription noise is not student error; teacher suggestions are not student achievements; homework is a recommendation; no guaranteed outcomes; never model a teacher's nonstandard English; settings are authoritative without invented justification; say less when uncertain.
- **Classic → MA V2.10:** vocabulary Notes describe evidence ("with support"); Pronunciation Focus gives model pronunciation only.
- **Sugarcoat → Sweet Voice V1.1:** template regains the mandatory *Today's Superpower* section (root cause: the template omitted it while its own sliced checklist and the shared validator required it); warmth may not invent history; model-only pronunciation cues.
- **Fairy:** prompt now states the selected Short/Medium/Long character ceiling (root cause: it never did, although its validator always enforced it) with a Fairy-specific trim rule; imagination limited to voice, not facts.
- **OF → V1.5:** 300 words is a ceiling, aim 220–270; evaluate at the evidenced level.
- **Preply → V1.1:** first-person tutor voice rule for every module; parent module 150 words is a maximum.
- **Blitz, Beida → V1.1:** shared rules only (Blitz was the strongest baseline; Beida's structure preserved).

### Deterministic output contract (`index.html` core, enforced by `api/generate.js`)
- Every report is evaluated server-side with the **same validators the browser shows**. Findings are classified:
  - **Blocking (repairable):** hard character/word ceilings, per-field limits (Beida, OF), missing/meaningless required sections (incl. Superpower content, Fairy Positive Feedback, Parent Note gating), field delimiters, sign-off/teacher identity, student-greeting identity, leaked placeholders, OF tier leak, teacher self-reference in third person, rating-driven star rules, transcript-based pronunciation diagnoses.
  - **Advisory:** soft length targets, word ranges, short-tier trim rules, formatting nits, OF pronoun check (deliberately advisory — §8).
- **One bounded repair**: only if every blocking finding is repairable (or a stylistic word target is clearly exceeded: OF > 300, Preply > 105% of module max) and ≥ 12 s remain of a single **55 s** provider deadline (first call default timeout 50 s; function cap 60 s). The repair uses the **same cached system prompt** and sees **only the draft, never the transcript** (cannot add facts). Same quota reservation, same request-identity marker, committed once.
- Still non-compliant, repair timed out, truncated, or provider error on a blocking report → **HTTP 422 `output_noncompliant`**, quota and request marker released (same request ID can retry), `Retry-After: 2`, no text returned. A compliant report whose optional shortening fails is delivered unchanged with its advisory. Content is never silently truncated.
- 200 responses carry `outputContract {compliant:true, contentReviewed:false, advisory, repair}` and usage summed across both calls.
- Browser: one message branch for `output_noncompliant` (no UI redesign).

## 2. Files modified
`index.html` (protocol core + one `callClaude` branch), `api/generate.js`, `api/_lib/server-generation.js`, `DECISIONS.md`, tests (below), `tools/generation-quality-cases.cjs`, `artifacts/generation-quality-2026-10-15/`. No billing, licensing, Krisp, UI layout or provider change.

## 3. Tests
New: `test-output-contract.cjs` (71 checks), `test-generation-repair.cjs` (46), `test-generation-grounding.cjs` (55), helper `tests/helpers/valid-reports.cjs` (contract-verified fixtures for all seven protocols).
Updated: `test-atomic-generation-quota.cjs` and `test-server-controlled-generation.cjs` mocks now return realistic valid reports (dummy strings like "A complete report" are correctly rejected by the contract); Classic and Fairy fixtures given meaningful Superpower/Positive Feedback content (stricter checks, not weakened ones); markdown tests re-anchored.

Required demonstrations, all covered: overlong cannot be send-ready; one repair can produce compliance; second invalid → controlled 422; missing sections detected; fabricated-but-formatted ≠ verified (`contentReviewed:false`); valid responses make exactly one provider call; quota/timeout/duplicate-request protections intact (incl. a duplicate arriving mid-repair, replay after completion, exhausted trial refused before any provider/repair spend).

**Result: `npm test` → ALL 51 TEST FILES PASSED** (48 baseline + 3 new) at `c9aaa1e`.

Failures encountered along the way (not hidden): 22 checks failed after the first implementation pass (mock strings rejected by the new contract; two fixtures with emoji-only Superpower / missing Positive Feedback) — fixed by realistic fixtures. Live round 1 then refused 3 reports, all **validator false positives made blocking**: Sweet Voice prints `Parent Note` without a colon; the OF pronoun check flagged a quoted story character ("He is brave") — fixed in `dca3da8` and re-verified live (5/5).

## 4. Live evaluation (isolated staging previews, no alias moved)
| Round | Commit | Requests | Delivered | 422 | Repairs attempted / succeeded |
|---|---|---:|---:|---:|---:|
| 1 full matrix | `01f1eb7` | 53 | 50 | 3 (false positives) | 5 / 2 |
| 2 recheck | `dca3da8` | 5 | 5 | 0 | 1 / 1 |
| 3 final targeted | `c9aaa1e` | 14 | 14 | 0 | 5 / 5 |
| **Total** | | **72** | **69** | **3** | **11 / 8** |

Coverage: real authorized transcript × 7 protocols (Codex's exact settings), 5 fictional scenarios × 7 protocols (strong independent, heavy scaffolding, noisy ASR, mixed, insufficient evidence), plus variations: Classic 1.5 short / 6 long, Sugarcoat 2 short, Fairy short/long, Blitz simple/polished, Preply adult / trial-child / trial-adult, OF girl Medium/High. Never more than two provider calls per request.

## 5. Before → after, real transcript (anonymized; same settings as the baseline)
| Protocol | Baseline (Codex, `0256245`) | After (`c9aaa1e`) |
|---|---|---|
| Classic | Note "said it clearly each time", "understood quickly"; cue "not 'streetch'" | Notes "practiced … with support"; no Pronunciation Focus diagnosis. 2795 ch (< 3000) |
| Sugarcoat | No Superpower; "Every single lesson…"; "not 'street'" | Superpower present; no history; cue removed (via repair); "Some sentences needed a little nudge"; exactly 10 stars |
| Fairy | 3997 ch (CRITICAL); "said 'show' instead of 'shoot'"; "all by yourself" | 2468–2510 ch; no diagnosis; support stated |
| Blitz | Strong | Still concise (101–115 words), grounded |
| Beida | "will click right into place" | "would make a noticeable difference" / recommendation framing |
| OF | 309 words; inflated praise | 268 words (after one shortening); independence claim cites the genuinely unprompted schedule recital |
| Preply parent | 190 words; teacher named in third person; "tended to shorten" stretch | 128–140 words; first person; "needed several reminders" |

Fictional-scenario outputs for all seven protocols are committed in `artifacts/generation-quality-2026-10-15/` for side-by-side review.

## 6. Length and structure compliance
Every delivered report passed the blocking checks **in force when it was generated** (the server refuses otherwise). The final rules (`c9aaa1e`) are stricter than round 1's: applied retroactively to the 55 round-1/2 deliveries they produce 5 blocking hits. **Correction (2026-10-16):** the "eleven-star line" was a false positive (the star line had 10; a decorative 🌟 in the closing sentence was counted), found by the model benchmark and fixed in the star-line scoping; the 2 pronunciation diagnoses were genuine, and the rating-2 star findings need the same re-check (Sugarcoat cases may include closing-sentence stars); all 14 round-3 deliveries pass the final rules. Advisory-only findings on delivered reports under the final rules: Classic/Sugarcoat short-tier "omit Pronunciation Focus" (2), Sugarcoat over its 2800 soft target (1), Preply 2 words over target (2), Blitz shingle similarity to a style model (1).

## 7. Provider calls and cost
- Valid first response: **1 call, no extra cost** (verified in tests and live).
- Repair: +1 call, normally a cache read of the protocol text plus the draft (~1–3k input) and a report-sized output; observed +6–14 s. Estimated ≈ $0.01–0.02 per repair at standard Sonnet list prices (assumption: $3/M input, $15/M output, $3.75/M cache write, $0.30/M cache read).
- Applying the final rules to the round-1 matrix, ~15% of reports would trigger a repair → roughly +$0.002 average per report.
- This evaluation: 83 provider calls, ≈ $1.30 for delivered reports + ≈ $0.15 for refused ones. Median latency 14.9 s, max 28.9 s (budget 55 s).

## 8. Remaining weaknesses and unverified cases
1. **Content accuracy is not machine-verified.** Prompt rules reduced but did not eliminate overstatement (e.g. one Sugarcoat "all on your own" for a teacher-started sentence in round 1; "Completed the prompt independently" for a cued word). Requires teacher review.
2. **Split speaker turns** (Krisp often assigns the student's last word to the teacher's line) remain genuinely ambiguous; Beida/OF/Blitz still describe "trailing off" that may partly be transcription artifact.
3. **Generic motivational closers** ("every lesson you grow") persist in Sugarcoat/Fairy — not invented events, but clichés.
4. **Fairy may name the teacher in the third person** inside the body ("support from Teacher Nora") — no blocking check exists for Fairy; observed once.
5. **OF pronoun check is advisory** because it cannot tell the student from other people; a wrong student pronoun is warned, not blocked.
6. **Sample size:** 1–3 samples per configuration; not a failure-rate estimate. Not every rating × length × voice × module combination was generated.
7. **422 latency:** a refused report costs the teacher up to ~30 s before the retry prompt.
8. **Merge note:** branched from committed `0256245`; the main checkout's large uncommitted work (throttle, Krisp retention, a different provider-timeout change in `generate.js`) will conflict in `api/generate.js` and `index.html` and must be merged deliberately.
9. Baseline source hash differs from the rerun copy by one whitespace byte; content identical.

## 9. Teacher review still required (Definition of Done item)
"No material invented claims in the teacher-reviewed set" is **not yet established**: no teacher has reviewed these outputs. Please review `artifacts/generation-quality-2026-10-15/round3-final/` and round1 fictional outputs against the fact sheets in `tools/generation-quality-cases.cjs`, and the private real-transcript outputs in `.v2-local/genquality-final-2026-10-15/`.

## 10. Independent audit package (Big Pickle) — PENDING
Diff: `git diff 0256245..pathfinder-v2-genquality`. Verify:
- No regression: `npm test` (51 files); unchanged licensing/billing/Krisp files (`git diff --stat` touches none).
- Repair handling: `api/generate.js` contract block — single repair, deadline math, release on every failure path, commit once, no third call.
- Spend bound: `test-generation-repair.cjs` §2–§9; repair only with ≥ `GENERATION_REPAIR_MIN_MS` remaining.
- Uncertain evidence: `EVIDENCE_GROUNDING_RULES`; blocking list `BLOCKING_FINDINGS`; pronoun-advisory rationale.
- Personalities distinct: `test-generation-grounding.cjs` §4; read the committed fictional outputs per protocol.
- Privacy: no transcripts, keys or customer data committed (`artifacts/` holds fictional text + metrics only; real-transcript rows are metrics without text). Evaluation runner and staging key live only in git-ignored `.v2-local`.

## 11. Corrections found by the model benchmark (2026-10-16)
The three-model benchmark exercised these checks on 158 more real-transcript drafts and exposed false positives in rules this repair had made blocking. All are fixed with regression tests (commit after `9a97edd`):
- **Preply signature:** "Best regards, <teacher>" was treated as third-person self-reference (refused 4 Haiku reports). Only the message body is now checked.
- **Sugarcoat stars:** without a star heading, every star emoji near the end was counted, so a decorative 🌟 in the closing sentence produced "11 stars" or "stars below 3" (refused 3 Sonnet 4.6 reports, the current production model). Only a star-only line now counts.
- **OF bold headings:** `**Strengths**` was reported as "missing sections", misleading the repair. Sections are now recognised; whole-line bold headings are a separate, accurate formatting finding.
- **Fairy star rule:** a fourth prompt defect — the Fairy prompt always asked for 10 stars and never stated the below-3 omission its validator enforces (all 6 rating-2 drafts, every model). The prompt now states the rule for the selected rating.
