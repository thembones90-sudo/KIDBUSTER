const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer');
module.exports=async function(){
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',r=>/^https?:/.test(r.url())?r.abort():r.continue());
  await page.goto(pathToFileURL(path.join(__dirname,'../index.html')).href);
  await page.addStyleTag({content:'html body .header-actions>#krispIntegrationBtn,html body .header-actions>#krispPendingBtn{display:inline-flex!important}'});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.workspaceView),'original');
  assert(await page.$eval('#workspaceViewToggle',e=>!!e.closest('#accountPanel')));
  for(const [width,height] of [[1909,990],[1536,864],[1440,720],[1366,650],[1280,720]]){
   await page.setViewport({width,height});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   for(const protocol of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
    await page.evaluate(p=>document.querySelector('input[name="protocol"][value="'+p+'"]').click(),protocol);
    const b=await page.evaluate(()=>{
     const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
     return {scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,notes:box('.grid>div:nth-child(2)>.panel:first-child'),output:box('.grid>div:nth-child(2)>.panel:last-child'),generate:box('#generateBtn'),actions:box('#actionRow')};
    });
    assert(b.scrollWidth<=width+1&&b.scrollHeight<=height+1,protocol+' '+width+' frame fits '+JSON.stringify(b));
    assert(b.output.top>=b.notes.bottom,'notes above output');
    for(const r of [b.notes,b.output,b.generate,b.actions])assert(r.top>=0&&r.bottom<=height+1&&r.left>=0&&r.right<=width+1,protocol+' '+width+' controls fit '+JSON.stringify(b));
   }
  }
  await page.evaluate(()=>{document.querySelector('#krispNotes').value='Synthetic notes';document.querySelector('#outputBox').textContent='Synthetic report';document.querySelector('#workspaceViewToggle').click();});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.workspaceView),'columns');
  assert.equal(await page.$eval('#krispNotes',e=>e.value),'Synthetic notes');
  assert.equal(await page.$eval('#outputBox',e=>e.textContent),'Synthetic report');
  await page.reload();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.workspaceView),'columns','saved choice restored');
  await page.evaluate(()=>document.querySelector('#workspaceViewToggle').click());
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.workspaceView),'original');
  console.log('PASS workspace views: original default, seven protocols fit, Account toggle, saved choice and preserved content');
  return 0;
 }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
