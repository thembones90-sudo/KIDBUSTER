'use strict';
const fs=require('fs'),path=require('path');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=function run(){
 const {check,getFailures}=createChecker();
 const root=path.resolve(__dirname,'..');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/scout-release.json'),'utf8'));
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const script=fs.readFileSync(path.join(root,'assets/scout-release.js'),'utf8');
 check('static release manifest exists and has boolean state',typeof manifest.available==='boolean');
 check('no unreleased installer URL is exposed',manifest.available ||
   (Object.keys(manifest).length===1&&!manifest.downloadUrl));
 if (manifest.available){
  let good=false;
  try {const u=new URL(manifest.downloadUrl);good=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&!u.port&&
   ((u.hostname==='github.com'&&/^\/thembones90-sudo\/[\w.-]+\/releases\/download\/[^/?#]+\/[^/?#]+\.(exe|msi|msix)$/i.test(u.pathname))||
    (u.hostname==='classbuster.com'&&/^\/downloads\/[\w.-]+\.(exe|msi|msix)$/i.test(u.pathname)));}catch{}
  check('public installer URL is restricted to owned HTTPS releases',good);
  check('published version and hash have expected shape',/^\d+\.\d+/.test(manifest.version)&&/^[0-9a-fA-F]{64}$/.test(manifest.sha256));
 }
 check('release banner is present but hidden until a real release',
   html.includes('id="scoutReleaseBanner" hidden')&&html.includes('id="scoutReleaseLink"')&&html.includes('assets/scout-release.js'));
 check('UI fetches static manifest rather than adding a Vercel API function',
   script.includes('/assets/scout-release.json')&&!script.includes('/api/scout-release'));
 return getFailures();
};
