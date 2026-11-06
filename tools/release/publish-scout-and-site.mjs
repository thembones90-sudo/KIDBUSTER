#!/usr/bin/env node
// ONE RELEASE LINE: native Scout installer + Classbuster public download.
// Usage:
//   node tools/release/publish-scout-and-site.mjs publish --version 1.4.17 --source A:\\SCOUT-SOURCE --installer A:\\QA\\ScoutSetup.exe
//   node tools/release/publish-scout-and-site.mjs sync --version 1.4.17
// Never declare a Scout release complete if the live website has an older manifest.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = 'thembones90-sudo/KIDBUSTER';
const manifestPath = path.join(root, 'assets/scout-release.json');
const args = process.argv.slice(2);
const command = args.shift();
const options = {};
for (let i=0; i<args.length; i+=2) {
  if (!args[i]?.startsWith('--') || !args[i+1]) throw Error('Expected --key value pairs');
  options[args[i].slice(2)] = args[i+1];
}
const version = options.version;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw Error('Provide a numeric --version X.Y.Z');
const tag = 'scout-' + version;
const expectedUrl = `https://github.com/${repo}/releases/download/${tag}/ScoutSetup.exe`;

function execute(cmd, parts, {cwd=root, silent=false}={}) {
  const out = execFileSync(cmd, parts, {cwd, encoding:'utf8', windowsHide:true,
    stdio:['ignore','pipe','pipe'], maxBuffer:16*1024*1024});
  if (!silent) process.stdout.write(out);
  return out.trim();
}
function gh(parts) { return JSON.parse(execute('gh', [...parts, '--repo', repo], {silent:true})); }
function git(parts) { return execute('git',parts,{silent:true}); }
function semver(v) { return v.split('.').map(Number); }
function cmp(a,b) {
  const x=semver(a),y=semver(b);
  for(let i=0;i<3;i++) if(x[i]!==y[i]) return x[i]-y[i];
  return 0;
}
function getReleases() {
  return gh(['release','list','--limit','100','--json','tagName,isDraft,isPrerelease'])
    .filter(r=>!r.isDraft&&!r.isPrerelease&&/^scout-\d+\.\d+\.\d+$/.test(r.tagName))
    .map(r=>r.tagName.slice(6));
}
function verifyNewest() {
  const versions = getReleases();
  if (versions.some(v=>cmp(v,version)>0)) throw Error(`Refusing stale Scout ${version}; a newer public release exists: ${versions.sort(cmp).at(-1)}`);
}
function getAsset() {
  const release=gh(['release','view',tag,'--json','tagName,isDraft,isPrerelease,assets']);
  if (release.isDraft||release.isPrerelease||release.tagName!==tag) throw Error('Release must be published and stable');
  const matches=release.assets.filter(a=>a.name==='ScoutSetup.exe');
  if(matches.length!==1) throw Error('Expected one canonical ScoutSetup.exe asset');
  const asset=matches[0];
  const hash=/^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '')?.[1]?.toLowerCase();
  if(!hash || asset.size < 10_000_000 || asset.state!=='uploaded') throw Error('Release installer digest, size or upload state is invalid');
  return {available:true,platform:'Windows',version,sha256:hash,downloadUrl:expectedUrl};
}
function assertSourceVersion(source) {
  if(!source) throw Error('Publishing requires --source with verified Scout source directory');
  const versionFile=fs.readFileSync(path.join(source,'radar_van/version.py'),'utf8');
  const metadata=fs.readFileSync(path.join(source,'tools/installer/scout-version.txt'),'utf8');
  if(!versionFile.includes(`VERSION = "${version}"`)||
     !metadata.includes(`'FileVersion', '${version}'`)) throw Error('Native code and installer metadata must match release version');
}
async function verifyLive(expected) {
  const result=await fetch('https://classbuster.com/assets/scout-release.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(!result.ok) throw Error('Live Classbuster manifest is unavailable: HTTP ' + result.status);
  const live=await result.json();
  for(const key of ['version','sha256','downloadUrl','available'])
    if(live[key]!==expected[key]) throw Error(`Live Classbuster ${key} differs from released Scout ${expected.version}`);
  console.log('LIVE SITE VERIFIED: Classbuster download = Scout '+expected.version+' / '+expected.sha256);
}
async function main() {
  if(!['publish','sync','check'].includes(command)) throw Error('Use publish, sync or check');
  if(command==='publish') {
    assertSourceVersion(options.source);
    if(!options.installer || path.basename(options.installer)!=='ScoutSetup.exe') throw Error('Use a verified ScoutSetup.exe installer');
    const bytes=fs.readFileSync(options.installer);
    if(bytes.length < 10_000_000) throw Error('Installer too small: refused');
    const localHash=createHash('sha256').update(bytes).digest('hex');
    verifyNewest();
    let existing=null;
    try {existing=getAsset();} catch(e) {
      if(!String(e.message).includes('release view')) throw e;
    }
    if(existing && existing.sha256!==localHash) throw Error('Release tag already exists with a different installer hash');
    if(!existing) {
      execute('gh',['release','create',tag,options.installer+'#ScoutSetup.exe','--repo',repo,
        '--title','Scout '+version,'--notes','Classbuster Scout '+version+' for Windows. Verified native installer.'],{silent:true});
    }
    const uploaded=getAsset();
    if(uploaded.sha256!==localHash) throw Error('Published asset digest does not match verified local installer');
    console.log('GITHUB VERIFIED: '+tag+' / '+localHash);
  }
  verifyNewest();
  const expected=getAsset();
  if(command==='check') {
    const current=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    if(current.version!==expected.version || current.sha256!==expected.sha256 ||
       current.downloadUrl!==expected.downloadUrl) throw Error('Source website manifest does not match latest published Scout');
    await verifyLive(expected);
    return;
  }
  if(git(['status','--porcelain','--untracked-files=no'])) throw Error('Website tree has tracked changes; commit or resolve before syncing');
  const previous=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  if(cmp(version,previous.version)<0) throw Error('Refusing website Scout version downgrade');
  fs.writeFileSync(manifestPath,JSON.stringify(expected,null,2)+'\n');
  execute('node',['scripts/verify-release-integrity.cjs'],{silent:true});
  execute('node',['tests/run-all.cjs'],{silent:true});
  git(['add','assets/scout-release.json']);
  // Commit only the public manifest; the release code must already be committed.
  if(git(['diff','--cached','--name-only'])) {
    git(['commit','-m',`Publish Scout ${version} verified download on Classbuster`]);
  }
  execute('node',['tools/release/release.mjs','check']);
  git(['push','-u','origin','HEAD']);
  const staged=execute('node',['tools/release/release.mjs','stage']);
  const candidate=staged.match(/https:\/\/kidbuster-[a-z0-9]+-thembones90-sudos-projects\.vercel\.app/g)?.at(-1);
  if(!candidate) throw Error('Stage gave no protected candidate URL. Do not promote');
  execute('node',['tools/release/candidate-smoke.mjs',candidate,'--expect-scout','enabled']);
  execute('node',['tools/release/release.mjs','promote',candidate]);
  execute('node',['tools/release/candidate-smoke.mjs','https://classbuster.com','--expect-scout','enabled']);
  await verifyLive(expected);
}
main().catch(e=>{console.error('RELEASE INCOMPLETE: '+e.message);process.exitCode=1;});
