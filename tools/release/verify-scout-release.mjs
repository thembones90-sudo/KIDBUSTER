#!/usr/bin/env node
// Release gate: a Classbuster website release must advertise the newest
// published native Scout installer, with the matching GitHub asset digest.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const repository='thembones90-sudo/KIDBUSTER';
function gh(args) {
  return JSON.parse(execFileSync('gh',[...args,'--repo',repository],{
    cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']
  }));
}
function number(v) { return v.split('.').map(Number); }
function compare(a,b) {
  const x=number(a),y=number(b);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];
  return 0;
}
try {
  const latest=gh(['release','list','--limit','100','--json','tagName,isDraft,isPrerelease'])
    .filter(r=>!r.isDraft&&!r.isPrerelease&&/^scout-\d+\.\d+\.\d+$/.test(r.tagName))
    .map(r=>r.tagName.slice(6)).sort(compare).at(-1);
  if(!latest) throw Error('No published Scout release found');
  const release=gh(['release','view','scout-'+latest,'--json','tagName,isDraft,isPrerelease,assets']);
  const asset=release.assets.filter(a=>a.name==='ScoutSetup.exe');
  const sha=/^sha256:([a-f0-9]{64})$/i.exec(asset[0]?.digest||'')?.[1]?.toLowerCase();
  if(release.isDraft||release.isPrerelease||asset.length!==1||!sha||asset[0].state!=='uploaded')
    throw Error('Latest GitHub Scout release asset is not verified');
  const expected=`https://github.com/${repository}/releases/download/scout-${latest}/ScoutSetup.exe`;
  const manifest=JSON.parse(readFileSync(path.join(root,'assets/scout-release.json'),'utf8'));
  if(manifest.available!==true||manifest.platform!=='Windows'||manifest.version!==latest||
     manifest.sha256?.toLowerCase()!==sha||manifest.downloadUrl!==expected)
    throw Error(`Classbuster manifest is STALE: current ${manifest.version||'unknown'}, latest published Scout ${latest}. Sync the installer before staging/promoting any site release.`);
  console.log('SCOUT RELEASE LOCK OK: '+latest+' / '+sha);
}catch(e) {
  console.error('SCOUT RELEASE LOCK REFUSED: '+e.message);
  process.exitCode=1;
}
