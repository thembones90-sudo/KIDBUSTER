'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async()=>{
 const owner='synthetic-retention-cutover-owner',HOUR=3600000;
 const names=['KIDBUSTER_TEST_KV','OWNER_LICENSE_KEYS','RADAR_VAN_ENABLED','RADAR_VAN_OWNER_SHA256'];
 const old=Object.fromEntries(names.map(k=>[k,process.env[k]])),realNow=Date.now;
 Object.assign(process.env,{KIDBUSTER_TEST_KV:'1',OWNER_LICENSE_KEYS:owner,RADAR_VAN_ENABLED:'true',RADAR_VAN_OWNER_SHA256:crypto.createHash('sha256').update(owner).digest('hex')});
 let now=1800000000000;Date.now=()=>now;
 try{
  const {kv,__resetForTests}=await import('../api/_lib/kv-client.js');__resetForTests();
  const rv=await import('../api/_lib/radar-van.js');
  const session=(await import('../api/krisp-session.js')).default;
  const webhook=(await import('../api/krisp-webhook.js')).default;
  const {readImportQueue,writeImportQueue}=await import('../api/_lib/krisp-retention.js');
  const response=()=>({code:200,status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
  const sessionCall=async(action,id)=>{
   const out=response();await session({method:action?'POST':'GET',headers:{'x-app-key':owner,host:'synthetic.example'},body:{action,meetingId:id},query:{}},out);return out;
  };
  const info=await sessionCall(),krispToken=new URL(info.body.webhookUrl).searchParams.get('token');
  assert.equal(info.body.newTranscriptRetentionHours,12);
  const prefix='krisp:data:'+owner+':',scoutPrefix='rv:data:'+owner+':';
  await writeImportQueue(prefix+'pending',[{meetingId:'old-krisp',receivedAt:new Date(now-13*HOUR).toISOString(),transcript:'Existing Krisp content'}]);
  await kv.set(scoutPrefix+'pending',[{meetingId:'old-scout',receivedAt:new Date(now-13*HOUR).toISOString(),transcript:'Existing Scout content'}]);
  const deliver=async(id)=>{
   const out=response();await webhook({method:'POST',query:{token:krispToken},body:{id:'event-'+id,data:{meeting:{id:'meeting-'+id,title:'Synthetic lesson'},raw_content:'Synthetic transcript '+id}}},out);return out;
  };
  const token=await rv.issueRadarToken(owner,{automatic:true}),hash=rv.hashRadarToken(token);
  const lesson=n=>({version:1,lessonId:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),title:'Synthetic lesson',startedAt:new Date(now-HOUR).toISOString(),durationSeconds:900,transcript:'[00:00] TEACHER: Synthetic lesson\n[00:02] STUDENT: Hello'});
  const first=lesson(1);
  assert.equal((await deliver('first')).body.stored,true);
  assert.equal((await rv.ingestRadarLesson(owner,first,hash)).duplicate,false);
  const krispIndex=await kv.get(prefix+'pending'),scoutIndex=await kv.get(scoutPrefix+'matched');
  const k=krispIndex.find(x=>x.meetingId==='meeting-first'),s=scoutIndex[0];
  for(const record of [k,s]){
   assert.equal(record.retentionVersion,1);assert.equal(record.retentionExpiresAt,now+12*HOUR);
   assert.equal(record.transcript,undefined);assert.equal(record.title,undefined);
   assert.ok((await kv.get(record.contentRef)).transcript);
  }
  const view=await rv.readRadarSession(owner);
  assert.equal(view.newTranscriptRetentionHours,12);assert.equal(view.inboxPending.find(x=>x.meetingId===s.meetingId).retentionExpiresAt,s.retentionExpiresAt);
  now+=HOUR;
  assert.equal((await deliver('first')).body.stored,false);
  assert.equal((await rv.ingestRadarLesson(owner,first,hash)).duplicate,true);
  await deliver('second');await rv.ingestRadarLesson(owner,lesson(2),hash);
  now=k.retentionExpiresAt;
  // No inbox read/pruning is needed for physical content expiry.
  assert.equal(await kv.get(k.contentRef),null);assert.equal(await kv.get(s.contentRef),null);
  assert.equal((await deliver('first')).body.stored,false,'content-free dedupe receipt outlives text');
  assert.equal((await rv.ingestRadarLesson(owner,first,hash)).duplicate,true);
  assert.deepEqual((await readImportQueue(prefix+'pending')).map(x=>x.meetingId),['meeting-second','old-krisp']);
  // Old Scout has its original 24h lifetime and is now 25h old; seed another
  // pre-cutover item younger than 24h to establish unchanged reader behavior.
  await kv.set(scoutPrefix+'pending',[{meetingId:'old-scout-live',receivedAt:new Date(now-13*HOUR).toISOString(),transcript:'Existing Scout preserved'}]);
  assert.ok((await rv.readRadarSession(owner)).inboxPending.some(x=>x.meetingId==='old-scout-live'));
  const secondK=(await kv.get(prefix+'pending')).find(x=>x.meetingId==='meeting-second');
  assert.equal((await sessionCall('dismiss','meeting-second')).code,200);
  assert.equal(await kv.get(secondK.contentRef),null,'dismiss deletes consumed body immediately');
  const secondS=(await kv.get(scoutPrefix+'matched')).find(x=>x.lessonId===lesson(2).lessonId);
  await rv.radarInboxAction(owner,'ack-matched',secondS.meetingId);
  assert.equal(await kv.get(secondS.contentRef),null,'Scout ACK deletes only the completed body');
  await deliver('cleanup-failure');
  const orphan=(await kv.get(prefix+'pending')).find(x=>x.meetingId==='meeting-cleanup-failure');
  const realDel=kv.del;
  try{
   kv.del=async(key,...rest)=>{if(key===orphan.contentRef)throw new Error('Synthetic cleanup outage');return realDel.call(kv,key,...rest);};
   assert.equal((await sessionCall('dismiss','meeting-cleanup-failure')).code,200,'cleanup outage cannot reverse committed dismissal');
  }finally{kv.del=realDel;}
  assert.ok(await kv.get(orphan.contentRef),'failed cleanup leaves only bounded orphan');
  now=orphan.retentionExpiresAt;
  assert.equal(await kv.get(orphan.contentRef),null,'cleanup outage cannot bypass absolute expiry');
  assert.equal((await rv.readRadarSettings(owner)).tokenHash,hash,'retention never expires connection settings');
  console.log('PASS cutover: real Krisp/Scout ingestion, 12h storage expiry, later arrivals, dedupe, legacy policy, consumption and connection continuity');
  return 0;
 }finally{Date.now=realNow;for(const n of names){if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n];}}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});

