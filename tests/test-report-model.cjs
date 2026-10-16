'use strict';
// Report model selection (owner decision 2026-10-16): Claude Haiku 5.5 at
// effort high with an 8000-token ceiling; ANTHROPIC_MODEL=claude-sonnet-4-6 is
// an exact rollback; anything else falls back to Haiku. No network.
const {createChecker}=require('./helpers/assert.cjs');
const {validReportForProviderBody}=require('./helpers/valid-reports.cjs');
module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-report-model.cjs ===');
  const svc=await import('../api/_lib/license-service.js');
  const generate=(await import('../api/generate.js')).default;
  const {__resetForTests}=await import('../api/_lib/kv-client.js');
  const prior={fetch:global.fetch,key:process.env.ANTHROPIC_API_KEY,model:process.env.ANTHROPIC_MODEL};
  process.env.ANTHROPIC_API_KEY='isolated_test_key';
  const bodies=[];
  global.fetch=async(_u,o)=>{bodies.push(JSON.parse(o.body));return {ok:true,json:async()=>({content:[{type:'thinking',thinking:''},{type:'text',text:validReportForProviderBody(o.body)}],usage:{output_tokens:900},stop_reason:'end_turn'})};};
  async function once(env){
    if(env===undefined)delete process.env.ANTHROPIC_MODEL;else process.env.ANTHROPIC_MODEL=env;
    __resetForTests();const key=(await svc.createManualProLicense({email:'model-'+Math.random()+'@example.com'})).licenseKey;
    let status=0,body=null;
    await generate({method:'POST',headers:{'x-app-key':key,'x-installation-id':'model-test'},body:{generation:{protocol:'BEIDA',teacherName:'Layne',studentName:'Test Student',notes:'Fictional lesson notes.',rating:'excellent'}}},
      {status(c){status=c;return this;},json(b){body=b;return this;},setHeader(){}});
    return {status,body,sent:bodies[bodies.length-1]};
  }
  try{
    const d=await once(undefined);
    check('default report model is Claude Haiku 5.5',d.sent.model==='claude-haiku-5-5');
    check('Haiku runs at effort high',d.sent.output_config&&d.sent.output_config.effort==='high');
    check('Haiku gets a 16000-token ceiling for thinking plus report',d.sent.max_tokens===16000);
    check('a thinking block plus report text is delivered as just the report',d.status===200&&!/thinking/.test(d.body.text)&&d.body.text.startsWith('LEARNING CONTENT:'));
    const r=await once('claude-sonnet-4-6');
    check('rollback env restores Sonnet 4.6 exactly (3000 tokens, no output_config)',r.sent.model==='claude-sonnet-4-6'&&r.sent.max_tokens===3000&&!('output_config' in r.sent));
    const bad=await once('gpt-5 or anything else');
    check('an unknown ANTHROPIC_MODEL falls back to the default, never passed through',bad.sent.model==='claude-haiku-5-5');
    check('no temperature or other sampling parameters are sent',!('temperature' in d.sent)&&!('top_p' in d.sent));
  }finally{
    global.fetch=prior.fetch;
    for(const [k,v] of [['ANTHROPIC_API_KEY',prior.key],['ANTHROPIC_MODEL',prior.model]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  }
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(f=>process.exit(f?1:0));}
