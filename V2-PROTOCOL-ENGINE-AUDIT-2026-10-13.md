# PATHFINDER V2 — Protocol Engine Audit (13 October 2026)

Local repo: A:\PATHFINDER V2
Branch: pathfinder-v2
Baseline SHA: bbe0579
Scope: READ-ONLY application audit and synthetic local tests; no model API, production deployment, customer material, or source changes.

## Verified positive results
- `npm test`: **34/34 test files passed** (local/synthetic and browser mocks; not a real provider output-quality evaluation). Log: `.v2-local/engine-audit-tests-20261013.log`.
- Registry: exactly seven protocols with independent `buildSystemPrompt` and `analyze` functions: MA Classic, MS Sugarcoat, FAIRY, BLITZ, BEIDA, OF, PREPLY.
- Directly invoked `api/_lib/server-generation.js::buildServerGeneration` for each protocol using invented lesson data: **7/7 built successfully**, carrying synthetic student identity/evidence. Formal teacher name appears in a protocol-specific location, not necessarily in the system prompt (Blitz/Preply intentionally differ).
- Directly invoked all seven validators with empty output; all **7/7** issued warnings rather than silently accepting an empty string.
- Backend constructs the trusted prompt server-side from structured form inputs; client-supplied `systemPrompt`/ `userMessage` are ignored. Test: `tests/test-server-controlled-generation.cjs`.
- The frontend runs the chosen protocol validator after generation, displays warning messages, and keeps user notes on generation failures.

## Confirmed defect: truncated upstream completion accepted as success
Source: `api/generate.js`; a nonempty `data.content` result is accepted and quota committed without verifying `data.stop_reason`.
Synthetic reproduction: `.v2-tmp/audit-truncated-output-20261013.cjs` mocked an HTTP 200 Anthropic response containing `stop_reason: "max_tokens"` and nonempty partial text.
Observed: `statusCode=200`, partial report delivered, `quotaCount=1`.
Severity: HIGH for customer quality/quota integrity; affects all protocols whenever output stops early.
Fix contract: reject known truncated `stop_reason=max_tokens` without showing successful output, compensate reservation reliably, clear generation in-flight marker, preserve lesson draft for retry, and add regression for partial output, valid completion, and quota compensation. Avoid breaking existing provider-response mocks that omit stop_reason.

## Confirmed behavior / quality risk: validator is advisory, not a hard gate
Source: `index.html` around line 6444; `protocol.analyze` runs after the backend has already committed a generation, then displays lint and enables copying. For most protocols the frontend automatically copies the output, even if warnings include CRITICAL.
This may be intentional teacher-review UX, but severe format violations can be copied to the clipboard before correction. Recommend user-approved policy: classify hard errors separately from soft style warnings; block automatic copying on critical errors while preserving draft and generated text for manual correction. Do not silently alter contract.

## Coverage gap: FAIRY
`index.html::analyzeFairyOutput` implements empty-output, length, heading/format, divider/glyph, placeholders, stars, required sections, and sign-off checks.
No `tests/test-fairy*.cjs` and no direct reference to `analyzeFairyOutput` appears in current `tests/test-*.cjs`. Existing FAIRY mentions are mainly registration/licensing/browser coverage, not focused contract mutation tests.
Add a focused deterministic validator suite to cover valid and mutated Fairy reports; do not mistake absence of tests for a proven runtime failure.

## Other protocol coverage and limitations
- MA Classic: rating-based stars, optional Parent Note, homework, length tiers, sign-off; direct contract tests.
- MS Sugarcoat: distinct softer prompt/closing; shares Classic validator rules, with variants tested.
- Fairy: distinct child-friendly prompt; validator implemented but focused regression coverage missing.
- Blitz: 10-focus shuffle, three voices, brief 70–120 word style with 150 cap, no emoji/structure; direct tests.
- Beida: exact dual-field form, field-length limits, greeting, ratings; direct parser/validator tests.
- OF: three ordered sections, word count/length, qualitative tone, teacher signature/pronouns; direct tests.
- Preply: adult/parent/trial modules, natural text rather than rubrics, no emojis or list formatting; direct module tests.
- Semantic fidelity, appropriate classroom claims, grammar/pedagogy, hallucination rates, genuine generated-output reliability: **NOT TESTED** with live model and human-reviewed gold examples. Local prompt and regex checks cannot prove these.

## Release impact and recommended order
1. HIGH: fix truncated upstream completion handling, then run targeted and all 34 tests.
2. MEDIUM: add dedicated Fairy validator contract tests, no protocol rewrite.
3. MEDIUM/PRODUCT DECISION: separate critical lint failures from advisory warnings; decide whether to suppress auto-copy.
4. MODEL QUALITY: synthetic seven-protocol evaluation matrix with human-reviewed report outputs, protecting student privacy. This requires test credentials and explicit authorization.

No source, prompt, pricing, licensing, customer, hosting, or production changes performed in this audit. No real paid or model-provider invocation.


## Execution update: 13 October 2026, commit 130ba34
The findings above were converted into local V2 repairs on branch pathfinder-v2. The fixes are committed locally, NOT deployed or pushed.
- api/generate.js: nonempty Anthropic replies with stop_reason=max_tokens or model_context_window_exceeded no longer count as completed reports; reservation and generation ID are released and the response is a retryable 502 generation_truncated.
- index.html: repaired missing protocol binding in generate(). This bug was reproduced in a real browser test as "protocol is not defined" and fixed. Critical lint prevents auto-copy and preserves notes for review, while ordinary output still auto-copies.
- tests/test-fairy-protocol.cjs: 12 focused checks for Fairy.
- tests/test-critical-autocopy.cjs: real Chrome test for critical vs ordinary output, notes retention and copy behavior.
- tests/test-protocol-synthetic-matrix.cjs: 70/70 synthetic prompt input-contract tests, no real model output.
- tests/test-atomic-generation-quota.cjs: max_tokens rejection and retry/quota regression.
- npm test (local): ALL 37 TEST FILES PASSED, with test-live-smoke correctly SKIPPED because hosted deployment is not approved.
- git diff --check passed before local commit; no unrelated untracked project files included.
- LIVE REPORT QUALITY remains NOT TESTED. No real model outputs were generated or human-reviewed.
- Codex CLI was blocked by its local command execution policy. Big Pickle independent review was attempted but did not produce a completed review artifact at this point. Do not cite either as independent verification.
