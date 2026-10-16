'use strict';
// Pathfinder V2 model benchmark configuration. Committed: contains NO
// transcripts, keys or outputs — only identifiers, settings and list prices.

// Model IDs are the Anthropic API identifiers (not UI display names). The
// harness re-verifies each one live with GET /v1/models/{id} before any paid
// call (`verify-models`). Prices: USD per million tokens, Anthropic first-party
// list prices as cached in the Claude API reference on 2026-10-06; cache write
// = 1.25x input (5-minute TTL), cache read as listed. Re-check before relying
// on the totals for budgeting.
const MODELS = {
  'claude-sonnet-4-6': { label:'Claude Sonnet 4.6', input:3.00, output:15.00, cacheWrite:3.75, cacheRead:0.30, cacheMinTokens:1024,
    defaultThinking:'off (no thinking parameter = no thinking on 4.6)' },
  'claude-haiku-5-5':  { label:'Claude Haiku 5.5', input:0.10, output:0.50, cacheWrite:0.125, cacheRead:0.01, cacheMinTokens:512,
    defaultThinking:'adaptive, effort medium (on by default)', note:'$0.50/$2.50 above 100K-token prompts' },
  'claude-sonnet-5-5': { label:'Claude Sonnet 5.5', input:2.00, output:10.00, cacheWrite:2.50, cacheRead:0.20, cacheMinTokens:512,
    defaultThinking:'adaptive, effort high (on by default)' }
};
const PRICING_SOURCE = 'Claude API skill model table, cached 2026-10-06 (first-party list prices)';

// Production request profile: byte-identical to api/generate.js apart from
// `model` (no thinking/effort/temperature parameters; max_tokens 3000; same
// cacheable system split; same single-repair rule and 55 s provider budget).
const PROFILES = {
  production: { maxTokens:3000, extra:{}, generationBudgetMs:55000, minRepairWindowMs:12000,
    description:'Exactly what production would send if only the model ID changed.' },
  // Initial run finding: Haiku 5.5 and Sonnet 5.5 think by default and the
  // thinking counts toward max_tokens; at 3000 Haiku was cut off 3/7 times.
  // This profile gives thinking models output headroom and nothing else
  // (no effort/thinking change). Sonnet 4.6 stays byte-identical to production.
  'thinking-headroom': { maxTokens:3000, maxTokensByModel:{ 'claude-haiku-5-5':8000, 'claude-sonnet-5-5':8000 }, extra:{},
    generationBudgetMs:55000, minRepairWindowMs:12000,
    description:'Production request, but max_tokens 8000 for models that think by default (Haiku 5.5, Sonnet 5.5); Sonnet 4.6 unchanged at 3000.' },
  // Haiku 5.5 tuning arm (owner decision 2026-10-16): effort raised from its
  // default 'medium' to 'high'; other models unchanged from thinking-headroom.
  'haiku-high': { maxTokens:3000, maxTokensByModel:{ 'claude-haiku-5-5':8000, 'claude-sonnet-5-5':8000 },
    extra:{}, extraByModel:{ 'claude-haiku-5-5':{ output_config:{ effort:'high' } } },
    generationBudgetMs:55000, minRepairWindowMs:12000,
    description:'thinking-headroom plus output_config.effort=high for Haiku 5.5 only.' }
};

// Settings for private transcripts (names, ratings) live in a git-ignored
// sidecar JSON next to the transcript, so no real names are committed. For the
// real transcript they reproduce Codex's 2026-10-15 seven-mode audit settings.
//
// Transcripts. `private` sources must live in the git-ignored .v2-local folder
// and are never committed; `fictional` sources come from committed fixtures.
const TRANSCRIPTS = {
  'real-1': { kind:'private', path:'.v2-local/leo-transcript-private.txt', settingsPath:'.v2-local/benchmark-real-1.settings.json',
    expectedSha256Prefix:'4d546eb523933e37',
    note:'User-authorized real transcript from the 2026-10-15 audit (one whitespace byte differs from Codex\'s copy).' },
  'mixed-fictional': { kind:'fictional', caseId:'mixed_performance' },
  'scaffolded-fictional': { kind:'fictional', caseId:'heavy_scaffolding' }
};

const PHASES = {
  initial: { transcripts:['real-1'], repetitions:1, description:'21 reports: 7 protocols x 3 models, real transcript, one sample each.' },
  full: { transcripts:['real-1','mixed-fictional','scaffolded-fictional'], repetitions:2,
    description:'126 reports: 3 transcripts x 7 protocols x 3 models x 2 repetitions. The two fictional transcripts can be replaced by real anonymized transcripts before running.' }
};

const PROTOCOLS = ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY'];

// Measured output tokens per protocol for Sonnet 4.6 on the real transcript
// (Codex audit manifest). Used only for spend estimates.
const BASELINE_OUTPUT_TOKENS = { MA:714, MS:764, FAIRY:1101, BLITZ:132, BEIDA:474, OF:398, PREPLY:241 };
// Assumed extra (thinking) output tokens when a model thinks by default.
// Unmeasured; deliberately generous so the estimate is an upper bound.
// Initial run (2026-10-16) measured ~1800-2500 thinking+report overhead for
// these models at max_tokens 3000; margins added for uncapped output.
const ASSUMED_THINKING_TOKENS = { 'claude-sonnet-4-6':0, 'claude-haiku-5-5':3500, 'claude-sonnet-5-5':2500 };
// Calibrated against the measured 2026-10-15 baseline: the timestamped real
// transcript tokenizes at ~3.1 chars/token on Sonnet 4.6, so 3.0 is used.
const CHARS_PER_TOKEN = 3.0;
// Newer tokenizers can use up to ~1.35x as many tokens as Sonnet 4.6's for the
// same text; applied to the upper bound only (unmeasured for these models).
const TOKENIZER_UPPER_FACTOR = { 'claude-sonnet-4-6':1, 'claude-haiku-5-5':1.35, 'claude-sonnet-5-5':1.35 };
const ASSUMED_REPAIR_RATE = 0.25;

module.exports = { MODELS, PRICING_SOURCE, PROFILES, TRANSCRIPTS, PHASES, PROTOCOLS, BASELINE_OUTPUT_TOKENS,
  ASSUMED_THINKING_TOKENS, CHARS_PER_TOKEN, TOKENIZER_UPPER_FACTOR, ASSUMED_REPAIR_RATE };
