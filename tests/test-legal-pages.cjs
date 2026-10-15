'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=function run(){
 const {check,getFailures}=createChecker();
 const root=path.resolve(__dirname,'..');
 const names=['terms-of-use.html','privacy-policy.html','disclaimers.html'];
 const bodies=names.map(n=>fs.readFileSync(path.join(root,n),'utf8'));
 const css=fs.readFileSync(path.join(root,'legal.css'),'utf8');
 check('all three public legal pages and shared CSS exist',bodies.length===3&&css.length>1000);
 check('pages have accessible English metadata and internal site navigation',
   bodies.every((s,i)=>s.startsWith('<!doctype html>')&&s.includes('<html lang="en">')&&
      s.includes('<main id="content">')&&s.includes('<nav')&&s.includes('<link rel="stylesheet" href="/legal.css">')&&
      names.every(n=>s.includes('/'+n))&&s.includes('Effective date: 14 October 2026')));
 check('legal pages include contact email and working internal links',
   bodies.every(s=>s.includes('mailto:thembones90@gmail.com')&&s.includes('href="/"')));
 check('terms give pricing, renewals and teacher review responsibility',
   /US\$12 per month/.test(bodies[0])&&/renews automatically/.test(bodies[0])&&
   /five Classic report generations per month/.test(bodies[0])&&
   /must review, correct, and approve every draft/.test(bodies[0]));
 check('privacy discloses third-party AI, student data, retention gap, and privacy rights',
   /Anthropic/.test(bodies[1])&&/Lemon Squeezy/.test(bodies[1])&&/Krisp/.test(bodies[1])&&
   /does not impose a fixed automatic expiry/.test(bodies[1])&&/rights to request access/.test(bodies[1]));
 check('disclaimers insist on teacher review and independent platform status',
   /Do not submit AI output/.test(bodies[2])&&/Independent service/.test(bodies[2]));
 check('legal pages have no third-party scripts or inline event handlers',
   bodies.every(s=>!/<script\b|onfocus=|onblur=|onload=|javascript:/i.test(s)));
 check('CSS includes mobile breakpoints, visible keyboard focus and skip link',
   css.includes('@media(max-width:600px)')&&css.includes(':focus-visible')&&css.includes('.skip-link:focus'));
 return getFailures();
};
if(require.main===module)process.exit(module.exports()?1:0);