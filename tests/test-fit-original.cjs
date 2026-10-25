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
   await page.setViewport({width,height,isMobile:width===390});
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
    const before=await page.evaluate(()=>document.querySelector('.wrap').style.zoom);
    assert.equal(await page.evaluate(()=>document.querySelector('input[name="protocol"]:checked')?.value),protocol,'fitting preserves the real protocol selection');
    for(const level of ['1','5','6']){
     const selected=await page.evaluate(l=>{const b=document.querySelector('#ratingTrack [data-lvl="'+l+'"]');if(b)b.click();return !!b;},level);
     if(selected){
      await new Promise(r=>setTimeout(r,180));
      const rated=await page.evaluate(()=>({zoom:document.querySelector('.wrap').style.zoom,height:document.documentElement.scrollHeight,caption:document.getElementById('ratingCaption').getBoundingClientRect().bottom}));
      assert.equal(rated.zoom,before,'rating '+level+' must not shrink the page');
      assert(rated.height<=height+1&&rated.caption<=height+1,'complete rating explanation fits before generation');
     }
    }
    await page.evaluate(()=>{
     for(const id of ['outputBox','ofFollowupBox','beidaPerformanceBox']){
      const box=document.getElementById(id);box.classList.remove('empty');
      box.textContent=('Synthetic generated report with vocabulary, grammar and homework.\n\n').repeat(120);
     }
     document.getElementById('feedbackCard').style.display='';
    });
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
    const filled=await page.evaluate(()=>{
     const box=document.getElementById('outputBox');window.scrollTo(0,document.documentElement.scrollHeight);
     return {zoom:document.querySelector('.wrap').style.zoom,height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,pageScrolled:window.scrollY>0,innerOverflow:box.scrollHeight-box.clientHeight,panelOverflow:box.parentElement.scrollHeight-box.parentElement.clientHeight};
    });
    assert.equal(filled.zoom,before,protocol+' generating a long report must not shrink the interface');
    assert(filled.height>height&&filled.width<=width+1,'generated report extends the page vertically without horizontal overflow');
    assert(filled.pageScrolled,'the page scrolls through the generated report, as requested');
    assert(filled.innerOverflow<=1&&filled.panelOverflow<=1,'no nested output scrollbars or clipped report text');
    await page.evaluate(()=>{
     for(const id of ['outputBox','ofFollowupBox','beidaPerformanceBox']){const box=document.getElementById(id);box.textContent='';box.classList.add('empty');}
     document.getElementById('feedbackCard').style.display='none';
     window.scrollTo(0,0);
    });
   }
  }
  for(const [width,height] of [[1909,943],[1366,650]]){
   await page.setViewport({width,height,isMobile:false});
   await page.reload();
   await page.evaluate(()=>document.querySelector('input[name="protocol"][value="MA"]').click());
   await page.evaluate(()=>document.querySelector('#ratingTrack [data-lvl="6"]').click());
   await new Promise(r=>setTimeout(r,180));
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
   const before=await page.evaluate(()=>document.querySelector('.wrap').style.zoom);
   await page.evaluate(async()=>{
    readFormState=()=>({teacherName:'Teacher',studentName:'Synthetic Student',protocol:'MA',notes:'Fictional past-tense practice.',remarks:'',rating:'6',lengthFormat:'long',studentGender:'',signoffEmoji:'',blitzVoice:'warm',preplyModule:'adult',preplyTrialPerson:'adult'});
    saveDraft=()=>{};copyOutputToClipboard=()=>true;
    callClaude=async()=>({text:'Hi Synthetic Student!\n\n'+('We practised past tense and reviewed fictional vocabulary. Keep practising!\n\n').repeat(45)+'Teacher',usage:null,trialStatus:null});
    await generate();
   });
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
   const generated=await page.evaluate(()=>{
    const box=document.getElementById('outputBox');
    return {zoom:document.querySelector('.wrap').style.zoom,width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,text:box.textContent,overflow:box.scrollHeight-box.clientHeight,panelOverflow:box.parentElement.scrollHeight-box.parentElement.clientHeight};
   });
   assert.equal(generated.zoom,before,'actual generation preserves the working page scale');
   assert(generated.width<=width+1&&generated.height>height,'actual generated report restores vertical page scrolling');
   assert(generated.text.startsWith('Hi Synthetic Student!')&&generated.text.length>3000,'complete long report is rendered');
   assert(generated.overflow<=1&&generated.panelOverflow<=1,'actual generated report has no internal scrollbars');
   await page.waitForFunction(()=>window.scrollY>0,{timeout:3000});
   await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
   assert(await page.evaluate(()=>window.scrollY>0),'teacher can scroll down through the actual generated report');
   await page.evaluate(()=>generate());
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
   assert.equal(await page.evaluate(()=>document.querySelector('.wrap').style.zoom),before,'a second report and its previous-report control also preserve scale');
  }
  console.log('PASS original canvas: ratings never shrink the page; generated reports preserve scale and restore natural page scrolling');return 0;
 }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
