'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
 const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync)});
 try{
  for(const viewport of [{width:1366,height:768},{width:900,height:600},{width:390,height:844}]){
   const page=await browser.newPage();await page.setViewport(viewport);
   await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
   await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
   await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{
     await new Promise(resolve=>setTimeout(resolve,100));
     throw Error('Synthetic clipboard denial');
    }}});
    document.execCommand=()=>false;
    document.getElementById('teacherName').value='Synthetic Teacher';
    document.getElementById('studentName').value='Synthetic Student';
    document.querySelector('input[name="studentGender"][value="boy"]').checked=true;
    for(const protocol of Object.values(KidbusterCore.PROTOCOLS))protocol.analyze=()=>[];
    callClaude=async()=>({text:('Synthetic lesson observation.\n').repeat(75)+'\nCheers,\nTeacher Synthetic',usage:null,trialStatus:null});
   });
   for(const protocol of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
    await page.evaluate(async protocol=>{
     document.querySelector('input[name="protocol"][value="'+protocol+'"]').click();
     document.querySelector('#ratingTrack button')?.click();
     document.getElementById('krispNotes').value='Synthetic notes for an entirely mocked generation.';
     window.scrollTo({top:0,behavior:'instant'});
     await generate();
    },protocol);
    await page.waitForFunction(()=>{
     const row=document.getElementById('actionRow').getBoundingClientRect();
     return row.height>0&&row.top>=0&&row.bottom<=innerHeight+1;
    },{timeout:5000});
    assert(await page.evaluate(()=>{
     const box=document.getElementById('outputBox');
     return box.getBoundingClientRect().height>1000&&box.scrollHeight<=box.clientHeight+2&&!document.getElementById('workspaceOutputScroll')&&scrollY>0;
    }),protocol+' keeps the full report expanded while automatically reaching Copy at '+viewport.width);
   }
   await page.close();
  }
  console.log('PASS completed reports auto-scroll to Copy: seven protocols, desktop, short window and phone; synthetic generation only');return 0;
 }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
