# Lesson comprehension upgrade: status and blockers (2026-10-23)

Branch `engine/lesson-comprehension-20261019` (not merged, not deployed).

## Done (verified locally)
- Root causes found in code: RADAR VAN/Scout transcripts lost their Teacher/Student labels and timestamps in `cleanTranscript`; the evidence rules assumed labels the model never received; the Preply prompt favoured "what was practiced" and one skill observation; nothing kept requests at their stated scope.
- Engine changes: labels and time anchors preserved (same-speaker lines a minute or more apart keep their own anchor); shared rules for whole-lesson reading, exact request scope and damaged transcripts; a Preply understanding step inside the existing single Haiku call (no extra API calls).
- Benchmark tooling: five contrasting fictional lessons plus a young-learner regression case with ground truth (`tools/comprehension-cases.cjs`); `comprehension` and `comprehension-real` phases; `--core-root`/`--arm` for a before/after on identical prompts; `tools/comprehension-compare.cjs` (free deterministic report, gated blinded judge).
- Tests: 86/86 test files at the time of the last commit on this branch.

## Not done: no live before/after result exists
No generated report from either arm exists. No claim of improved reports may be made until the runs below complete.

### Blocker 1: evaluation key returns 401
`.v2-local/eval-anthropic-key.txt` is rejected by the Anthropic API for every model (`verify-models`: 401 on 2026-10-19 and 2026-10-22). A valid, dedicated evaluation key (never the production key) must replace it. The harness refuses to run while `ANTHROPIC_API_KEY` is set.

### Blocker 2: the real Luka transcript is not in the project
Place the owner-authorized 56-minute RADAR VAN LITE transcript at `.v2-local/luka-preply-56min-private.txt` (git-ignored). Its settings and the owner's account of the lesson (ground truth) are already in `.v2-local/luka-preply-56min.settings.json`.

### Blocker 3: rebase onto the current production line
This branch is based on `3f4a669`. Before any release it must be rebuilt on the Scout restore line (`feature/classbuster-scout-owner-restore-20261022` or a verified descendant), whose release-integrity build gate would otherwise reject it.

## Run sequence once unblocked
See `tools/model-benchmark/README.md`, section "Lesson-comprehension before/after". Approval codes change with every commit, so re-run `plan` for both arms and approve the printed codes and spend caps (generation under about $0.11 per arm; blinded judge roughly $1-3).
