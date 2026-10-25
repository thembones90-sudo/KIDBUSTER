const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer');
module.exports=async function(){
 const browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.setRequestInterception(true);page.on('request',r=>/^https?:/.test(r.url())?r.abort():r.continue());
  await page.goto(pathToFileURL(path.join(__dirname,'../index.html')).href);
  await page.addStyleTag({content:'html body .header-actions>#krispIntegrationBtn,html body .header-actions>#krispPendingBtn{display:inline-flex!important}'});
  for(const [width,height] of [[1909,943],[1536,864],[1440,720],[1366,650],[1280,600],[1024,768],[390,844]]){
   await page.setViewport({width,height});
   for(const protocol of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
    await page.evaluate(p=>document.querySelector('input[name="protocol"][value="'+p+'"]').click(),protocol);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
    const g=await page.evaluate(()=>{
     const wrap=document.querySelector('.wrap'),r=wrap.getBoundingClientRect();
     return {width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,canvas:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,ratioX:r.width/wrap.offsetWidth,ratioY:r.height/wrap.offsetHeight},controls:['#teacherName','#studentName','#ratingTrack','#generateBtn','#actionRow'].map(s=>{const b=document.querySelector(s).getBoundingClientRect();return {selector:s,left:b.left,right:b.right,top:b.top,bottom:b.bottom};})};
    });
    assert(g.width<=width+1&&g.height<=height+1,protocol+' '+width+' page has no scrollbars '+JSON.stringify(g));
    assert(Math.abs(g.canvas.ratioX-g.canvas.ratioY)<0.002,'uniform scale preserves proportions');
    for(const b of [g.canvas,...g.controls])assert(b.left>=-1&&b.right<=width+1&&b.top>=0&&b.bottom<=height+1,protocol+' '+width+' all controls on screen '+JSON.stringify(g));
   }
  }
  console.log('PASS original canvas: proportional scaling, all seven protocols, seven viewports, all controls fit without page scrollbars');return 0;
 }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
