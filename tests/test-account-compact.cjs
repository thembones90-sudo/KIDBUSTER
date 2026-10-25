'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
module.exports=async function(){
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(pathname==='/api/license-status'?200:403,{'content-type':'application/json'});return res.end(JSON.stringify(pathname==='/api/license-status'?{status:'active',plan:'pro',founder:true}:{}));}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('content-type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>localStorage.setItem('kidbuster_access_key','synthetic-account-layout'));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.click('#accountBtn');
  await page.waitForFunction(()=>document.getElementById('accountPlan').textContent==='Owner Pro');
  for(const skin of ['dark','light'])for(const width of [1440,768,390,320]){
   await page.setViewport({width,height:1000});await page.evaluate(s=>document.documentElement.dataset.appearance=s,skin);
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>!document.getAnimations().some(a=>a.transitionProperty&&a.playState==='running'));
   const layout=await page.evaluate(()=>{
    const c=s=>getComputedStyle(document.querySelector(s)),r=s=>document.querySelector(s).getBoundingClientRect();
    return {title:c('#accountPanel .account-title').fontSize,value:c('#accountPlan').fontSize,weight:c('#accountPlan').fontWeight,
     height:r('#accountPanel').height,padding:c('#accountPanel').paddingTop,
     targets:[...document.querySelectorAll('#accountPanel button,#accountPanel summary')].filter(e=>e.getBoundingClientRect().height>0).map(e=>e.offsetHeight),
     overflow:document.documentElement.scrollWidth-innerWidth,editorFont:c('#krispNotes').fontSize};
   });
   assert.equal(layout.title,'20px');assert.equal(layout.value,'15px');assert.equal(layout.weight,'600');
   assert.equal(layout.padding,width<=560?'16px':'20px');assert.ok(layout.targets.every(h=>h>=44),'44px account controls in '+skin+' at '+width);
   assert.ok(layout.overflow<=1,'no overflow in '+skin+' at '+width);
   if(width===1440){assert.ok(layout.height<540,'collapsed desktop account stays compact');console.log(skin+' compact account height: '+layout.height+'px');}
   if(process.env.V2_ACCOUNT_SCREENSHOTS&&[1440,390].includes(width))await page.screenshot({path:path.join(process.env.V2_ACCOUNT_SCREENSHOTS,'account-'+skin+'-'+width+'.png'),fullPage:width===390});
  }
  await page.setViewport({width:390,height:1000});await page.click('#accountPanel .account-support>summary');
  await page.click('#accountPanel .owner-fold>summary');
  assert.equal(await page.$eval('#accountPanel .owner-fold',e=>e.open),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'expanded owner controls fit mobile');
  assert.deepEqual(errors,[]);console.log('PASS compact account typography, 44px controls, owner/support expansion and both themes across desktop/tablet/mobile');return 0;
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
