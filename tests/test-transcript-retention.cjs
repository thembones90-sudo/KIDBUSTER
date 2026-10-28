'use strict';
const assert = require('node:assert/strict');

module.exports = async function(){
  process.env.KIDBUSTER_TEST_KV = '1';
  const {kv,__resetForTests} = await import('../api/_lib/kv-client.js');
  const {markNewTranscript,readTranscriptQueue,writeTranscriptQueue,rememberLegacyTranscript,prepareDeferredTranscript} = await import('../api/_lib/transcript-retention.js');
  const originalNow = Date.now, originalSet = kv.set;
  const HOUR = 3600000, LEGACY = 14*24*HOUR;
  let now = 1800000000000;
  Date.now = () => now;
  const pending = 'krisp:data:synthetic-retention-owner:pending';
  const matched = pending.replace(':pending', ':matchedQueue');
  const load = async key => (await readTranscriptQueue(key, await kv.get(key), LEGACY, now)).items;
  const record = (id, at=now) => ({meetingId:id,receivedAt:new Date(at).toISOString(),
    title:'Private lesson '+id,detectedStudentName:'Synthetic Student',transcript:'Private transcript '+id});
  try{
    __resetForTests();
    await kv.set('synthetic-past-expiry',{text:'expired'},{pxat:0});
    assert.equal(await kv.getdel('synthetic-past-expiry'),null,'absolute expiry also applies to atomic reads');
    const numeric=markNewTranscript(record(42),now);
    await writeTranscriptQueue(matched,[numeric],LEGACY,now);
    assert.equal((await load(matched))[0].meetingId,42,'legacy numeric provider IDs keep their identity');
    await kv.del(matched);
    const legacy = record('legacy',now-13*HOUR);
    await rememberLegacyTranscript(pending,legacy,LEGACY,now);
    const deferredOld=await prepareDeferredTranscript(pending,{...legacy,receivedAt:new Date(now).toISOString()},LEGACY,now);
    assert.equal(deferredOld.receivedAt,legacy.receivedAt,'server receipt preserves legacy time across client deferral');
    assert.equal(deferredOld.retentionVersion,undefined);
    const forgedOld=await prepareDeferredTranscript(pending,record('not-legacy'),LEGACY,now);
    assert.equal(forgedOld.retentionVersion,1,'client cannot declare a new transcript legacy');
    const newlyReusedId=markNewTranscript({...legacy},now);
    assert.equal((await prepareDeferredTranscript(pending,newlyReusedId,LEGACY,now)).retentionVersion,1,'new receipt cannot inherit an older legacy window');
    const first = markNewTranscript(record('first'),now);
    await writeTranscriptQueue(pending,[legacy,first],LEGACY,now);
    const raw = await kv.get(pending), ref = raw.find(x=>x.meetingId==='first');
    assert(!JSON.stringify(ref).includes('Private')&&!JSON.stringify(ref).includes('Synthetic Student'));
    assert.equal((await kv.get(ref.contentRef)).transcript,first.transcript);
    assert.equal(raw.find(x=>x.meetingId==='legacy').transcript,legacy.transcript);
    now+=11*HOUR;
    const items = await load(pending);
    items.find(x=>x.meetingId==='first').leasedUntil=now+45000;
    let bodyWrites=0;
    kv.set=async function(key,...args){if(key.includes(':content12:'))bodyWrites++;return originalSet.call(this,key,...args);};
    await writeTranscriptQueue(pending,items,LEGACY,now);
    assert.equal(bodyWrites,0,'poll/lease metadata must not rewrite transcript bodies');
    kv.set=originalSet;
    const deferredNew=await prepareDeferredTranscript(pending,items.find(x=>x.meetingId==='first'),LEGACY,now);
    assert.equal(deferredNew.retentionExpiresAt,first.retentionExpiresAt,'new deferral keeps original deadline');
    const second=markNewTranscript(record('second'),now);
    await writeTranscriptQueue(pending,[...items,second],LEGACY,now);
    const secondRef=(await kv.get(pending)).find(x=>x.meetingId==='second');
    now+=HOUR;
    assert.equal(await kv.get(ref.contentRef),null,'body expires at twelve hours without an inbox poll');
    assert((await kv.get(pending)).length===3,'mixed index can remain without retaining expired body');
    assert((await kv.get(secondRef.contentRef)).transcript===second.transcript,'later arrival retains its own window');
    const remaining=await load(pending);
    assert.deepEqual(remaining.map(x=>x.meetingId),['legacy','second']);
    await writeTranscriptQueue(matched,[remaining[1]],LEGACY,now);
    const moved=(await kv.get(matched))[0];
    assert.equal(moved.contentRef,secondRef.contentRef,'queue moves retain account-scoped body identity');
    assert.equal(moved.retentionExpiresAt,second.retentionExpiresAt);
    const other='krisp:data:another-owner:pending';
    await kv.set(other,[moved]);
    assert.equal((await load(other)).length,0,'forged references cannot read another account');
    now+=11*HOUR;
    assert.equal(await kv.get(moved.contentRef),null,'moving must not restart the clock');
    assert.equal((await load(pending))[0].meetingId,'legacy','existing transcript keeps its legacy window');

    __resetForTests();
    const fresh=markNewTranscript(record('failure'),now);
    kv.set=async function(key,...args){if(key===pending)throw Error('synthetic index write failure');return originalSet.call(this,key,...args);};
    await assert.rejects(writeTranscriptQueue(pending,[fresh],LEGACY,now),/index write/);
    kv.set=originalSet;
    assert.equal(await kv.get(pending),null,'failed publish never acknowledges a missing index');
    const [,orphans]=await kv.scan('0',{match:pending.replace(':pending',':content12:*'),count:100});
    assert.equal(orphans.length,1);
    now+=12*HOUR;
    assert.equal(await kv.get(orphans[0]),null,'unpublished body also expires automatically');
    const bad=markNewTranscript(record('bad'),now);bad.retentionExpiresAt+=HOUR;
    await writeTranscriptQueue(pending,[bad],LEGACY,now);
    assert.equal(await kv.get(pending),null,'malformed expiry cannot extend retention');
    const oldFetch=globalThis.fetch;
    try{
      const sent=[];
      globalThis.fetch=async(_url,options)=>{
        const body=JSON.parse(options.body);sent.push(...(Array.isArray(body[0])?body:[body]));
        return new Response(JSON.stringify(Array.isArray(body[0])?body.map(()=>({result:'OK'})):{result:'OK'}),{headers:{'content-type':'application/json'}});
      };
      const {createClient}=await import('@vercel/kv');
      const client=createClient({url:'https://synthetic-retention.invalid',token:'synthetic-not-a-secret',enableAutoPipelining:false});
      await client.set('synthetic-direct',{value:true},{pxat:now+HOUR});
      await client.pipeline().set('synthetic-pipeline',{value:true},{pxat:now+HOUR}).exec();
      assert.equal(sent.length,2);
      for(const command of sent){const i=command.findIndex(x=>String(x).toLowerCase()==='pxat');assert(i>0&&command[i+1]===now+HOUR,'real SDK must serialize the absolute expiry');}
    }finally{globalThis.fetch=oldFetch;}
    console.log('PASS independent body expiry, mixed legacy inbox, lease/move timing, account isolation and failed publication');
    return 0;
  }finally{kv.set=originalSet;Date.now=originalNow;__resetForTests();}
};
if(require.main===module) module.exports().then(n=>{process.exitCode=n;}).catch(e=>{console.error(e);process.exitCode=1;});
