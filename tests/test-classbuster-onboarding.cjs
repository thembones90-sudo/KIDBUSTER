'use strict';
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const puppeteer=require('puppeteer');
const {createChecker}=require('./helpers/assert.cjs');
const root=path.resolve(__dirname,'..');
const sha='abcdef0123456789'.repeat(4);
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 const validator=fs.readFileSync(path.join(root,'assets/scout-release-validator.js'),'utf8');
 const vm=require('node:vm');
 const context={window:{},URL};
 vm.runInNewContext(validator,context);
 const valid={available:true,platform:'Windows',version:'1.0.0',sha256:sha,
  downloadUrl:'https://github.com/thembones90-sudo/classbuster-scout/releases/download/v1.0.0/ScoutSetup.exe'};
 check('valid verified Scout installer passes strict shared validation',!!context.window.validateScoutRelease(valid));
 for(const [name,url] of Object.entries({
   'credentials':'https://user:pass@github.com/thembones90-sudo/classbuster-scout/releases/download/v1.0.0/Scout.exe',
   'query string':valid.downloadUrl+'?token=private',
   'fragment':valid.downloadUrl+'#bad',
   'wrong host':'https://evil.example/Scout.exe',
   'insecure':'http://github.com/thembones90-sudo/repo/releases/download/v1/Scout.exe',
   'noninstaller':valid.downloadUrl.replace('.exe','.zip')
 })){
   check('Scout validator blocks '+name,!context.window.validateScoutRelease({...valid,downloadUrl:url}));
 }
 const records=new Map();let manifest={available:false};let verifiedKey='NEW-A';
 const server=http.createServer((req,res)=>{
   const send=(code,obj)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(obj));};
   const u=new URL(req.url,'http://localhost');
   if(u.pathname==='/api/license-verify'&&req.method==='POST')return send(200,{licenseKey:verifiedKey});
   if(u.pathname==='/api/license-status'){
     const key=req.headers['x-app-key'];
     if(!key)return send(401,{error:'Unauthorized'});
     if(req.method==='POST'){
       let data='';req.on('data',part=>data+=part);req.on('end',()=>{
         if(!req.headers['x-installation-id'])return send(401,{error:'Installation required'});
         if(key.startsWith('LEGACY')||key==='OWNER')return send(403,{error:'Not eligible'});
         let payload;try{payload=JSON.parse(data);}catch{return send(400,{error:'Invalid JSON'});}
         if(!['completed','skipped'].includes(payload.state))return send(400,{error:'Invalid state'});
         records.set(key,{state:payload.state});return send(200,{onboarding:records.get(key)});
       });return;
     }
     if(req.method==='GET'){
       const legacy=key.startsWith('LEGACY')||key==='OWNER';
       const state=records.get(key)||null;
       return send(200,{status:'active',plan:'free',founder:key==='OWNER',
         onboardingEligible:!legacy,onboarding:state,onboardingState:state?'known':'never',
         usageCount:0,freeMonthlyLimit:5,remainingFreeReports:5,trials:{}});
     }
   }
   if(u.pathname==='/assets/scout-release.json')return send(200,manifest);
   const target=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));
   if(!target.startsWith(root+path.sep))return send(403,{error:'Forbidden'});
   fs.readFile(target,(err,buffer)=>{
     if(err)return send(404,{error:'Not found'});
     const ext=path.extname(target);
     res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.js'?'application/javascript':ext==='.css'?'text/css':'application/octet-stream');
     res.end(buffer);
   });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/';
 let browser;
 try {
   const browserPath=process.env.PUPPETEER_EXECUTABLE_PATH||[
     'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
     'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
   ].find(candidate=>fs.existsSync(candidate));
   browser=await puppeteer.launch({headless:true,executablePath:browserPath,args:['--no-sandbox','--force-dark-mode']});
   const page=await browser.newPage();
   await page.setViewport({width:1440,height:900});
   await page.goto(url+'?access_token=fresh',{waitUntil:'load'});
   await page.waitForFunction(()=>!document.getElementById('classbusterOnboardingOverlay').hidden,{timeout:12000});
   check('new account starts onboarding immediately after email verification',await page.$eval('#cbOnboardingTitle',el=>el.textContent==='Welcome to Classbuster'));
   check('Skip introduction is clearly available',await page.$eval('#cbOnboardingSkip',el=>!el.hidden));
   await page.click('#cbOnboardingNext');
   check('Step two describes first report',await page.$eval('#cbOnboardingTitle',el=>el.textContent==='Your first report'));
   check('new step receives keyboard/screen-reader focus',await page.$eval('#cbOnboardingTitle',el=>document.activeElement===el));
   check('background scrolling locks while onboarding is open',await page.$eval('body',el=>getComputedStyle(el).overflow==='hidden'));
   await page.click('#cbExampleToggle');
   check('example notes can be shown on demand',await page.$eval('#cbExampleNotes',el=>!el.hidden));
   await page.click('#cbOnboardingNext');
   check('Scout is optional and skip is visible',await page.$eval('#cbTourSkipScout',el=>!!el&&getComputedStyle(el).display!=='none'));
   check('unreleased installer cannot be clicked',await page.$eval('#cbTourInstallScout',el=>el.disabled));
   await page.click('#cbTourAboutScout');
   check('Scout information dialog opens',await page.$eval('#classbusterScoutOverlay',el=>!el.hidden));
   await page.keyboard.press('Escape');
   check('Escape closes only Scout, not onboarding',await page.evaluate(()=>{
      return document.getElementById('classbusterScoutOverlay').hidden &&
        !document.getElementById('classbusterOnboardingOverlay').hidden;
   }));
   await page.click('#cbTourSkipScout');
   check('skipping Scout reaches final screen',await page.$eval('#cbOnboardingTitle',el=>el.textContent==="You're ready"));
   await page.click('#cbOnboardingNext');
   await page.waitForFunction(()=>document.getElementById('classbusterOnboardingOverlay').hidden);
   await new Promise(resolve=>setTimeout(resolve,200));
   check('onboarding completion saved for exact account',records.get('NEW-A')?.state==='completed');
   check('Scout remains available from workspace',await page.$eval('#cbScoutOpenWorkspace',el=>!!el&&!el.hidden));
   await page.click('#cbScoutOpenWorkspace');
   check('permanent Scout entry opens information panel',await page.$eval('#classbusterScoutOverlay',el=>!el.hidden));
   await page.click('#cbScoutCloseAction');
   await page.reload({waitUntil:'load'});
   await new Promise(resolve=>setTimeout(resolve,300));
   check('completed account does not restart on refresh',await page.$eval('#classbusterOnboardingOverlay',el=>el.hidden));
   await page.click('#helpBtn');
   check('Help replays onboarding',await page.$eval('#classbusterOnboardingOverlay',el=>!el.hidden));
   check('Help does not open conflicting legacy dialog',await page.$eval('#helpModalOverlay',el=>getComputedStyle(el).display==='none'));
   await page.click('#cbOnboardingSkip');
   check('replay does not alter completed server record',records.get('NEW-A')?.state==='completed');
   await page.evaluate(()=>{localStorage.setItem('kidbuster_access_key','LEGACY-1');document.dispatchEvent(new CustomEvent('kidbuster:access-key-saved'));});
   await new Promise(resolve=>setTimeout(resolve,300));
   check('legacy account does not get automatic tour',await page.$eval('#classbusterOnboardingOverlay',el=>el.hidden));
   await page.evaluate(()=>{localStorage.setItem('kidbuster_access_key','NEW-B');document.dispatchEvent(new CustomEvent('kidbuster:access-key-saved'));});
   await page.waitForFunction(()=>!document.getElementById('classbusterOnboardingOverlay').hidden,{timeout:7000});
   check('switch to a new uncompleted account triggers its own tour',await page.$eval('#classbusterOnboardingOverlay',el=>!el.hidden));
   await page.click('#cbOnboardingSkip');
   await new Promise(resolve=>setTimeout(resolve,150));
   check('Skip saves only the second account',records.get('NEW-B')?.state==='skipped'&&records.get('NEW-A')?.state==='completed');
   for(const width of [390,1150,1280,1440]){
     await page.setViewport({width,height:900});
     await page.click('#helpBtn');
     const ok=await page.evaluate(()=>{
       const modal=document.querySelector('#classbusterOnboardingOverlay .cb-onboarding-dialog').getBoundingClientRect();
       return modal.left>=0 && modal.right<=innerWidth+1;
     });
     check('tour fits '+width+'px viewport',ok);
     await page.click('#cbOnboardingSkip');
   }
   manifest=valid;
   await page.click('#cbScoutOpenWorkspace');
   await page.waitForFunction(()=>!document.getElementById('cbScoutDownload').hidden,{timeout:6000});
   check('approved manifest reveals a genuine Windows download link',await page.$eval('#cbScoutDownload',el=>el.href.includes('/ScoutSetup.exe')));
   await page.click('#cbScoutCloseAction');
 }finally{
   if(browser)await browser.close();
   await new Promise(resolve=>server.close(resolve));
 }
 return getFailures();
};
