'use strict';
const assert=require('node:assert/strict');
const {validReport}=require('./helpers/valid-reports.cjs');
module.exports=async function(){
  const {HAIKU_MODEL,HAIKU_MAX_TOKENS,estimateHaikuCost}=await import('../api/_lib/haiku-provider.js');
  assert.equal(HAIKU_MODEL,'claude-haiku-5-5');assert.equal(HAIKU_MAX_TOKENS,16000);
  assert.equal(estimateHaikuCost({input_tokens:1000,output_tokens:1000}),.0006);
  assert.equal(estimateHaikuCost({input_tokens:1000,output_tokens:1000,cache_creation_input_tokens:1000,cache_read_input_tokens:1000}),.000735);
  assert.equal(estimateHaikuCost({input_tokens:100001,output_tokens:1000}),.0525005);
  assert.equal(estimateHaikuCost({input_tokens:100000,output_tokens:1000}),.0105);
  assert.equal(estimateHaikuCost({input_tokens:1,cache_read_input_tokens:100000,output_tokens:1000}),.0075005);
  assert.equal(estimateHaikuCost(null),null);
  assert.equal(estimateHaikuCost({},'unknown-model'),null);
  assert.equal(estimateHaikuCost({input_tokens:-1}),null);
  assert.equal(estimateHaikuCost({input_tokens:NaN}),null);
  const generate=(await import('../api/generate.js')).default;
  const svc=await import('../api/_lib/license-service.js');
  const licensing=await import('../api/_lib/licensing.js');
  const kv=await import('../api/_lib/kv-client.js');
  const savedFetch=global.fetch,savedKey=process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY='isolated-mock-provider-key';
  // A contract-compliant Classic report: the server now refuses placeholder
  // strings such as 'A complete lesson report' before delivery.
  const REPORT=validReport('MA',{student:'Example',teacher:'Teacher',rating:'3'});
  try{
    for(const stop of ['end_turn','refusal','max_tokens']){
      kv.__resetForTests();
      const key=await svc.getOrCreateFreeLicense('haiku-'+stop+'@example.com');
      let sent,calls=0,status=0,result;
      global.fetch=async(_url,options)=>{
        calls++;sent=JSON.parse(options.body);
        return {ok:true,json:async()=>({model:HAIKU_MODEL,stop_reason:stop,content:[
          {type:'thinking',thinking:'Private reasoning',text:'Must not leak'},
          {type:'text',text:REPORT}
        ],usage:{input_tokens:1000,output_tokens:1000}})};
      };
      const req={method:'POST',headers:{'x-app-key':key,'x-installation-id':'haiku-mock-browser'},body:{model:'claude-sonnet-4-6',generation:{protocol:'MA',teacherName:'Teacher',studentName:'Example',notes:'Practised sports words with support.',rating:'3',lengthFormat:'medium'}}};
      const res={status(code){status=code;return res;},json(value){result=value;return res;},setHeader(){}};
      await generate(req,res);
      assert.equal(sent.model,HAIKU_MODEL);assert.equal(sent.max_tokens,16000);
      assert.deepEqual(sent.thinking,{type:'adaptive'});assert.deepEqual(sent.output_config,{effort:'high'});
      assert.equal(calls,1,'no automatic paid retry');
      const count=await licensing.getUsageCount(key,licensing.currentUsagePeriod());
      if(stop==='end_turn'){
        assert.equal(status,200);assert.equal(result.text,REPORT);
        assert.equal(result.model,HAIKU_MODEL);assert.equal(result.estimatedCostUsd,.0006);assert.equal(count,1);
      }else{
        assert.equal(status,502);assert.equal(count,0,'failed report quota released');
        assert.ok(result.reason);assert.equal(result.text,undefined);
      }
    }
    const html=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
    assert.ok(html.includes('estimatedCostUsd: data.estimatedCostUsd'));
    assert.ok(html.includes('costKnown ? estimatedCostUsd : 0'));
    assert.ok(!html.includes('const inputCost = usage.input_tokens * 3'));
    console.log('PASS Haiku model, adaptive headroom, response identity, thinking isolation, refusal/truncation quota recovery, cost tiers/cache and no automatic retries');
    return 0;
  }finally{
    global.fetch=savedFetch;
    if(savedKey===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=savedKey;
  }
};
