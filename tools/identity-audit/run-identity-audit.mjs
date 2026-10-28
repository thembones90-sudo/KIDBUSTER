// Owner-run, READ-ONLY production identity audit (no writes, ever).
//
//   $env:CLASSBUSTER_OWNER_KEY = '<owner key>'   # never commit or log it
//   node tools/identity-audit/run-identity-audit.mjs --base https://classbuster.com `
//     --out "A:\CLASSBUSTER-IDENTITY-AUDIT.json" [--emails "A:\known-emails.txt"] [--max-pages 50] [--dry-run-repairs]
//
// Pages through license:* and email:* with the owner-only identity-audit
// action, then reports masked totals. Ambiguity is decided across ALL pages:
// an email hash carried by two paid records is never offered for repair.
// --dry-run-repairs asks the server what each unique repair WOULD do
// (dryRun:true); applying stays a deliberate, per-customer owner action.
// The output file holds masked emails, hashes and key fingerprints only.
import { writeFileSync, readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { isAbsolute } from 'node:path';

const args = process.argv.slice(2);
const arg = (name, fallback = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const base = String(arg('--base', 'https://classbuster.com')).replace(/\/$/, '');
const out = arg('--out');
const maxPages = Math.max(1, Math.min(500, Number(arg('--max-pages', '50')) || 50));
const ownerKey = process.env.CLASSBUSTER_OWNER_KEY || '';
if(!ownerKey) throw new Error('Set CLASSBUSTER_OWNER_KEY in the environment (never pass it as an argument).');
if(!out || !isAbsolute(out)) throw new Error('--out must be an absolute path.');

async function admin(body){
  const response = await fetch(base + '/api/admin-license-lookup', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-key': ownerKey }, body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if(!response.ok && !(body.action === 'identity-repair' && payload && 'reason' in payload)) throw new Error(body.action + ' failed: HTTP ' + response.status);
  return payload;
}
async function scanAll(scope){
  const rows = []; let cursor = '0', pages = 0, complete = false;
  do{
    // Candidate tokens are requested only for a repair preview.
    const page = await admin({ action: 'identity-audit', scope, cursor, count: 50, withCandidates: scope === 'licenses' && args.includes('--dry-run-repairs') });
    rows.push(...page.rows); cursor = page.cursor; pages++;
    if(page.done){ complete = true; break; }
  }while(pages < maxPages);
  return { rows, pages, complete };
}
const tally = rows => rows.reduce((t, r) => (t[r.verdict] = (t[r.verdict] || 0) + 1, t), {});

const licenses = await scanAll('licenses');
const indexes = await scanAll('email-index');
const paidByEmail = {};
for(const row of licenses.rows){
  if(row.emailHash && !['free', 'missing'].includes(row.kind)) (paidByEmail[row.emailHash] ||= []).push(row.ref);
}
const ambiguous = Object.entries(paidByEmail).filter(([, refs]) => refs.length > 1).map(([emailHash, refs]) => ({ emailHash, refs }));
const ambiguousSet = new Set(ambiguous.map(a => a.emailHash));
const repairable = licenses.rows.filter(r => r.verdict.startsWith('repairable_') && !ambiguousSet.has(r.emailHash));
const needsProof = licenses.rows.filter(r => r.verdict === 'needs_key_proof_no_email' || r.verdict === 'ambiguous_email_on_two_paid_accounts');

let knownEmails = [];
const emailsFile = arg('--emails');
if(emailsFile){
  const list = readFileSync(emailsFile, 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
  for(let i = 0; i < list.length; i += 20) knownEmails.push(...(await admin({ action: 'identity-lookup-email', emails: list.slice(i, i + 20) })).results);
  // Correlate each known email with every license record carrying it, even unindexed ones.
  knownEmails = knownEmails.map(k => ({ ...k, recordsCarryingEmail: licenses.rows.filter(r => r.emailHash === k.emailHash).map(r => ({ ref: r.ref, kind: r.kind, plan: r.plan, verdict: r.verdict })) }));
}

const dryRuns = [];
if(args.includes('--dry-run-repairs')){
  for(const row of repairable){
    // The candidate token alone identifies the email server-side; no email or key is sent from here.
    if(!row.candidateToken){ dryRuns.push({ ref: row.ref, emailMasked: row.emailMasked, verdict: row.verdict, ok: false, reason: 'no_candidate_token', current: null }); continue; }
    const result = await admin({ action: 'identity-repair', candidateToken: row.candidateToken, email: '', dryRun: true });
    dryRuns.push({ ref: row.ref, emailMasked: row.emailMasked, verdict: row.verdict, ok: result.ok, reason: result.reason || null, current: result.plan?.current || null });
  }
}

const strip = rows => rows.map(({ candidateToken, ...rest }) => rest);
const report = {
  generatedAt: new Date().toISOString(), base,
  coverage: { licensePages: licenses.pages, licenseScanComplete: licenses.complete, indexPages: indexes.pages, indexScanComplete: indexes.complete },
  licenseTotals: tally(licenses.rows), indexTotals: tally(indexes.rows),
  ambiguousPaidEmails: ambiguous,
  repairableUnique: strip(repairable), needsOwnerEvidence: strip(needsProof),
  staleIndexes: indexes.rows.filter(r => r.verdict !== 'ok'),
  knownEmails, dryRuns,
  reportHash: null
};
report.reportHash = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex').slice(0, 16);
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out, coverage: report.coverage, licenseTotals: report.licenseTotals, indexTotals: report.indexTotals, ambiguous: ambiguous.length, repairableUnique: repairable.length, needsOwnerEvidence: needsProof.length }, null, 2));
