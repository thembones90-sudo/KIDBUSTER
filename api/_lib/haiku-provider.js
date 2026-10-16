// V2's owner-selected model. No automatic cross-model paid fallback.
export const HAIKU_MODEL = 'claude-haiku-5-5';
// Thinking shares max_tokens with the final report; keep headroom beyond the
// old 3000-token non-thinking budget. This does not relax protocol text limits.
export const HAIKU_MAX_TOKENS = 10000;

// Standard global list-price estimate, not an invoice. Cached prompt tokens
// are separate from input_tokens; output_tokens already includes thinking.
export function estimateHaikuCost(usage, model = HAIKU_MODEL){
  if(!usage || model !== HAIKU_MODEL) return null;
  const counts = ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens']
    .map(key => usage[key] ?? 0);
  if(counts.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null;
  const [input,output,write,read] = counts;
  const longContext = input + write + read > 100000;
  const rates = longContext ? [.5,2.5,.625,.05] : [.1,.5,.125,.01];
  return counts.reduce((sum,count,index) => sum + count * rates[index],0) / 1000000;
}
