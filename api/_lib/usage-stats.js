// Owner-only, content-free aggregate usage statistics.
//
// WHAT IS STORED: integer counters in three Redis hashes (lifetime, UTC month,
// UTC day), keyed only by fixed protocol codes. No report text, student or
// teacher names, emails, license keys or raw generation ids are ever stored.
// Idempotency markers are SHA-256 digests of (license key + id), the same
// approach generate.js already uses for its request marker.
//
// WHAT IS COUNTED:
//   * reports          one per successfully finalized (committed) report, for
//                      every plan including founder/Pro, deduplicated by the
//                      stable x-generation-id so retries never double count.
//   * delivered spend  estimated cost of the model calls (generation + repair)
//                      behind counted reports.
//   * all-calls spend  estimated cost of EVERY model call, including attempts
//                      that failed, were truncated or refused, or were rejected
//                      by the output contract. Delivered spend is a subset.
//
// MONEY: integer nano-USD (1e-9 USD). Every Haiku list rate is a whole number
// of nano-USD per token, so per-call cost is exact; sums are integer additions
// and cannot drift. A call whose cost cannot be derived (network error, timeout,
// provider HTTP error, malformed body, missing/invalid usage, unpriced model) is
// counted as an UNKNOWN call, never as zero. A total with unknown calls is a
// lower bound. These are list-price ESTIMATES, not an Anthropic invoice.
import crypto from 'node:crypto';
import { HAIKU_MODEL, estimateHaikuCost } from './haiku-provider.js';
import { applyUsageStatsPlan, readUsageStatsHashes } from './kv-client.js';

export const USAGE_STATS_SCHEMA = 'pathfinder-usage-stats-v1';
// Counting begins with the first successful telemetry write, not the date
// code was authored. Never imply we have data from before deployment.
export const USAGE_STATS_PROTOCOLS = Object.freeze(['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']);
export const USAGE_STATS_UNIT = 'nano-USD (1e-9 USD)';

const SEEN_TTL_SECONDS = 30 * 86400;   // idempotency markers; retries happen within hours
const DAY_TTL_SECONDS = 400 * 86400;   // daily buckets kept just over a year
const MONTH_TTL_SECONDS = 0;           // monthly + lifetime buckets are permanent (tiny)
const WRITE_TIMEOUT_MS = 2000;

// ---- cost ----
function isHaikuModel(model){
  const id = String(model || '');
  return id === HAIKU_MODEL || id.startsWith(HAIKU_MODEL + '-');
}
// Integer nano-USD for one call's actual returned usage, or null when unknown.
export function costNanoUsd(usage, model){
  if(!usage || typeof usage !== 'object' || !isHaikuModel(model)) return null;
  const known = ['input_tokens','output_tokens'].some(k => typeof usage[k] === 'number' && Number.isFinite(usage[k]));
  if(!known) return null;
  const usd = estimateHaikuCost(usage, HAIKU_MODEL);
  if(usd === null || !Number.isFinite(usd) || usd < 0) return null;
  const nano = Math.round(usd * 1e9);
  return Number.isSafeInteger(nano) ? nano : null;
}
export function attemptFromResponse(kind, data, requestedModel){
  return { kind, nano: costNanoUsd(data?.usage, data?.model || requestedModel) };
}

// ---- keys ----
const sha = (domain, a, b) => crypto.createHash('sha256').update(`usage-stats:v1:${domain}\n${a}\n${b}`).digest('hex');
export function statsKeys(now = new Date()){
  const iso = now.toISOString();
  return { total: 'stats:v1:total', month: 'stats:v1:m:' + iso.slice(0,7), day: 'stats:v1:d:' + iso.slice(0,10) };
}

// ---- update plan ----
// input: { licenseKey, generationId?, runToken, protocol, delivered, attempts:[{kind,nano}], now? }
export function buildUsageStatsPlan(input){
  const attempts = (Array.isArray(input.attempts) ? input.attempts : []).map(a => ({
    kind: a?.kind === 'repair' ? 'repair' : 'generation',
    nano: Number.isSafeInteger(a?.nano) && a.nano >= 0 ? a.nano : null
  }));
  if(!input.licenseKey || !input.runToken) throw new Error('usage stats need a license key and run token');
  const now = input.now || new Date();
  const known = attempts.filter(a => a.nano !== null);
  const knownNano = known.reduce((s,a) => s + a.nano, 0);
  const unknownCalls = attempts.length - known.length;
  const repairCalls = attempts.filter(a => a.kind === 'repair').length;
  const always = [];
  const add = (list, field, delta) => { if(delta) list.push([field, delta]); };
  add(always, 'all.calls', attempts.length);
  add(always, 'all.known_calls', known.length);
  add(always, 'all.unknown_calls', unknownCalls);
  add(always, 'all.known_nano', knownNano);
  add(always, 'all.repair_calls', repairCalls);
  // Include unsuccessful requests in each protocol's *actual API consumption*.
  // The delivered-only numbers remain separate for average report cost.
  if(USAGE_STATS_PROTOCOLS.includes(input.protocol)){
    const p = 'p.' + input.protocol + '.';
    add(always, p + 'all_calls', attempts.length);
    add(always, p + 'all_known_nano', knownNano);
    add(always, p + 'all_unknown_calls', unknownCalls);
  }
  const delivered = [];
  let reportKey = null;
  if(input.delivered){
    if(!USAGE_STATS_PROTOCOLS.includes(input.protocol)) throw new Error('unknown protocol code');
    const p = 'p.' + input.protocol + '.';
    reportKey = 'stats:v1:rep:' + sha('report', input.licenseKey, input.generationId || input.runToken);
    add(delivered, 'reports', 1);
    add(delivered, p + 'reports', 1);
    add(delivered, 'dl.calls', attempts.length);
    add(delivered, 'dl.known_calls', known.length);
    add(delivered, 'dl.unknown_calls', unknownCalls);
    add(delivered, 'dl.known_nano', knownNano);
    add(delivered, 'dl.repair_calls', repairCalls);
    add(delivered, p + 'known_nano', knownNano);
    add(delivered, p + 'unknown_calls', unknownCalls);
    if(unknownCalls > 0){ add(delivered, 'dl.partial_reports', 1); add(delivered, p + 'partial_reports', 1); }
    if(repairCalls > 0){ add(delivered, 'dl.repaired_reports', 1); }
  }else{
    add(always, 'runs.undelivered', 1);
  }
  return {
    runKey: 'stats:v1:run:' + sha('run', input.licenseKey, input.runToken),
    reportKey, keys: statsKeys(now), always, delivered,
    seenTtl: SEEN_TTL_SECONDS, dayTtl: DAY_TTL_SECONDS, monthTtl: MONTH_TTL_SECONDS,
    nowIso: now.toISOString()
  };
}

