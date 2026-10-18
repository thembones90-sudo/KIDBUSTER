'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
module.exports=async function(){
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(403,{'Content-Type':'application/json'});return res.end('{}');}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>localStorage.setItem('kidbuster_access_key','synthetic-appearance-test'));
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await page.setViewport({width:1440,height:1100});await page.goto(url);
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'light','new browser follows light system');
  assert.equal(await page.$eval('html',e=>e.style.colorScheme),'light');
  await page.click('#accountBtn');await page.click('#accountPanel [data-appearance-option="dark"]');
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'dark');
  await page.reload();assert.equal(await page.$eval('html',e=>e.dataset.appearance),'dark','manual choice survives reload');
  await page.click('#accountBtn');await page.click('#accountPanel [data-appearance-option="system"]');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='dark');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='light');
  await page.click('#accountPanel [data-appearance-option="light"]');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'light','manual light ignores OS changes');
  await page.click('#accountBtn');
  for(const mode of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
   await page.click('input[name="protocol"][value="'+mode+'"]');
   const colors=await page.evaluate(()=>{
    const c=s=>getComputedStyle(document.querySelector(s));return {panel:c('.grid .panel').backgroundColor,input:c('#krispNotes').backgroundColor,text:c('#krispNotes').color};
   });
   assert.equal(colors.panel,'rgb(255, 255, 255)',mode+' has white panels');assert.equal(colors.input,'rgb(246, 247, 244)');assert.equal(colors.text,'rgb(32, 42, 40)');
  }
  await page.click('input[name="protocol"][value="MA"]');
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>!document.getElementById('kbLogo').getAnimations().some(a=>a.playState==='running'));
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-workspace-1440.png'),fullPage:true});
  await page.click('#helpBtn');assert.equal(await page.$eval('.help-modal',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-help.png')});
  await page.click('#helpModalCloseBtn');
  await page.evaluate(()=>{
   showFeedbackCard('MA','4',null,null,'0123456789abcdef');currentUserIsFounder=true;renderLint(['Review this report before sending.']);
   document.getElementById('krispIntegrationPanel').showPopover();
  });
  assert.equal(await page.$eval('#krispIntegrationPanel',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-krisp.png')});
  await page.evaluate(()=>document.getElementById('krispIntegrationPanel').hidePopover());
  for(const width of [768,390,320]){
   await page.setViewport({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no light overflow at '+width);
   if(process.env.V2_APPEARANCE_SCREENSHOTS&&width===390)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-workspace-390.png'),fullPage:true});
  }
  await page.click('#accountBtn');
  assert.ok(await page.$$eval('#accountPanel .appearance-options button',buttons=>buttons.every(b=>b.getBoundingClientRect().height>=44)));
  await page.focus('#accountPanel [data-appearance-option="dark"]');await page.keyboard.press('Enter');
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'dark');
  await page.evaluate(()=>localStorage.removeItem('kidbuster_access_key'));
  await page.click('#accountBtn');
  await page.click('#licenseModalOverlay [data-appearance-option="light"]');
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'light','appearance available before sign-in');
  assert.equal(await page.$eval('#licenseModalOverlay .access-modal',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-access-390.png')});
  assert.deepEqual(errors,[]);console.log('PASS appearance: system changes, saved override, seven protocols, light surfaces, modals, mobile and keyboard');return 0;
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});
