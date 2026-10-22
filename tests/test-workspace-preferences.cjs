'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
module.exports=async function(){
 const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'.v2-tmp'),{recursive:true});
 const profile=fs.mkdtempSync(path.join(root,'.v2-tmp','preferences-'));
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(403,{'content-type':'application/json'});return res.end('{}');}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port,errors=[];
 const launch=()=>require('puppeteer').launch({headless:true,userDataDir:profile,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
 let browser;
 try{
  browser=await launch();let page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
  await page.evaluate(()=>{localStorage.removeItem('pathfinder_workspace_preferences_v1');localStorage.setItem('kidbuster_draft_v1',JSON.stringify({protocol:'MS',lengthFormat:'medium'}));});
  await page.reload();
  const selected=()=>page.evaluate(()=>({protocol:document.querySelector('input[name="protocol"]:checked').value,length:document.querySelector('input[name="lengthFormat"]:checked').value}));
  assert.deepEqual(await selected(),{protocol:'MS',length:'medium'},'existing draft settings are adopted for migration');
  await page.click('#protocolSelect label:has(input[value="MA"])');
  await page.reload();
  assert.equal((await selected()).protocol,'MA','protocol-only change must survive reload instead of restoring stale Sugarcoat');
  for(const mode of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
   await page.click('#protocolSelect label:has(input[value="'+mode+'"] )');
   for(const length of ['short','medium','long']){
    await page.evaluate(length=>{const r=document.querySelector('input[name="lengthFormat"][value="'+length+'"]');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));},length);
    await page.reload();assert.deepEqual(await selected(),{protocol:mode,length},mode+' / '+length+' survives refresh');
    assert.equal(await page.evaluate(()=>readFormState().protocol),mode,'engine form uses the restored protocol');
   }
  }
  await page.click('#protocolSelect label:has(input[value="MA"])');
  await page.click('#lengthFormatSelect label:has(input[value="short"])');
  await page.click('#clearBtn');await page.reload();
  assert.deepEqual(await selected(),{protocol:'MA',length:'short'},'Clear removes lesson content, not mode preferences');
  await page.evaluate(()=>{newStudentBtn.disabled=false;});await page.click('#newStudentBtn');
  await page.waitForFunction(()=>!studentTeleportRunning);await page.reload();
  assert.deepEqual(await selected(),{protocol:'MA',length:'short'},'New Student preserves mode preferences');
  await page.evaluate(()=>localStorage.setItem('kidbuster_draft_v1',JSON.stringify({protocol:'MS',lengthFormat:'medium'})));
  await page.reload();assert.deepEqual(await selected(),{protocol:'MA',length:'short'},'stale draft cannot override the latest mode preferences');
  assert.match(await page.$eval('#protocolBadge',e=>e.textContent),/Classic/);
  assert.ok(await page.$eval('#kbLogo',e=>e.src.includes('classbuster-horizontal-transparent.png')),'restored badge and logo match the selected protocol');
  assert.deepEqual(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('pathfinder_workspace_preferences_v1'))).sort()),['lengthFormat','protocol'],'preferences store no student or lesson content');
  await browser.close();browser=await launch();page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  assert.deepEqual(await selected(),{protocol:'MA',length:'short'},'closing and reopening the browser preserves the mode');
  await page.evaluate(()=>{localStorage.setItem('pathfinder_workspace_preferences_v1','{broken');localStorage.setItem('kidbuster_draft_v1',JSON.stringify({protocol:'MA',lengthFormat:'short'}));});
  await page.reload();assert.deepEqual(await selected(),{protocol:'MA',length:'short'},'corrupt preferences safely fall back to existing draft settings');
  assert.deepEqual(errors,[]);
  console.log('PASS protocol-only changes, all 21 protocol/length combinations, Clear, New Student and browser restart preserve workspace preferences');return 0;
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
