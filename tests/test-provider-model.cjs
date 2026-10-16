'use strict';
// Slice 8: the provider model is configurable but can never be set to garbage.
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-provider-model.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const generate=(await import('../api/generate.js')).default;
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const priorFetch=global.fetch;
  const saved={m:process.env.ANTHROPIC_MODEL,k:process.env.ANTHROPIC_API_KEY};
  process.env.ANTHROPIC_API_KEY='isolated_test_key';
  async function modelSent(envValue){
    __resetForTests();
    if(envValue===undefined)delete process.env.ANTHROPIC_MODEL;else process.env.ANTHROPIC_MODEL=envValue;
    const key=await svc.getOrCreateFreeLicense('model-'+Math.random().toString(36).slice(2)+'@example.com');
    let sent=null;
    global.fetch=async(url,opts)=>{sent=JSON.parse(opts.body).model;return {ok:true,json:async()=>({content:[{text:'A complete report'}],usage:{output_tokens:4}})};};
    const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'model-test'},body:{generation:{protocol:'MA',teacherName:'Layne',studentName:'Test Student',notes:'Practised reading.',rating:'4'}}};
    let status=0;const res={setHeader(){},status(c){status=c;return res;},json(){return res;}};
    await generate(req,res);
    return {sent,status};
  }
  try{
    check('unset uses the certified default',(await modelSent(undefined)).sent==='claude-sonnet-4-6');
    check('blank uses the certified default',(await modelSent('   ')).sent==='claude-sonnet-4-6');
    check('a valid override is sent to the provider',(await modelSent('claude-sonnet-4-7')).sent==='claude-sonnet-4-7');
    check('surrounding whitespace is trimmed',(await modelSent('  claude-opus-4-1  ')).sent==='claude-opus-4-1');
    for(const bad of ['gpt-4','claude-','claude- opus','claude-x','CLAUDE-SONNET','claude-sonnet-4-6\nx-evil: 1','claude-'+'a'.repeat(80)]){
      check('malformed value '+JSON.stringify(bad).slice(0,30)+' falls back to the default',(await modelSent(bad)).sent==='claude-sonnet-4-6');
    }
    const ok=await modelSent('claude-sonnet-4-7');
    check('requests still succeed with an override',ok.status===200);
  }finally{
    global.fetch=priorFetch;
    for(const [n,v] of [['ANTHROPIC_MODEL',saved.m],['ANTHROPIC_API_KEY',saved.k]])if(v===undefined)delete process.env[n];else process.env[n]=v;
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
