// Release lineage guard (owner-approved 2026-11-03).
//
// Twice in two days a production release was built from a branch that did
// not contain what was already live, silently removing other work. This
// module answers one question before staging or promoting: does the
// candidate commit CONTAIN the live release?
//
// Live identity, strongest first:
//  1. /release.json written by tools/release/release.mjs: { commit }.
//     The candidate must have that commit as an ancestor.
//  2. Releases made without the tool: fingerprint the live page and every
//     script/stylesheet it loads, and require ONE commit in the candidate's
//     history whose files match all of them. (A page-only match is not
//     enough: the 2026-11-02 regression differed only in a script.)
// Anything else (unreachable site, no matching commit) refuses.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const LIVE_ORIGIN = 'https://classbuster.com';
const SHA = /^[0-9a-f]{40}$/;

export function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

// Same-origin static files referenced by the page: /assets/... and root
// stylesheets/scripts. Query strings (cache busters) are dropped.
export function referencedFiles(html) {
  const out = new Set(['index.html']);
  for (const m of html.matchAll(/(?:src|href)="\/?((?:assets\/)?[\w./-]+\.(?:js|css))(?:\?[^"]*)?"/g)) {
    if (!m[1].includes('..')) out.add(m[1]);
  }
  return [...out].sort();
}

// Git blob id of fetched bytes, with the repository's line-ending rules
// applied exactly as for a checked-out file.
export function blobId(relPath, bytes, cwd) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-lineage-'));
  try {
    const file = path.join(tmp, 'f');
    fs.writeFileSync(file, bytes);
    return git(['hash-object', '--path=' + relPath, file], { cwd });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export async function readLive({ origin = LIVE_ORIGIN, fetchImpl = fetch } = {}) {
  // A unique query defeats edge caches: a stale stamp could otherwise vouch
  // for an older release (seen 2026-11-03: a cached 404 outlived a release).
  const get = async p => {
    const fresh = (p.includes('?') ? '&' : '?') + 'lineage=' + Date.now() + Math.random().toString(36).slice(2);
    const r = await fetchImpl(origin + '/' + p + fresh, { cache: 'no-store', redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  };
  const stamp = await get('release.json');
  if (stamp) {
    try {
      const j = JSON.parse(stamp.toString('utf8'));
      if (SHA.test(j.commit || '')) return { kind: 'stamp', commit: j.commit, stamp: j };
    } catch { /* not a release stamp: fall through */ }
  }
  const page = await get('');
  if (!page) throw new Error('Could not read the live site at ' + origin);
  const files = { 'index.html': page };
  for (const rel of referencedFiles(page.toString('utf8'))) {
    if (rel === 'index.html') continue;
    const bytes = await get(rel);
    if (!bytes) throw new Error('Live page references ' + rel + ' but it could not be read');
    files[rel] = bytes;
  }
  return { kind: 'fingerprint', files };
}

// Decide. `history` is the candidate's commits newest first; `treeIds(commit,
// paths)` returns { path: blobId|null }; `isAncestor(a, b)`.
export function decide(live, { candidate, history, treeIds, isAncestor, blobOf }) {
  if (live.kind === 'stamp') {
    return isAncestor(live.commit, candidate)
      ? { ok: true, how: 'stamp', live: live.commit }
      : { ok: false, how: 'stamp', live: live.commit,
          reason: 'The candidate does not contain the live release ' + live.commit.slice(0, 7) + '. Merge it first.' };
  }
  const paths = Object.keys(live.files).sort();
  const want = Object.fromEntries(paths.map(p => [p, blobOf(p, live.files[p])]));
  for (const commit of history) {
    // The page differs in almost every commit: rule those out cheaply first.
    if (treeIds(commit, ['index.html'])['index.html'] !== want['index.html']) continue;
    const have = treeIds(commit, paths);
    if (paths.every(p => have[p] === want[p])) return { ok: true, how: 'fingerprint', live: commit, files: paths.length };
  }
  return { ok: false, how: 'fingerprint', files: paths.length,
    reason: 'No commit in the candidate history matches the live site (' + paths.length +
      ' files compared). The live release came from elsewhere: find it and merge it first.' };
}

export function gitAdapters(cwd, candidate = 'HEAD', depth = 600) {
  return {
    candidate: git(['rev-parse', candidate], { cwd }),
    history: git(['rev-list', '-n', String(depth), candidate], { cwd }).split('\n').filter(Boolean),
    treeIds(commit, paths) {
      // One process per commit: `<mode> blob <id>\t<path>` for each file.
      const out = Object.fromEntries(paths.map(p => [p, null]));
      const listing = git(['ls-tree', commit, '--', ...paths], { cwd });
      for (const line of listing.split('\n')) {
        const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line);
        if (m && m[2] in out) out[m[2]] = m[1];
      }
      return out;
    },
    isAncestor(a, b) {
      try { git(['cat-file', '-e', a + '^{commit}'], { cwd }); }
      catch { try { git(['fetch', '-q', 'origin', '+refs/heads/*:refs/remotes/origin/*'], { cwd }); } catch { /* checked below */ } }
      try { git(['merge-base', '--is-ancestor', a, b], { cwd }); return true; } catch { return false; }
    },
    blobOf: (p, bytes) => blobId(p, bytes, cwd),
  };
}

export async function checkLineage({ cwd, candidate = 'HEAD', origin = LIVE_ORIGIN, fetchImpl } = {}) {
  const live = await readLive({ origin, fetchImpl });
  return decide(live, gitAdapters(cwd, candidate));
}
