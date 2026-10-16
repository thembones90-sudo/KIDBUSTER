'use strict';
// Customer-visible text must not contain encoding damage, and validator
// warnings (which can quote model output) must be escaped before display.
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-ui-text-integrity.cjs ===');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const damage=html.match(/â€[”“™œ\u009d\u009c]?|Ã[\u0080-¿]|ðŸ/g)||[];
  check('index.html contains no UTF-8-read-as-Windows-1252 damage ('+damage.length+' found)',damage.length===0);
  check('lint warnings are escaped before being inserted as HTML',
    html.includes("warnings.map(w => '<li>' + escapeHtml(w) + '</li>')")&&
    !html.includes("warnings.map(w => '<li>' + w + '</li>')"));
  // Every inline <script> must still parse after edits.
  const scripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  let parsed=0;
  for(const code of scripts){try{new vm.Script(code);parsed++;}catch(e){console.log('  parse error:',e.message);}}
  check('all '+scripts.length+' inline scripts parse',scripts.length>0&&parsed===scripts.length);
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
