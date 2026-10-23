'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const puppeteer=require('puppeteer');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 process.env.KIDBUSTER_TEST_KV='1';process.env.KIDBUSTER_TEST_EMAIL='1';
 const {kv,__resetForTests,__simulateOutage}=await import('../api/_lib/kv-client.js');
 const service=await import('../api/_lib/license-service.js');
 const licensing=await import('../api/_lib/licensing.js');
 const onboarding=await import('../api/_lib/onboarding.js');
 const verification=await import('../api/_lib/account-verification.js');
 const status=(await import('../api/license-status.js')).default;
 const verify=(await import('../api/license-verify.js')).default;
 const signup=(await import('../api/license-signup.js')).default;
 const email=await import('../api/_lib/email-service.js');
 __resetForTests();email.__resetTestMessages();
 async function send(handler,method,key,body={}){
  let code,data;const res={setHeader(){},status(n){code=n;return this;},json(d){data=d;return this;}};
  await handler({method,headers:{'x-app-key':key,'x-installation-id':'onboarding-test','x-forwarded-for':'192.0.2.22'},body},res);return {code,data};
 }
 const legacy='legacy-onboarding-test';
 await licensing.saveLicense(legacy,{email:'legacy@example.test',plan:'free',status:'active',createdAt:new Date().toISOString()});
 await licensing.saveEmailIndex('legacy@example.test',legacy);
 check('missing metadata does not classify even a recently created existing customer as new',!(await send(status,'GET',legacy)).data.onboarding.eligible);
 check('unauthenticated onboarding write is rejected',(await send(status,'POST',null,{action:'onboarding',state:'completed'})).code===401);
 await send(signup,'POST',null,{email:'new.onboarding@example.test'});
 check('registration has no account before verification',await licensing.getLicenseKeyByEmail('new.onboarding@example.test')===null);
 const token=new URL(email.__getTestMessages().at(-1).verificationUrl).searchParams.get('access_token');
 const registration=await send(verify,'POST',null,{token});const freeKey=registration.data.licenseKey;
 check('verified Free registration is explicitly eligible',(await send(status,'GET',freeKey)).data.onboarding.state==='pending');
 const recoveryToken=await verification.createVerificationToken({email:'legacy@example.test',intent:'signup'});
 const recovery=await send(verify,'POST',null,{token:recoveryToken.token});
 check('existing account signup/recovery is not enrolled',recovery.data.licenseKey===legacy&&!(await send(status,'GET',legacy)).data.onboarding.eligible);
 const proKey=await service.activateOrRenewPro({email:'new.pro.onboarding@example.test',paymentCustomerId:'synthetic-onboarding-customer',paymentSubscriptionId:'synthetic-onboarding-subscription'});
 check('new Pro account is eligible after activation',(await send(status,'GET',proKey)).data.onboarding.state==='pending');
 check('existing Pro upgrade stays exempt',await service.activateOrRenewPro({licenseKey:legacy,email:'legacy@example.test',paymentCustomerId:'synthetic-legacy',paymentSubscriptionId:'synthetic-legacy-sub'})===legacy&&!(await send(status,'GET',legacy)).data.onboarding.eligible);
 const manual=await service.createManualProLicense({email:'manual-onboarding@example.test'});
 check('manual inventory is not eligible before activation',!(await onboarding.readOnboarding(manual.licenseKey,await licensing.getLicense(manual.licenseKey))).eligible);
 check('first manual activation enrolls only a newly issued account',(await send(status,'GET',manual.licenseKey)).data.onboarding.state==='pending');
 check('invalid state cannot be saved',(await send(status,'POST',freeKey,{action:'onboarding',state:'pending'})).code===400);
 const before=await licensing.getLicense(freeKey);
 await Promise.all(['completed','skipped'].map(state=>send(status,'POST',freeKey,{action:'onboarding',state})));
 const finished=(await send(status,'GET',freeKey)).data.onboarding;
 check('concurrent completions are immutable and idempotent',['completed','skipped'].includes(finished.state));
 check('completion never rewrites account/payment fields',JSON.stringify(before)===JSON.stringify(await licensing.getLicense(freeKey)));
 await service.activateOrRenewPro({licenseKey:freeKey,paymentCustomerId:'synthetic-upgrade',paymentSubscriptionId:'synthetic-upgrade-sub'});
 check('upgrade preserves stable account completion',(await send(status,'GET',freeKey)).data.onboarding.state===finished.state);
 __simulateOutage(true);
 check('guide storage outage returns a nonblocking unavailable state',(await onboarding.readOnboarding(proKey,{onboardingVersion:1,status:'active'})).state==='unavailable');
 check('failed completion is explicitly retryable',(await onboarding.finishOnboarding(proKey,{onboardingVersion:1,status:'active'},'completed')).status===503);
 __simulateOutage(false);
 const root=path.resolve(__dirname,'..'),shots=path.join(root,'.v2-local/onboarding/screenshots');fs.mkdirSync(shots,{recursive:true});
 let released=false,failSaves=false,writeCount=0;
 const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){
   let raw='';for await(const chunk of req)raw+=chunk;let body={};try{body=JSON.parse(raw||'{}');}catch{}
   const reply={setHeader:(...a)=>res.setHeader(...a),status(n){res.statusCode=n;return this;},json(d){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d));return this;}};
   if(pathname==='/api/license-status'){
    if(req.method==='POST'){writeCount++;if(failSaves)return reply.status(503).json({error:'Synthetic outage'});}
    req.body=body;return status(req,reply);
   }
   if(pathname==='/api/license-verify'){req.body=body;return verify(req,reply);}
   return reply.status(403).json({error:'Synthetic test: integration unavailable'});
  }
  if(pathname==='/assets/scout-release.json'){
   res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(released?{available:true,platform:'Windows',version:'1.2.3',sha256:'a'.repeat(64),downloadUrl:'https://classbuster.com/downloads/ScoutSetup.exe'}:{available:false}));
  }
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  fs.readFile(target,(err,bytes)=>{if(err){res.statusCode=404;return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'})[path.extname(target)]||'application/octet-stream');res.end(bytes);});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await puppeteer.launch({headless:true});
  const entryContext=await browser.createBrowserContext();const entryPage=await entryContext.newPage();
  await entryPage.goto(base,{waitUntil:'networkidle0'});
  check('new visitor sees Start here immediately',await entryPage.$eval('#helpBtn',e=>e.textContent==='New here? Start here'));
  async function hasGoldEntry(page){return page.$eval('#helpBtn',e=>{const button=getComputedStyle(e),icon=getComputedStyle(e,'::before');return button.backgroundImage.includes('rgb(218, 154, 57)')&&button.color==='rgb(40, 25, 4)'&&icon.content.includes('→')&&icon.backgroundColor==='rgb(84, 55, 18)';});}
  check('first-time entry restores gold gradient, dark text and round arrow',await hasGoldEntry(entryPage));
  check('Scout entry uses its existing compass emblem and internal-navigation chevron',await entryPage.$eval('#scoutWorkspaceBtn',e=>{const img=e.querySelector('img');return img?.complete&&img.naturalWidth>0&&img.getAttribute('alt')===''&&img.src.endsWith('/assets/icons/scout-compass-48.png')&&!!e.querySelector('svg.scout-entry-chevron[aria-hidden="true"]')&&e.textContent==='Meet Scout'&&e.getAttribute('aria-haspopup')==='dialog';}));
  await entryPage.evaluate(()=>document.documentElement.dataset.appearance='dark');
  await entryPage.waitForFunction(()=>getComputedStyle(document.querySelector('#scoutWorkspaceBtn')).color==='rgb(237, 241, 245)');
  check('Scout entry has an independent granite surface and readable light label',await entryPage.$eval('#scoutWorkspaceBtn',e=>{const s=getComputedStyle(e);return s.backgroundImage.includes('rgb(48, 53, 59)')&&s.color==='rgb(237, 241, 245)'&&['flex','inline-flex'].includes(s.display);}));
  await entryPage.hover('#scoutWorkspaceBtn');
  await entryPage.waitForFunction(()=>getComputedStyle(document.querySelector('#scoutWorkspaceBtn')).borderTopColor==='rgba(135, 243, 22, 0.44)');
  check('Scout hover has a restrained green glow',await entryPage.$eval('#scoutWorkspaceBtn',e=>getComputedStyle(e).boxShadow.includes('135, 243, 22')));
  await entryPage.mouse.move(0,0);
  const writesBeforeDiscovery=writeCount;
  await entryPage.click('#helpBtn');
  check('header opens four-stage onboarding directly, without another menu',await entryPage.$eval('#cbTourTitle',e=>e.textContent==='Welcome to Classbuster')&&await entryPage.$eval('#helpModalOverlay',e=>getComputedStyle(e).display==='none'));
  await entryPage.click('[data-next]');
  check('report step explains separate five-report trials and monthly Classic allowance',await entryPage.$eval('.cb-trial-note',e=>e.textContent.includes('5 Classic reports every month')&&e.textContent.includes('each other style with 5 free reports')&&e.querySelector('.cb-trial-detail').textContent.includes('one-time allowances, separate for each style')));
  await entryPage.keyboard.press('Escape');
  check('dismissed manual introduction becomes Help without an account write',writeCount===writesBeforeDiscovery&&await entryPage.$eval('#helpBtn',e=>e.textContent==='Help & guide'));
  await entryPage.mouse.move(0,0);
  check('returning Help remains prominent gold instead of granite',await hasGoldEntry(entryPage));
  await entryPage.evaluate(()=>document.documentElement.dataset.appearance='light');
  check('light skin keeps the same gold discovery button',await hasGoldEntry(entryPage));
  check('light skin gives Scout a defined silver surface and dark label',await entryPage.$eval('#scoutWorkspaceBtn',e=>{const s=getComputedStyle(e);return s.backgroundImage.includes('rgb(237, 240, 243)')&&s.color==='rgb(41, 50, 58)';}));
  await entryPage.reload({waitUntil:'networkidle0'});
  check('visitor Help label persists after reload',await entryPage.$eval('#helpBtn',e=>e.textContent==='Help & guide'));
  await entryPage.evaluate(key=>{localStorage.setItem('kidbuster_access_key',key);return refreshAccountPanel();},legacy);
  check('existing returning account retains Help without forced onboarding',await entryPage.$eval('#helpBtn',e=>e.textContent==='Help & guide')&&await entryPage.$eval('#cbOnboardingOverlay',e=>e.hidden));
  const context=await browser.createBrowserContext();const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const browserKey=await service.getOrCreateFreeLicense('browser-onboarding@example.test');
  await page.evaluateOnNewDocument(key=>{localStorage.setItem('kidbuster_access_key',key);localStorage.setItem('pathfinder_appearance_v1','dark');},browserKey);
  await page.goto(base,{waitUntil:'networkidle0'});
  await page.waitForSelector('#cbOnboardingOverlay:not([hidden])');
  check('first-time authenticated account automatically sees welcome',await page.$eval('#cbTourTitle',e=>e.textContent==='Welcome to Classbuster'));
  const skin=await page.evaluate(()=>{
   const panel=getComputedStyle(document.querySelector('.cb-tour'));
   const button=getComputedStyle(document.querySelector('.cb-tour .cb-primary'));
   return {surface:panel.backgroundImage,border:panel.borderTopColor,accent:panel.getPropertyValue('--cb-green').trim(),button:button.backgroundImage,text:button.color,icons:!!document.querySelector('.cb-hero>span>svg')};
  });
  check('premium onboarding uses neutral granite, not an olive-green surface',skin.surface.includes('rgb(50, 54, 61)')&&skin.surface.includes('rgb(35, 38, 44)')&&skin.border==='rgb(72, 78, 88)');
  check('primary buttons use the actual Classbuster bright green with dark text',skin.accent==='#87f316'&&skin.button.includes('rgb(135, 243, 22)')&&skin.text==='rgb(20, 32, 8)');
  check('welcome illustration uses a consistent code-native line icon',skin.icons);
  await page.evaluate(()=>document.body.classList.add('protocol-ms'));
  check('onboarding brand green does not turn pink with Sugarcoat',await page.$eval('.cb-tour',e=>getComputedStyle(e).getPropertyValue('--cb-green').trim()==='#87f316'));
  await page.evaluate(()=>document.body.classList.remove('protocol-ms'));
  for(const width of [1150,1280,1440,390]){
   await page.setViewport({width,height:900});
   for(let stage=0;stage<4;stage++){
    const layout=await page.evaluate(()=>{const p=document.querySelector('.cb-tour'),r=p.getBoundingClientRect();return {fits:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,overflow:p.scrollWidth>p.clientWidth,title:document.querySelector('#cbTourTitle').textContent};});
    check(width+'px stage '+(stage+1)+' fits without horizontal overflow',layout.fits&&!layout.overflow);
    if(width===1440)await page.screenshot({path:path.join(shots,'stage-'+(stage+1)+'.png')});
    if(width===390)await page.screenshot({path:path.join(shots,'mobile-stage-'+(stage+1)+'.png')});
    if(stage===1){await page.click('#cbExampleBtn');check('example reveals without altering actual lesson notes',await page.$eval('#krispNotes',e=>e.value===''));}
    if(stage===2){check('unavailable installer has no executable CTA',await page.$eval('[data-scout-download]',e=>e.hidden&&!e.hasAttribute('href')));await page.click('#cbSkipScout');}
    else if(stage<3)await page.click('[data-next]');
   }
   // Back to Welcome for the next viewport, without completing the guide.
   for(let i=0;i<3;i++)await page.click('[data-back]');
  }
  for(const viewport of [{width:390,height:640},{width:320,height:568},{width:1280,height:720}]){
   await page.setViewport(viewport);
   for(let stage=0;stage<4;stage++){
    if(stage===1)await page.click('#cbExampleBtn');
    for(const bottom of [false,true]){
     const pinned=await page.evaluate(bottom=>{
      const body=document.querySelector('#cbTourBody');body.scrollTop=bottom?body.scrollHeight:0;
      const panel=document.querySelector('.cb-tour').getBoundingClientRect();
      return [...document.querySelectorAll('#cbTourFooter button')].every(button=>{const r=button.getBoundingClientRect();return r.top>=panel.top&&r.bottom<=panel.bottom&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});
     },bottom);
     check(viewport.width+'x'+viewport.height+' stage '+(stage+1)+' navigation stays visible '+(bottom?'after scroll':'before scroll'),pinned);
    }
    if(stage===3)check('ready screen has one clear message without a repeated hero card',await page.$eval('#cbTourContent',e=>!e.querySelector('.cb-hero')&&e.textContent.includes('create your first report')));
    if(stage===2)await page.click('#cbSkipScout');else if(stage<3)await page.click('[data-next]');
   }
   await page.screenshot({path:path.join(shots,'compact-'+viewport.width+'x'+viewport.height+'.png')});
   for(let i=0;i<3;i++)await page.click('[data-back]');
  }
  check('step changes use a subtle content fade',await page.evaluate(()=>{
   document.querySelector('[data-next]').click();
   return document.querySelector('#cbTourContent').getAnimations().some(a=>a.effect.getTiming().duration===160&&a.effect.getKeyframes().some(k=>k.opacity==='0'));
  }));
  await page.click('[data-back]');
  await page.keyboard.press('Tab');await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
  check('keyboard focus remains inside dialog',await page.evaluate(()=>!!document.activeElement.closest('.cb-tour')));
  await page.click('[data-skip]');await page.waitForFunction(()=>document.querySelector('#cbOnboardingOverlay').hidden);
  await page.waitForFunction(()=>[...Object.keys(localStorage)].some(k=>k.startsWith('classbuster.onboarding.v1.')&&JSON.parse(localStorage[k]).pending===false));
  check('skip choice reaches server',(await send(status,'GET',browserKey)).data.onboarding.state==='skipped');
  await page.reload({waitUntil:'networkidle0'});
  check('reload does not repeat introduction',await page.$eval('#cbOnboardingOverlay',e=>e.hidden));
  await page.click('#helpBtn');await page.click('#replayOnboardingBtn');
  const writesBeforeReplay=writeCount;await page.keyboard.press('Escape');
  check('replay Escape changes no account state',writeCount===writesBeforeReplay);
  check('focus restored to Help',await page.evaluate(()=>document.activeElement.id==='helpBtn'));
  await page.click('#scoutWorkspaceBtn');
  check('Scout remains discoverable outside introduction',await page.$eval('#cbTourTitle',e=>e.textContent==='Meet Scout'));
  await page.keyboard.press('Escape');
  released=true;await page.reload({waitUntil:'networkidle0'});await page.click('#scoutWorkspaceBtn');
  check('verified release exposes safe install instructions and download',await page.$eval('[data-scout-download]',e=>!e.hidden&&e.href==='https://classbuster.com/downloads/ScoutSetup.exe'&&e.rel.includes('noopener')));
  await page.keyboard.press('Escape');
  await page.click('#helpBtn');await page.click('#replayOnboardingBtn');await page.click('[data-next]');await page.click('[data-next]');
  await page.setRequestInterception(true);page.on('request',r=>r.url().endsWith('/ScoutSetup.exe')?r.abort():r.continue());
  await page.$eval('[data-scout-download]',e=>e.addEventListener('click',event=>event.preventDefault()));await page.click('[data-scout-download]');
  await page.waitForFunction(()=>document.querySelector('#cbTourTitle')?.textContent==='You’re ready!');
  check('installer selection reaches ready without claiming installation',await page.$eval('#cbTourContent',e=>e.textContent.includes('Your download was requested')));
  await page.click('[data-done]');
  const second=await browser.createBrowserContext();const other=await second.newPage();
  await other.evaluateOnNewDocument(key=>{if(!localStorage.getItem('kidbuster_access_key'))localStorage.setItem('kidbuster_access_key',key);},browserKey);
  await other.goto(base,{waitUntil:'networkidle0'});
  check('fresh browser/device honors server completion',await other.$eval('#cbOnboardingOverlay',e=>e.hidden));
  await other.evaluate(key=>{localStorage.setItem('kidbuster_access_key',key);return refreshAccountPanel();},proKey);
  await other.waitForSelector('#cbOnboardingOverlay:not([hidden])');
  check('switching to another pending account shows its own guide',await other.$eval('#cbTourTitle',e=>e.textContent==='Welcome to Classbuster'));
  failSaves=true;await other.click('[data-skip]');
  await other.reload({waitUntil:'networkidle0'});
  check('failed state save does not trap user or repeat guide on reload',await other.$eval('#cbOnboardingOverlay',e=>e.hidden));
  failSaves=false;await other.evaluate(()=>window.dispatchEvent(new Event('online')));
  await other.waitForFunction(id=>JSON.parse(localStorage.getItem('classbuster.onboarding.v1.'+id)||'null')?.pending===false,{},onboarding.onboardingAccountId(proKey));
  check('reconnect retries completion using same real account',(await send(status,'GET',proKey)).data.onboarding.state==='skipped');
  await other.evaluate(()=>{localStorage.removeItem('kidbuster_access_key');return refreshAccountPanel();});
  await other.evaluate(key=>{localStorage.setItem('kidbuster_access_key',key);return refreshAccountPanel();},proKey);
  check('logout/login preserves completion',await other.$eval('#cbOnboardingOverlay',e=>e.hidden));
  const activationContext=await browser.createBrowserContext();const activationPage=await activationContext.newPage();
  const browserToken=await verification.createVerificationToken({email:'verified-browser-onboarding@example.test',intent:'signup'});
  await activationPage.goto(base+'/?access_token='+browserToken.token,{waitUntil:'networkidle0'});
  await activationPage.waitForSelector('#cbOnboardingOverlay:not([hidden])');
  check('successful email activation launches the real first-time flow automatically',await activationPage.$eval('#cbTourTitle',e=>e.textContent==='Welcome to Classbuster'));
  await activationPage.click('[data-next]');await activationPage.click('[data-next]');await activationPage.click('#cbSkipScout');await activationPage.click('[data-done]');
  const activatedKey=await licensing.getLicenseKeyByEmail('verified-browser-onboarding@example.test');
  await activationPage.waitForFunction(id=>JSON.parse(localStorage.getItem('classbuster.onboarding.v1.'+id)||'null')?.pending===false,{},onboarding.onboardingAccountId(activatedKey));
  check('Enter Classbuster persists completed state',(await send(status,'GET',activatedKey)).data.onboarding.state==='completed');
  await activationPage.reload({waitUntil:'networkidle0'});
  check('completed first-time flow stays finished after reload',await activationPage.$eval('#cbOnboardingOverlay',e=>e.hidden));
  await other.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await other.click('#scoutWorkspaceBtn');
  check('reduced motion suppresses entry animation',await other.$eval('.cb-tour',e=>getComputedStyle(e).animationName==='none'));
  check('reduced motion also suppresses content fades',await other.$eval('#cbTourContent',e=>e.getAnimations().length===0));
  await other.evaluate(()=>document.documentElement.dataset.appearance='light');
  check('light appearance uses readable neutral granite text',await other.$eval('.cb-tour',e=>getComputedStyle(e).color==='rgb(37, 44, 53)'));
  await other.screenshot({path:path.join(shots,'scout-light.png')});
  check('browser flow has no JavaScript exceptions',errors.length===0);if(errors.length)console.log(errors);
  check('serverless count remains 12',fs.readdirSync(path.join(root,'api')).filter(f=>f.endsWith('.js')).length===12);
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));__resetForTests();}
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exitCode=n?1:0);
