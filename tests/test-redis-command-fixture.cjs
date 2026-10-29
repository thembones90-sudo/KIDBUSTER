'use strict';
const {execFileSync}=require('node:child_process');
module.exports=function(){
  // Separate process is essential: the suite's memory KV omits production EVAL.
  const output=execFileSync(process.execPath,['tools/redis-command-fixture.mjs'],{encoding:'utf8',env:{...process.env,KIDBUSTER_TEST_KV:'0',PATHFINDER_V2_LOCAL_DB:''}});
  console.log(output.trim());return 0;
};
if(require.main===module)module.exports();
