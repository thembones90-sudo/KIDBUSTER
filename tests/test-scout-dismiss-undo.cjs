'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=async function(){
 const client=fs.readFileSync(path.join(__dirname,'../assets/radar-van-client.js'),'utf8');
 const start=client.indexOf('  function dismissItem('),end=client.indexOf('  function schedule()',start);
 assert(start>0&&end>start);
 const source=client.slice(start,end);
 assert(!source.includes('confirm('),'Scout dismissal never opens a confirmation dialog');
 assert.match(client,/DISMISS_UNDO_MS = 3000/);
 function fixture(result={ok:true,data:{}}){
  let now=0,key='synthetic-A',next=0;
  const timers=new Map(),calls=[],messages=[],renders=[];
  const context={pendingDismiss:Object.create(null),DISMISS_UNDO_MS:3000,state:{gen:0},
   Date:{now:()=>now},savedKey:()=>key,updateDismissCards:()=>{},
   setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id),
   api:async(method,body)=>{calls.push({method,body,key});if(result instanceof Error)throw result;return result;},
   render:data=>renders.push(data),say:message=>messages.push(message)};
  vm.createContext(context);vm.runInContext(source,context);
  return {context,calls,messages,renders,
   switchAccount:()=>{key='synthetic-B';context.state.gen++;},
   advance:async(ms)=>{now+=ms;for(const[id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}await Promise.resolve();await Promise.resolve();}};
 }
 const item={meetingId:'synthetic-lesson'};
 const undo=fixture();undo.context.dismissItem(item);await undo.advance(2999);
 assert.equal(undo.calls.length,0,'no server dismissal before three seconds');
 undo.context.dismissItem(item);await undo.advance(5000);
 assert.equal(undo.calls.length,0,'Undo cancels the delayed server mutation entirely');
 assert.equal(Object.keys(undo.context.pendingDismiss).length,0);
 const commit=fixture();commit.context.dismissItem(item);await commit.advance(3000);
 assert.equal(commit.calls.length,1);assert.equal(commit.calls[0].body.action,'dismiss');
 assert.equal(commit.calls[0].body.meetingId,item.meetingId);assert.equal(commit.renders.length,1);
 await commit.advance(6000);assert.equal(commit.calls.length,1,'timer commits exactly once');
 let finish;const held=fixture(new Promise(resolve=>{finish=resolve;}));
 held.context.dismissItem(item);await held.advance(3000);
 assert.equal(held.context.pendingDismiss[item.meetingId].committing,true);
 held.context.dismissItem(item);held.context.dismissItem(item);
 assert.equal(held.calls.length,1,'repeated clicks while committing never send twice or offer a false Undo');
 finish({ok:true,data:{}});await held.advance(0);await held.advance(0);
 assert.equal(held.renders.length,1);
 const switched=fixture();switched.context.dismissItem(item);switched.switchAccount();await switched.advance(3000);
 assert.equal(switched.calls.length,0,'an account switch must cancel the deferred mutation');
 for(const failure of [{ok:false},new Error('synthetic offline')]){
  const failed=fixture(failure);failed.context.dismissItem(item);await failed.advance(3000);
  assert.equal(failed.renders.length,0,'no successful removal rendered on failure');
  assert.equal(Object.keys(failed.context.pendingDismiss).length,0,'failure restores a retryable Dismiss action');
  assert(failed.messages.length>0);
 }
 const multiple=fixture(),other={meetingId:'other-synthetic-lesson'};
 multiple.context.dismissItem(item);multiple.context.dismissItem(other);multiple.context.dismissItem(item);await multiple.advance(3000);
 assert.equal(multiple.calls.length,1);assert.equal(multiple.calls[0].body.meetingId,other.meetingId,'Undo is scoped to its own lesson');
 console.log('PASS Scout dismissal: 3000ms grace, Undo, exactly-once commit, failures, account isolation and independent lessons');
 return 0;
};
if(require.main===module)module.exports().then(()=>{}).catch(error=>{console.error(error);process.exitCode=1;});
