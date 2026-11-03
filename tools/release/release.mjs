#!/usr/bin/env node
// The one way to release the website (owner-approved 2026-11-03).
//
//   node tools/release/release.mjs check            does HEAD contain what is live?
//   node tools/release/release.mjs stage            guard, stamp, stage (domains untouched)
//   node tools/release/release.mjs promote <url>    guard again, then promote that candidate
//
// stage refuses a dirty tree or a commit that does not contain the live
// release (tools/release/lineage.mjs). It writes release.json (commit,
// branch, time, the live release it contains) into the upload only, so the
// next release can prove its lineage; release.json is never committed.
// promote refuses unless the URL is the candidate this checkout staged and
// the live release has not changed underneath it. Nothing here edits
// environment variables, billing, domains or data.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLineage, git } from './lineage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const STAMP = path.join(root, 'release.json');
const STAGED = path.join(root, '.release-candidate.json');
const VERCEL = process.env.VERCEL_CLI || 'A:\\PATHFINDER V2\\.v2-local\\vercel-cli\\node_modules\\.bin\\vercel.cmd';
const CANDIDATE_URL = /^https:\/\/kidbuster-[a-z0-9]+-thembones90-sudos-projects\.vercel\.app$/;

function fail(message){ console.error('REFUSED: ' + message); process.exit(1); }

async function guard(){
  const result = await checkLineage({ cwd: root });
  if(!result.ok) fail(result.reason);
  console.log('Lineage OK: this commit contains the live release ' + result.live.slice(0, 7) +
    (result.how === 'stamp' ? ' (release stamp)' : ' (matched ' + result.files + ' live files)'));
  return result;
}

function vercel(args){
  // Quoted: the default CLI path contains a space and runs through cmd.exe.
  return execFileSync('"' + VERCEL + '"', args, { cwd: root, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

const [command, arg] = process.argv.slice(2);
if(command === 'check'){
  await guard();
}else if(command === 'stage'){
  if(git(['status', '--porcelain', '--untracked-files=no'], { cwd: root })) fail('Commit or discard local changes first: only committed code is released.');
  const live = await guard();
  const commit = git(['rev-parse', 'HEAD'], { cwd: root });
  const stamp = { commit, branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root }), stagedAt: new Date().toISOString(), contains: live.live };
  fs.writeFileSync(STAMP, JSON.stringify(stamp, null, 2) + '\n');
  let out;
  try{ out = vercel(['deploy', '--prod', '--skip-domain', '--yes']); }
  finally{ fs.rmSync(STAMP, { force: true }); }
  const url = (out.match(/https:\/\/kidbuster-[a-z0-9]+-thembones90-sudos-projects\.vercel\.app/g) || []).pop();
  if(!url) fail('Vercel did not report a candidate URL.\n' + out.slice(-800));
  fs.writeFileSync(STAGED, JSON.stringify({ url, ...stamp }, null, 2) + '\n');
  console.log('Staged ' + commit.slice(0, 7) + ' as ' + url + ' (classbuster.com unchanged).');
  console.log('Next: node tools/release/candidate-smoke.mjs ' + url + ' --expect-scout enabled');
}else if(command === 'promote'){
  if(!CANDIDATE_URL.test(arg || '')) fail('Give the candidate URL printed by stage.');
  let staged = null;
  try{ staged = JSON.parse(fs.readFileSync(STAGED, 'utf8')); }catch{ /* checked below */ }
  if(!staged || staged.url !== arg) fail('That URL is not the candidate this checkout staged. Run stage again.');
  if(git(['rev-parse', 'HEAD'], { cwd: root }) !== staged.commit) fail('HEAD moved since staging. Run stage again.');
  await guard(); // the live release must still be contained (no one released meanwhile)
  process.stdout.write(vercel(['promote', arg, '--yes', '--timeout', '5m']).split('\n').filter(l => /Success|Error/.test(l)).join('\n') + '\n');
  console.log('Next: node tools/release/candidate-smoke.mjs https://classbuster.com --expect-scout enabled');
}else{
  console.log('usage: release.mjs check | stage | promote <candidate-url>');
  process.exit(2);
}
