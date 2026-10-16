'use strict';
// Browser-side half of the matched-transcript lease: the page must confirm a
// transcript to the server only after it was applied or safely stored, and
// must not confirm one it could not handle.
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-krisp-matched-ack-client.cjs ===');
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const start=html.indexOf('  async function handleMatchedImport(record){');
  const endMarker='  // --- Friendly timestamp formatting';
  const end=html.indexOf(endMarker,start);
  check('handler source is present in index.html',start>0&&end>start);
  const source=html.slice(start,end);

  function harness({ready,deferResult,applyThrows=false,key='kb_live_test'}){
    const calls={fetch:[],applied:[],errors:[],deferred:[]};
    const announcedIds={'meeting-1':true};
    const sandbox={
      announcedIds,
      JSON,
      isWorkspaceReadyForAutoImport:()=>ready,
      applyTranscriptWithFullFlow:r=>{if(applyThrows)throw new Error('apply failed');calls.applied.push(r.meetingId);},
      deferMatchedImport:async r=>{calls.deferred.push(r.meetingId);return deferResult;},
      showKrispError:m=>calls.errors.push(m),
      getSavedKey:()=>key,
      fetch:async(url,options)=>{calls.fetch.push({url,options});return {ok:true};}
    };
    vm.createContext(sandbox);
    vm.runInContext(source+'\nthis.settleMatchedImport=settleMatchedImport;this.handleMatchedImport=handleMatchedImport;',sandbox);
    return {sandbox,calls,announcedIds};
  }
  const record={meetingId:'meeting-1',transcript:'text'};

  const ready=harness({ready:true});
  await ready.sandbox.settleMatchedImport(record);
  check('an applied transcript is acknowledged exactly once',ready.calls.applied.length===1&&ready.calls.fetch.length===1);
  const sent=JSON.parse(ready.calls.fetch[0].options.body);
  check('the acknowledgement names the transcript and uses the account key',
    sent.action==='ack-matched'&&sent.meetingId==='meeting-1'&&
    ready.calls.fetch[0].options.method==='POST'&&ready.calls.fetch[0].options.headers['x-app-key']==='kb_live_test'&&
    ready.calls.fetch[0].url==='/api/krisp-session');

  const stored=harness({ready:false,deferResult:true});
  await stored.sandbox.settleMatchedImport(record);
  check('a transcript safely stored for later is acknowledged',stored.calls.deferred.length===1&&stored.calls.fetch.length===1);

  const failed=harness({ready:false,deferResult:false});
  await failed.sandbox.settleMatchedImport(record);
  check('a transcript that could be neither applied nor stored is NOT acknowledged',failed.calls.fetch.length===0);
  check('the user is told what to do',failed.calls.errors.length===1);
  check('it is released for re-announcement so the server offer is not ignored',failed.announcedIds['meeting-1']===undefined);

  const threw=harness({ready:true,applyThrows:true});
  await threw.sandbox.settleMatchedImport(record);
  check('a handler that throws is not acknowledged',threw.calls.fetch.length===0&&threw.announcedIds['meeting-1']===undefined);

  const noKey=harness({ready:true,key:''});
  await noKey.sandbox.settleMatchedImport(record);
  check('without a saved key nothing is sent',noKey.calls.fetch.length===0);

  const offline=harness({ready:true});
  offline.sandbox.fetch=async()=>{throw new Error('offline');};
  let threwOut=false;try{await offline.sandbox.settleMatchedImport(record);}catch{threwOut=true;}
  check('a failed acknowledgement never breaks the page',threwOut===false);

  check('polling and panel start-up use the acknowledging path',
    !/\n\s*handleMatchedImport\(json\.matched\)/.test(html.replace(/\r/g,''))&&
    (html.match(/settleMatchedImport\(json\.matched\)/g)||[]).length===2);
  return getFailures();
};
if(require.main===module){process.env.KIDBUSTER_TEST_KV='1';module.exports().then(n=>process.exit(n?1:0));}
