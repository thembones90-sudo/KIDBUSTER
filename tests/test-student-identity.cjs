'use strict';
const {extractKidbusterCore}=require('./helpers/extract-core.cjs');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=function(){
 const {check,getFailures}=createChecker(),c=extractKidbusterCore();
 for(const key of Object.keys(c.PROTOCOLS)){
  const analyze=text=>c.PROTOCOLS[key].analyze(text,'4','Nina','long','girl','','adult','Alex','adult');
  check(key+' flags a wrong explicitly addressed student',analyze('Hi Jamie! We practised verbs.').some(w=>w.includes('Student identity mismatch')));
  check(key+' accepts correct greeting and other names in evidence',!analyze('Hi Alex! We read a story about Jamie.').some(w=>w.includes('Student identity mismatch')));
  check(key+' does not guess identity from ordinary narrative',!analyze('Jamie is a character in today’s story.').some(w=>w.includes('Student identity mismatch')));
 }
 const preply=(module,person)=>c.PROTOCOLS.PREPLY.analyze('Dear Mrs Smith, Alex practised verbs.','','Nina','long','','',module,'Alex',person);
 check('Preply parent greeting is not mistaken for a student',!preply('parent','adult').some(w=>w.includes('Student identity mismatch')));
 check('Preply child trial permits parent greeting',!preply('trial','child').some(w=>w.includes('Student identity mismatch')));
 return getFailures();
};
if(require.main===module)process.exitCode=module.exports();
