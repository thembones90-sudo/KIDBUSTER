'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
  const puppeteer=require('puppeteer');
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox'],...(executablePath?{executablePath}:{})});
  try{
    for(const width of [1280,390])for(const reduced of [false,true]){
      const page=await browser.newPage();
      await page.setViewport({width,height:900});
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]);
      await page.setRequestInterception(true);
      page.on('request',r=>r.url().startsWith('file:')||r.url().startsWith('data:')?r.continue():r.abort());
      await page.goto(pathToFileURL(path.join(__dirname,'..','index.html')).href);
      await page.evaluate(()=>{
        document.getElementById('teacherName').value='Preserved Teacher';
        document.getElementById('studentName').value='Previous Student';
        document.getElementById('krispNotes').value='Previous lesson';
        document.getElementById('specialRemarks').value='Previous remarks';
        document.querySelector('input[name="protocol"][value="MS"]').click();
        document.getElementById('newStudentBtn').disabled=false;
        window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
      });
      const start=await page.evaluate(()=>{
        document.getElementById('newStudentBtn').click();
        const desired=scrollY+document.getElementById('studentName').getBoundingClientRect().top-315;
        const maximum=document.documentElement.scrollHeight-innerHeight;
        return {y:scrollY,focus:document.activeElement.id,target:Math.max(0,Math.min(maximum,desired)),clamped:desired>maximum||desired<0};
      });
      assert.equal(start.focus,'studentName');
      if(!reduced){
        await new Promise(r=>setTimeout(r,120));
        const mid=await page.evaluate(()=>({y:scrollY,top:document.getElementById('studentName').getBoundingClientRect().top}));
        if(!start.clamped)assert.ok(mid.y!==start.y||Math.abs(start.y-start.target)<3,'scroll moves toward the field');
      }
      await new Promise(r=>setTimeout(r,500));
      const result=await page.evaluate(()=>({
        name:document.getElementById('studentName').value,
        notes:document.getElementById('krispNotes').value,
        remarks:document.getElementById('specialRemarks').value,
        teacher:document.getElementById('teacherName').value,
        protocol:document.querySelector('input[name="protocol"]:checked').value,
        top:document.getElementById('studentName').getBoundingClientRect().top,
        y:scrollY,
        message:document.getElementById('nextStudentStatus').textContent,
        focus:document.activeElement.id
      }));
      assert.equal(result.name,'');assert.equal(result.notes,'');assert.equal(result.remarks,'');
      assert.equal(result.teacher,'Preserved Teacher');assert.equal(result.protocol,'MS');
      assert.equal(result.focus,'studentName');
      if(!start.clamped)assert.ok(Math.abs(result.y-start.target)<3,'lands at the student field');
      assert.ok(result.top>=0&&result.top<850,'student field is visible');
      assert.equal(result.message,'Ready for your next student');
      if(reduced)assert.equal(start.y,await page.evaluate(()=>scrollY),'reduced motion jumps directly');
      if(width===1280&&!reduced){
        await new Promise(r=>setTimeout(r,3500));
        assert.equal(await page.$eval('#nextStudentStatus',el=>el.textContent),'');
      }
      if(width===390&&!reduced){
        await page.evaluate(()=>{
          window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'});
          document.getElementById('newStudentBtn').disabled=false;
          document.getElementById('newStudentBtn').click();
        });
        await new Promise(r=>setTimeout(r,100));
        await page.keyboard.type('A');
        const interrupted=await page.evaluate(()=>scrollY);
        await new Promise(r=>setTimeout(r,500));
        assert.equal(await page.evaluate(()=>scrollY),interrupted,'typing interrupts scroll');
        assert.equal(await page.$eval('#studentName',el=>el.value),'A');
      }
      await page.close();
    }
    console.log('PASS New Student: desktop/mobile, short transition, focus, reset, preserved settings, status expiry, reduced motion');
    return 0;
  }finally{await browser.close();}
};
