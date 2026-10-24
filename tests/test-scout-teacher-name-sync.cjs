'use strict';
// Name sync uses the authenticated browser identity; device token can read
// only the teacher display label for its own paired account. No audio.
const crypto = require('node:crypto');
const {createChecker} = require('./helpers/assert.cjs');
const digest = x => crypto.createHash('sha256').update(x).digest('hex');
const newToken = () => 'rv1_' + crypto.randomBytes(32).toString('base64url');

module.exports = async function run(){
  const {check,getFailures} = createChecker();
  const keys=['KIDBUSTER_TEST_KV','OWNER_LICENSE_KEYS','RADAR_VAN_ENABLED','RADAR_VAN_OWNER_SHA256'];
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const owner='teacher-name-sync-owner-test';
  Object.assign(process.env,{KIDBUSTER_TEST_KV:'1',OWNER_LICENSE_KEYS:owner,
    RADAR_VAN_ENABLED:'true',RADAR_VAN_OWNER_SHA256:digest(owner)});
  try{
    const kv=await import('../api/_lib/kv-client.js');kv.__resetForTests();
    const feedback=(await import('../api/feedback.js')).default;
    const rv=await import('../api/_lib/radar-van.js');
    const request=async (route,body,headers={})=>{
      const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(x){this.code=x;return this;},json(x){this.body=x;return this;}};
      await feedback({method:'POST',body,headers:{'content-type':'application/json',...headers},
        query:{radar:route},url:'/api/feedback',socket:{remoteAddress:'127.0.0.1'}},res);
      return res;
    };
    const browser={ 'x-app-key':owner };
    const device=newToken(),other=newToken();
    const pair=await request('session',{action:'pair-approve',tokenHash:digest(device),teacherDisplayName:'Layne'},browser);
    check('account-bound pairing stores explicitly chosen teacher name',pair.code===200&&pair.body.paired);
    let result=await request('ingest',{action:'credential-check'},{authorization:'Bearer '+device});
    check('paired device reads Layne',result.code===200&&result.body.teacherLabel==='Layne');
    result=await request('ingest',{action:'credential-check'},{authorization:'Bearer '+other});
    check('unpaired token cannot learn teacher name',result.code===401&&!result.body.teacherLabel);
    result=await request('session',{action:'set-teacher-name',teacherDisplayName:'  Teacher Layne  '},browser);
    check('browser can update teacher name without rotating token',result.code===200&&result.body.teacherDisplayName==='Teacher Layne');
    result=await request('ingest',{action:'credential-check'},{authorization:'Bearer '+device});
    check('same device receives updated teacher name',result.body.teacherLabel==='Teacher Layne');
    result=await request('session',{action:'set-teacher-name',teacherDisplayName:'X'.repeat(81)},browser);
    check('oversized teacher names are rejected',result.code===400);
    result=await request('session',{action:'set-teacher-name',teacherDisplayName:'\nSTUDENT: spoof'},browser);
    check('newlines and forged speaker identifiers are rejected',result.code===400);
    const bad=await request('session',{action:'set-teacher-name',teacherDisplayName:'Wrong'}, {'x-app-key':'not-an-account'});
    check('unauthorized account cannot change teacher name',bad.code===403);
    const rotated=newToken();
    await request('session',{action:'pair-approve',tokenHash:digest(rotated),teacherDisplayName:'Another Name'},browser);
    result=await request('ingest',{action:'credential-check'},{authorization:'Bearer '+device});
    check('old device is cut off on token rotation',result.code===401);
    result=await request('ingest',{action:'credential-check'},{authorization:'Bearer '+rotated});
    check('replacement device gets only current identity name',result.code===200&&result.body.teacherLabel==='Another Name');
    await request('session',{action:'disconnect'},browser);
    result=await request('ingest',{action:'credential-check'},{authorization:'Bearer '+rotated});
    check('disconnect revokes profile access immediately',result.code===401);
    check('validates empty teacher display as no name',rv.validateScoutTeacherName('')===null);
  }catch(e){console.error('teacher sync test',e.stack||e);check('teacher sync contract completes',false);}
  finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
  console.log('\n=== test-scout-teacher-name-sync.cjs ===');
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