// Never throws and never waits longer than the timeout: telemetry must not
// block or fail a customer response. The update is idempotent per run, so the
// single internal retry (and any late completion after a timeout) is safe.
export async function recordUsageStats(input, { timeoutMs = WRITE_TIMEOUT_MS } = {}){
  let timer;
  try{
    const plan = buildUsageStatsPlan(input);
    const work = (async () => {
      let lastError = null;
      for(let attempt = 0; attempt < 2; attempt++){
        try{
          const code = await applyUsageStatsPlan(plan);
          return { recorded: code !== 0, duplicateRun: code === 0, duplicateReport: code === 3 };
        }catch(err){ lastError = err; }
      }
      console.error('usage-stats: write failed:', lastError?.message || 'unknown error');
      return { recorded: false, reason: 'store_unavailable' };
    })();
    const timeout = new Promise(resolve => { timer = setTimeout(() => resolve({ recorded: false, reason: 'timeout' }), timeoutMs); });
    return await Promise.race([work, timeout]);
  }catch(err){
    console.error('usage-stats: not recorded:', err?.message || 'unknown error');
    return { recorded: false, reason: 'error' };
  }finally{ clearTimeout(timer); }
}

// ---- owner snapshot ----
const int = v => { const n = Number(v); return Number.isSafeInteger(n) && n >= 0 ? n : 0; };
export function nanoToUsdString(nano){
  const n = int(nano);
  return Math.floor(n / 1e9) + '.' + String(n % 1e9).padStart(9, '0');
}
function money(nano, unknownCalls, perReports){
  const k = int(nano);
  return {
    knownNanoUsd: k, knownUsd: nanoToUsdString(k), unknownCalls: int(unknownCalls),
    complete: int(unknownCalls) === 0,
    avgKnownNanoUsdPerReport: perReports > 0 ? Math.round(k / perReports) : null
  };
}
function shapePeriod(h){
  const reports = int(h.reports);
  const byProtocol = {};
  for(const code of USAGE_STATS_PROTOCOLS){
    const n = int(h['p.' + code + '.reports']);
    byProtocol[code] = {
      reports: n,
      apiSpend: { ...money(h['p.' + code + '.all_known_nano'], h['p.' + code + '.all_unknown_calls'], 0), calls: int(h['p.' + code + '.all_calls']) },
      deliveredSpend: { ...money(h['p.' + code + '.known_nano'], h['p.' + code + '.unknown_calls'], n), partialReports: int(h['p.' + code + '.partial_reports']) }
    };
  }
  return {
    reports,
    duplicateDeliveriesIgnored: int(h['dup.deliveries']),
    deliveredSpend: {
      ...money(h['dl.known_nano'], h['dl.unknown_calls'], reports),
      calls: int(h['dl.calls']), knownCalls: int(h['dl.known_calls']), repairCalls: int(h['dl.repair_calls']),
      partialReports: int(h['dl.partial_reports']), repairedReports: int(h['dl.repaired_reports'])
    },
    allModelCalls: {
      ...money(h['all.known_nano'], h['all.unknown_calls'], 0),
      calls: int(h['all.calls']), knownCalls: int(h['all.known_calls']), repairCalls: int(h['all.repair_calls']),
      undeliveredRuns: int(h['runs.undelivered'])
    },
    byProtocol
  };
}
const monthKey = d => d.toISOString().slice(0,7);

export async function getUsageStatsSnapshot(now = new Date()){
  const k = statsKeys(now);
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const [total, month, day, previous] = await readUsageStatsHashes([k.total, k.month, k.day, 'stats:v1:m:' + monthKey(prev)]);
  return {
    schema: USAGE_STATS_SCHEMA,
    generatedAt: now.toISOString(),
    timezone: 'UTC',
    currency: 'USD',
    moneyUnit: USAGE_STATS_UNIT,
    estimateNotice: 'Spend figures are list-price estimates from token counts returned by the provider. They are not an Anthropic invoice. When unknownCalls > 0 the amount is a lower bound.',
    baseline: { utcDate: total.firstRecordedAt ? String(total.firstRecordedAt).slice(0,10) : null, firstRecordedAt: total.firstRecordedAt || null, backfilled: false },
    periods: { month: monthKey(now), day: now.toISOString().slice(0,10), previousMonth: monthKey(prev) },
    protocols: USAGE_STATS_PROTOCOLS,
    lifetime: shapePeriod(total),
    currentMonth: shapePeriod(month),
    today: shapePeriod(day),
    previousMonth: shapePeriod(previous)
  };
}
