'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=function run(){
 const {check,getFailures}=createChecker();
 const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
 console.log('\n=== test-customer-copy.cjs ===');
 check('Help Free allowance accurately states five monthly Classic reports',html.includes('5 Classic reports each month. Start with an email inside Access.'));
 check('signup modal accurately states five monthly Classic reports',html.includes('5 Classic reports every month. No card required.'));
 check('obsolete twenty-report Free claim absent from rendered source',!/20 Classic reports/i.test(html));
 check('Free signup still promises a secure email link',html.includes('We’ll email you a secure sign-in link.'));
 check('seven protocol selectors remain available',(html.match(/name="protocol" value="/g)||[]).length===7);
 return getFailures();
};
if(require.main===module){process.exitCode=module.exports();}
