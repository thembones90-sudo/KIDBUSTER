// Offline SDK-boundary measurement. No real credentials, network or data.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
process.env.KIDBUSTER_TEST_KV='0';
delete process.env.PATHFINDER_V2_LOCAL_DB;
process.env.KV_REST_API_URL='https://redis-command-fixture.invalid';
process.env.KV_REST_API_TOKEN='synthetic-only';
process.env.FOUNDER_KEY='';
process.env.FOUNDER_KEYS='';
process.env.OWNER_LICENSE_KEYS='';
process.env.FOUNDER_LICENSE_KEYS='';
const commands=[];
const token='a'.repeat(64);
const values=new Map([
  ['license:synthetic-pro',JSON.stringify({plan:'pro',status:'active'})],
  ['krisp:user:synthetic-pro',JSON.stringify({token,createdAt:new Date().toISOString()})]
]);
globalThis.fetch=async function(url,init){
  assert.ok(String(url).startsWith(process.env.KV_REST_API_URL),'fixture cannot access network');
  const body=JSON.parse(init.body);
  const pipeline=Array.isArray(body[0]);
  function execute(cmd){
    const op=String(cmd[0]).toUpperCase();commands.push(op);
    let result=null;
    if(op==='GET')result=values.get(cmd[1])??null;
    else if(op==='SET'){values.set(cmd[1],String(cmd[2]));result='OK';}
    else if(op==='GETDEL'){result=values.get(cmd[1])??null;values.delete(cmd[1]);}
    else if(op==='EVAL'){values.delete(cmd[3]);result=1;}
    else if(op==='MGET')result=cmd.slice(1).map(k=>values.get(k)??null);
    else if(op==='DEL'){result=Number(values.delete(cmd[1]));}
    else throw new Error('Unexpected command '+op);
    // Upstash defaults to base64 REST results, including nested values.
    const headers=new Headers(init.headers);
    function encode(value){return Array.isArray(value)?value.map(encode):typeof value==='string'?Buffer.from(value).toString('base64'):value;}
    if(headers.get('upstash-encoding')==='base64')result=encode(result);
    return {result};
  }
  return new Response(JSON.stringify(pipeline?body.map(execute):execute(body)),{status:200,headers:{'content-type':'application/json'}});
};
const {default:handler}=await import('../api/krisp-session.js');
let status=200,response;
const res={status(code){status=code;return this;},json(body){response=body;return this;}};
await handler({method:'GET',headers:{'x-app-key':'synthetic-pro'},query:{}},res);
assert.equal(status,200);assert.equal(response.matched,null);assert.deepEqual(response.pending,[]);
assert.equal(commands.length,9,'hotfix established-Pro idle poll outer command budget');
assert.deepEqual(commands.slice().sort(),['EVAL','GET','GET','GET','GET','GET','GET','GETDEL','SET'].sort());
console.log(JSON.stringify({fixture:'empty established Pro poll',outerCommands:commands.length,commands,additionalLuaLogicalOperations:2,productionRequests:0}));
const {writeImportQueue}=await import('../api/_lib/krisp-retention.js');
const {markNewTranscript}=await import('../api/_lib/transcript-retention.js');
const pendingKey='krisp:data:synthetic-pro:pending';
await writeImportQueue(pendingKey,[markNewTranscript({meetingId:'fixture-only',transcript:'Synthetic text only'})]);
commands.length=0;
await handler({method:'GET',headers:{'x-app-key':'synthetic-pro'},query:{}},res);
assert.equal(response.pending.length,1);
assert.equal(commands.length,10,'new pending content adds one MGET, not one GET per body');
assert.equal(commands.filter(c=>c==='MGET').length,1);
console.log(JSON.stringify({fixture:'one new pending body',outerCommands:commands.length,commands,productionRequests:0}));
const {default:licenseStatus}=await import('../api/license-status.js');
commands.length=0;
await licenseStatus({method:'GET',headers:{'x-app-key':'synthetic-pro'}},res);
assert.equal(status,200);assert.equal(response.plan,'pro');assert.equal(commands.length,2);
console.log(JSON.stringify({fixture:'subscription Pro license-status',outerCommands:commands.length,commands,productionRequests:0}));
values.set('license:synthetic-free',JSON.stringify({plan:'free',status:'active'}));
commands.length=0;
await licenseStatus({method:'GET',headers:{'x-app-key':'synthetic-free'}},res);
assert.equal(status,200);assert.equal(response.plan,'free');assert.equal(commands.length,8);
console.log(JSON.stringify({fixture:'Free license-status with six protocol trials',outerCommands:commands.length,commands,productionRequests:0}));
process.env.RADAR_VAN_ENABLED='true';
process.env.OWNER_LICENSE_KEYS='synthetic-owner-fixture';
process.env.RADAR_VAN_OWNER_SHA256=createHash('sha256').update('synthetic-owner-fixture').digest('hex');
const {default:scoutSession}=await import('../api/_lib/radar-van-session-handler.js');
commands.length=0;
await scoutSession({method:'GET',headers:{'x-app-key':'synthetic-owner-fixture','x-radar-since':'0'}},res);
assert.equal(status,200);assert.equal(response.unchanged,true);assert.deepEqual(commands,['GET']);
console.log(JSON.stringify({fixture:'unchanged authorized Scout version',outerCommands:commands.length,commands,productionRequests:0}));
commands.length=0;
await scoutSession({method:'GET',headers:{'x-app-key':'synthetic-owner-fixture'}},res);
assert.equal(status,200);assert.equal(response.pendingCount,0);assert.equal(commands.length,5);
console.log(JSON.stringify({fixture:'Scout full empty view without leasing',outerCommands:commands.length,commands,productionRequests:0}));
const {buildUsageStatsPlan}=await import('../api/_lib/usage-stats.js');
const plan=buildUsageStatsPlan({licenseKey:'synthetic-pro',generationId:'fixture',runToken:'fixture-run',protocol:'MA',delivered:true,attempts:[{kind:'generation',nano:123}]});
// Source-derived: three HINCRBYs per nonzero field, two SET NX markers,
// HSETNX baseline, daily EXPIRE, and the outer EVAL. No script is executed.
const statsCommands=3*(plan.always.length+plan.delivered.length)+5;
assert.equal(statsCommands,38);
console.log(JSON.stringify({fixture:'single known-cost successful report telemetry plan',sourceDerivedLogicalCommands:statsCommands,outerEvals:1,productionRequests:0}));
