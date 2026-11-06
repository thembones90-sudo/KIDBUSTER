'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=function run(){
 const {check,getFailures}=createChecker();
 const root=path.resolve(__dirname,'..');
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const deploy=read('tools/release/release.mjs');
 const lock=read('tools/release/verify-scout-release.mjs');
 const publisher=read('tools/release/publish-scout-and-site.mjs');
 const native=read('AGENTS.md');
 const stage=deploy.split("}else if(command === 'stage'){")[1]?.split("}else if(command === 'promote')")[0]||'';
 const promote=deploy.split("}else if(command === 'promote'){")[1]||'';
 check('all site deployments stage only after Scout release lock',
   stage.includes("verify-scout-release.mjs") && stage.indexOf("verify-scout-release.mjs")<stage.indexOf("const live = await guard()"));
 check('promotion rechecks release lock',
   promote.includes("execFileSync('node', ['tools/release/verify-scout-release.mjs']"));
 check('release guard compares latest GitHub tag and canonical installer digest',
   lock.includes("release','list")&&lock.includes("release','view")&&
   lock.includes("sha256:")&&lock.includes("manifest.sha256")&&
   lock.includes("manifest.downloadUrl")&&lock.includes("manifest.version"));
 check('one publication command links GitHub and Classbuster with verification',
   publisher.includes("release','create")&&
   publisher.includes("candidate-smoke.mjs")&&publisher.includes("--authenticated-vercel")&&publisher.includes("'promote'")&&
   publisher.includes("await verifyLive(expected)"));
 check('owner policy binds future app updates to website downloads',
   native.includes('ABSOLUTE OWNER RULE: native Scout release = live Classbuster installer'));
 return getFailures();
};
if(require.main===module)process.exit(module.exports()?1:0);
