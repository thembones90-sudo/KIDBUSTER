'use strict';
// The report model is an explicit allow-list (owner decision 2026-10-16):
// Claude Haiku 5.5 by default; ANTHROPIC_MODEL=claude-sonnet-4-6 is the exact
// rollback; any other value, valid-looking or malformed, falls back to Haiku.
const {createChecker}=require('./helpers/assert.cjs');
const {validReportForProviderBody}=require('./helpers/valid-reports.cjs');

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
    global.fetch=async(url,opts)=>{sent=JSON.parse(opts.body).model;return {ok:true,json:async()=>({content:[{type:'text',text:validReportForProviderBody(opts.body)}],usage:{output_tokens:4}})};};
    const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'model-test'},body:{generation:{protocol:'MA',teacherName:'Layne',studentName:'Test Student',notes:'Practised reading.',rating:'4'}}};
    let status=0;const res={setHeader(){},status(c){status=c;return res;},json(){return res;}};
    await generate(req,res);
    return {sent,status};
  }
  try{
    check('unset uses Claude Haiku 5.5',(await modelSent(undefined)).sent==='claude-haiku-5-5');
    check('blank uses Claude Haiku 5.5',(await modelSent('   ')).sent==='claude-haiku-5-5');
    check('the Sonnet 4.6 rollback is honoured',(await modelSent('claude-sonnet-4-6')).sent==='claude-sonnet-4-6');
    check('surrounding whitespace is trimmed',(await modelSent('  claude-sonnet-4-6  ')).sent==='claude-sonnet-4-6');
    for(const other of ['claude-sonnet-4-7','claude-opus-4-1','claude-sonnet-5-5']){
      check('unlisted model '+other+' is not passed through (falls back to Haiku)',(await modelSent(other)).sent==='claude-haiku-5-5');
    }
    for(const bad of ['gpt-4','claude-','claude- opus','CLAUDE-SONNET','claude-sonnet-4-6\nx-evil: 1','claude-'+'a'.repeat(80)]){
      check('malformed value '+JSON.stringify(bad).slice(0,30)+' falls back to Haiku',(await modelSent(bad)).sent==='claude-haiku-5-5');
    }
    check('requests succeed on the rollback model',(await modelSent('claude-sonnet-4-6')).status===200);
  }finally{
    global.fetch=priorFetch;
    for(const [n,v] of [['ANTHROPIC_MODEL',saved.m],['ANTHROPIC_API_KEY',saved.k]])if(v===undefined)delete process.env[n];else process.env[n]=v;
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
