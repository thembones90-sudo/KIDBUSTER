// Pull teacher feedback from a Pathfinder deployment for the owner.
//
//   node tools/feedback-pull.mjs [--url https://host] [--json] [--limit 500]
//
// The owner key is read from PATHFINDER_OWNER_KEY or from
// .v2-local/owner-key.txt (gitignored). It is sent only as the x-app-key
// header to the chosen host and is never printed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const base = arg('--url', 'https://pathfinder-v2-staging-preview.vercel.app').replace(/\/+$/, '');
const limit = Number(arg('--limit', '500')) || 500;

function ownerKey(){
  if(process.env.PATHFINDER_OWNER_KEY) return process.env.PATHFINDER_OWNER_KEY.trim();
  const file = path.join(root, '.v2-local', 'owner-key.txt');
  try{ return fs.readFileSync(file, 'utf8').trim(); }catch{ return ''; }
}

const key = ownerKey();
if(!key){
  console.error('No owner key. Put it in .v2-local/owner-key.txt or set PATHFINDER_OWNER_KEY.');
  process.exit(2);
}
if(!/^https:\/\//.test(base)){ console.error('Refusing non-HTTPS URL.'); process.exit(2); }

const res = await fetch(base + '/api/feedback?limit=' + limit, { headers: { 'x-app-key': key } });
if(!res.ok){ console.error('Request failed: HTTP ' + res.status); process.exit(1); }
const data = await res.json();
if(args.includes('--json')){ console.log(JSON.stringify(data, null, 2)); process.exit(0); }

const s = data.summary, o = s.overall || {};
const fmt = v => v == null ? '–' : v.toFixed(2) + '★';
const line = it => `- #${it.id} ${it.at.slice(0, 10)} ${it.category}${it.score != null ? ' ' + it.score + '★' : ''} ${it.protocol || '?'}` +
  `${it.model ? ' ' + it.model : ''}${it.repairOutcome && it.repairOutcome !== 'not_needed' ? ' repair=' + it.repairOutcome : ''}` +
  ` (${it.teacherName || 'unknown'})${it.comment ? '\n    ' + it.comment.replace(/\n/g, '\n    ') : ''}` +
  `${it.advisory?.length ? '\n    checks: ' + it.advisory.join(' | ') : ''}`;
const table = (title, map) => [`\n## ${title}`, ...Object.entries(map).sort((a, b) => b[1].count - a[1].count)
  .map(([k, v]) => `- ${k}: ${v.count} items, avg ${fmt(v.avgScore)}, low ${v.low}, bugs ${v.bugs}, ideas ${v.ideas}`)];
console.log([
  `# Feedback from ${base}`,
  `${s.total} items · ${s.accounts} teachers · avg ${fmt(o.avgScore)} (${o.rated || 0} rated) · ${o.low || 0} low · ${o.bugs || 0} bugs · ${o.ideas || 0} ideas · ${s.linkedToReport} linked to a report`,
  ...table('By protocol', s.byProtocol), ...table('By model', s.byModel), ...table('By repair outcome', s.byRepairOutcome),
  ...table('By length', s.byLength), ...table('By teacher', s.byTeacher),
  `\n## Bugs (${s.bugs.length})`, ...s.bugs.map(line),
  `\n## Low ratings (${s.lowScores.length})`, ...s.lowScores.map(line),
  `\n## Ideas (${s.ideas.length})`, ...s.ideas.map(line)
].join('\n'));
