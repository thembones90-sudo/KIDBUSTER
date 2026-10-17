'use strict';
// Customer Journey Regression Suite (release gate, 2026-10-17 audit).
// Drives the real page in Chrome against a small stateful backend that
// mirrors the production API contract: one-time email links, Free monthly
// Classic allowance, one-time protocol trials, throttling and entitlement
// rejections. It checks what a brand-new teacher actually sees.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createChecker}=require('./helpers/assert.cjs');
const puppeteer=require('puppeteer');

const KEY='kb_live_journey_teacher_0001';
const GOOD_TOKEN='journey-valid-token-0123456789abcdef';

function makeBackend(){
 const st={tokens:new Set([GOOD_TOKEN]),used:0,trials:{MS:0,FAIRY:0,BLITZ:0,BEIDA:0,OF:0,PREPLY:0},
  generateCalls:[],forceNext:null};
 const status=()=>({status:'active',plan:'free',expired:false,email:'new.teacher@example.test',usagePeriod:'2026-10',
  usageCount:st.used,freeMonthlyLimit:5,remainingFreeReports:5-st.used,
  trials:Object.fromEntries(Object.entries(st.trials).map(([k,v])=>[k,{trialLimit:5,trialUsageCount:v,remainingTrialGenerations:5-v}]))});
 const handle=(req,body,res)=>{
  const send=(code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
  const url=req.url.split('?')[0];
  if(url==='/api/license-verify'){
   const t=body&&body.token;
   if(st.tokens.has(t)){st.tokens.delete(t);return send(200,{licenseKey:KEY,plan:'free'});}
   return send(400,{error:'This secure link is invalid or has expired. Request a new one.'});
  }
  if(url==='/api/license-status'){
   if(req.headers['x-app-key']!==KEY)return send(401,{error:'Invalid license key.'});
   return send(200,status());
  }
  if(url==='/api/generate'){
   if(req.headers['x-app-key']!==KEY)return send(401,{error:'Invalid license key.',reason:'invalid_key'});
   const g=body.generation||{};
   st.generateCalls.push(g);
   if(st.forceNext){const f=st.forceNext;st.forceNext=null;return send(f.code,f.body);}
   if(g.protocol==='MA'){
    if(st.used>=5)return send(402,{error:'You\'ve used all 5 free reports this month. Upgrade to Pro for unlimited reports and every protocol.',reason:'limit_reached'});
    st.used++;
   }else{
    if(st.trials[g.protocol]>=5)return send(402,{error:'Your complimentary trial has ended.',reason:'trial_exhausted'});
    st.trials[g.protocol]++;
   }
   const text='Hi '+g.studentName+'!\n\nGreat work today.\n\nCheers,\nTeacher '+g.teacherName;
   return send(200,{text,usage:null,trialStatus:null,generationRef:'0123456789abcdef'});
  }
  if(url==='/api/krisp-session')return send(403,{error:'Krisp is a Pro feature.'});
  return send(404,{});
 };
 return {st,handle};
}

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-customer-journey.cjs ===');
 const root=path.resolve(__dirname,'..');
 const be=makeBackend();
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){
   let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{let b={};try{b=JSON.parse(raw||'{}')}catch{}be.handle(req,b,res);});
   return;
  }
  const pathname=decodeURIComponent((req.url||'/').split('?')[0]);
  const filename=path.resolve(root,pathname==='/'?'index.html':pathname.slice(1));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(err,contents)=>{
   if(err){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'Content-Type':/\.css$/.test(filename)?'text/css':/\.js$/.test(filename)?'application/javascript':'text/html'});
   res.end(contents);
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const executablePath=['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(s=>fs.existsSync(s));
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 let browser;
 try{
  browser=await puppeteer.launch({headless:'new',args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
  const ctx=await browser.createBrowserContext();
  const page=await ctx.newPage();
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.setViewport({width:1440,height:900});
  const out=()=>page.evaluate(()=>({text:document.getElementById('outputBox').textContent.replace(/\s+/g,' ').trim(),cls:document.getElementById('outputBox').className}));
  const fill=async({teacher,student,notes='Teacher: Read the story with me. Student: The puppy is sad because he lost his mom. We practised river, forest and bridge.',protocol='MA',rating='4',gender}={})=>{
   await page.evaluate(({teacher,student,notes,protocol,rating,gender})=>{
    const set=(id,v)=>{const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));};
    document.querySelector('input[name="protocol"][value="'+protocol+'"]').click();
    if(teacher!==undefined)set('teacherName',teacher);
    if(student!==undefined)set('studentName',student);
    set('krispNotes',notes);
    if(rating){const b=[...document.querySelectorAll('#ratingTrack button, #ratingTrack [data-value]')].find(x=>(x.dataset.value||x.textContent.trim())===rating||x.textContent.trim()===rating);b&&b.click();}
    if(gender){const g=document.querySelector('input[name="studentGender"][value="'+gender+'"]');g&&g.click();}
   },{teacher,student,notes,protocol,rating,gender});
  };
  const generate=async()=>{await page.click('#generateBtn');for(let i=0;i<40;i++){await sleep(150);if(!(await page.evaluate(()=>document.getElementById('generateBtn').disabled)))break;}await sleep(200);};
  const account=async()=>{await page.click('#accountBtn');await sleep(600);const a=await page.evaluate(()=>({plan:accountPlan.textContent.trim(),status:accountStatus.textContent.trim(),usage:accountUsage.textContent.trim(),trials:accountTrials.textContent.replace(/\s+/g,' ')}));await page.click('#accountBtn');return a;};

  console.log('\n1) brand-new visitor');
  await page.goto(origin+'/',{waitUntil:'networkidle0'});
  const fresh=await page.evaluate(()=>({teacher:document.getElementById('teacherName').value,key:localStorage.getItem('kidbuster_access_key')}));
  check('a new teacher is not pre-filled as another teacher ("Layne")',fresh.teacher==='');
  check('no access key exists before signing in',fresh.key===null);

  console.log('\n2) email link signs the teacher in and leaves no token behind');
  await page.goto(origin+'/?access_token='+GOOD_TOKEN,{waitUntil:'networkidle0'});await sleep(400);
  const verified=await page.evaluate(()=>({url:location.href,key:localStorage.getItem('kidbuster_access_key'),out:document.getElementById('outputBox').textContent}));
  check('verification stores the account on this browser',verified.key===KEY);
  check('the one-time token is removed from the address bar',!/access_token/.test(verified.url));
  check('the teacher is told the email was verified',/Email verified/.test(verified.out));
  await page.reload({waitUntil:'networkidle0'});await sleep(300);
  let acc=await account();
  check('after a refresh the account still shows Free and Active',acc.plan==='Free'&&acc.status==='Active');
  check('usage starts at 0 of 5',/0 used/.test(acc.usage)&&/5 left/.test(acc.usage));

  console.log('\n3) form validation names the missing field and never calls the API');
  be.st.generateCalls.length=0;
  await fill({teacher:'',student:'Mia'});await generate();
  let o=await out();
  check('missing teacher name is explained in plain words',/Add your name in the Teacher field/.test(o.text)&&/error/.test(o.cls));
  check('focus moves to the Teacher field',await page.evaluate(()=>document.activeElement&&document.activeElement.id==='teacherName'));
  await fill({teacher:'Ana',student:''});await generate();
  o=await out();
  check('missing student name is explained in plain words (no server jargon)',/Add the student's name/.test(o.text)&&!/Invalid generation request/.test(o.text));
  await fill({teacher:'Ana',student:'Mia',notes:''});await generate();
  check('empty notes are explained',/Add the Krisp notes|Add a few quick notes/.test((await out()).text));
  check('no request reached the server while the form was incomplete',be.st.generateCalls.length===0);

  console.log('\n4) a successful Classic report, signed by this teacher');
  await fill({teacher:'Ana',student:'Mia'});await generate();
  o=await out();
  check('the report is displayed',/Hi Mia!/.test(o.text)&&!/error/.test(o.cls));
  check('the report is signed with the teacher\'s own name',/Teacher Ana/.test(o.text)&&!/Layne/.test(o.text));
  check('the request carried the typed teacher name',be.st.generateCalls.at(-1).teacherName==='Ana');
  acc=await account();
  check('account usage shows 1 used after one report',/1 used/.test(acc.usage));
  await page.reload({waitUntil:'networkidle0'});await sleep(300);
  check('the teacher name is remembered after a refresh',await page.evaluate(()=>document.getElementById('teacherName').value)==='Ana');

  console.log('\n5) Free Classic limit and protocol trial messages');
  be.st.used=5;
  await fill({teacher:'Ana',student:'Mia'});await generate();
  o=await out();
  check('Classic limit says it is the monthly free limit',/Free monthly limit reached/.test(o.text));
  check('Classic limit says when reports come back and that trials still work',/1st of next month/.test(o.text)&&/trials/.test(o.text));
  check('Classic limit offers an Upgrade button',await page.evaluate(()=>!!document.getElementById('inlineUpgradeBtn')));
  be.st.trials.FAIRY=5;
  await fill({teacher:'Ana',student:'Mia',protocol:'FAIRY'});await generate();
  o=await out();
  check('an exhausted trial names the protocol',/Fairy trial used up/i.test(o.text));
  check('an exhausted trial says Classic still works',/Classic still works/.test(o.text));
  be.st.trials.FAIRY=0;be.st.used=1;

  console.log('\n6) server problems read as plain language');
  for(const [code,body,expect,label] of [
   [429,{error:'Too many reports requested too quickly. Wait a minute and try again. Your lesson notes are safe.',reason:'rate_limited'},/Wait a minute/,'rate limit keeps the server\'s teacher-facing text'],
   [503,{error:'x',reason:'busy'},/Pathfinder is busy right now/,'a busy service is not called "the API"'],
   [500,{error:'Could not verify your license right now.'},/Something went wrong on our side/,'a server error has no status codes'],
   [400,{error:'Invalid generation request: notes is too long'},/lesson notes are too long/,'overlong notes get a specific instruction']
  ]){
   be.st.forceNext={code,body};
   await fill({teacher:'Ana',student:'Mia'});await generate();
   o=await out();
   check(label,expect.test(o.text)&&!/\((4|5)\d\d\)|API|Invalid generation request/.test(o.text));
  }
  check('typed notes survive a failed generation',(await page.evaluate(()=>document.getElementById('krispNotes').value)).length>20);

  console.log('\n7) reopening a used email link');
  await page.goto(origin+'/?access_token='+GOOD_TOKEN,{waitUntil:'networkidle0'});await sleep(800);
  o=await out();
  check('a signed-in teacher sees a calm "already active" notice, not an error',/already active/.test(o.text)&&!/error/.test(o.cls));
  check('the account is kept',await page.evaluate(()=>localStorage.getItem('kidbuster_access_key'))===KEY);
  const other=await (await browser.createBrowserContext()).newPage();
  await other.goto(origin+'/?access_token=not-a-real-token-but-long-enough',{waitUntil:'networkidle0'});await sleep(800);
  const otherState=await other.evaluate(()=>({key:localStorage.getItem('kidbuster_access_key'),text:document.getElementById('outputBox').textContent}));
  check('an invalid link on a browser with no account grants nothing',otherState.key===null);
  check('it tells the teacher to request a new link',/Request a new one|request a new/i.test(otherState.text));
  check('no page errors during the journey',pageErrors.length===0);
  if(pageErrors.length)console.log('   page errors:',pageErrors.slice(0,3));
 }finally{
  if(browser)await browser.close();
  server.close();
 }
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0));
