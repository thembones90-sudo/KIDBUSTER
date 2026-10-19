'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-v2-live-checkout-redirect.cjs ===');
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 const snippet=html.slice(0,1500);
 check('public staging URL is scoped narrowly',snippet.includes('location.hostname === "pathfinder-v2-staging-preview.vercel.app"'));
 check('public staging sends visitors to the same live V2 origin before signup',snippet.includes('location.replace("https://kidbuster.vercel.app/")'));
 check('no old preview keys or query strings are forwarded',!snippet.includes('location.search')&&!snippet.includes('localStorage'));
 check('redirect runs before theme/app scripts',snippet.indexOf('location.replace(')<snippet.indexOf('assets/themes/appearance-v1.js'));
 check('staging test payment backstop is still loaded',html.includes('assets/staging-payment-guard.js?v=1'));
 return getFailures();
};
