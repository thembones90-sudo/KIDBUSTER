'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
  const puppeteer=require('puppeteer');
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],...(executablePath?{executablePath}:{})});
  try{
    for(const width of [1280,390])for(const reduced of [false,true]){
      const page=await browser.newPage();
      await page.setViewport({width,height:900});
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]);
      await page.setRequestInterception(true);
      page.on('request',r=>r.url().startsWith('file:')||r.url().startsWith('data:')?r.continue():r.abort());
      await page.goto(pathToFileURL(path.join(__dirname,'..','index.html')).href);
      await page.bringToFront();
      await page.screenshot(); // Start a rendered frame before measuring animations.
      await page.evaluate(()=>{
        window.__nativeAnimate=Element.prototype.animate;
        window.__holdTeleport=true;
        Element.prototype.animate=function(frames,options){
          const animation=window.__nativeAnimate.call(this,frames,options);
          if(window.__holdTeleport&&this.matches('.grid .panel')&&[230,390].includes(options.duration)){
            animation.pause();animation.currentTime=120;
          }
          return animation;
        };
        window.__resetCount=0;
        document.addEventListener('kidbuster:workspace-reset',()=>window.__resetCount++);
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
        return {y:scrollY,focus:document.activeElement.id,phase:document.querySelector('.grid').dataset.teleport,resets:window.__resetCount};
      });
      if(reduced){
        assert.equal(start.focus,'studentName');assert.equal(start.resets,1);
        assert.equal(start.phase,undefined);
        assert.equal(await page.$('.workspace-teleport-scan'),null);
      }else{
        assert.equal(start.phase,'out');assert.equal(start.resets,0);
        await page.$eval('#newStudentBtn',el=>el.dispatchEvent(new MouseEvent('click')));
        await new Promise(r=>setTimeout(r,120));
        const departing=await page.evaluate(()=>({phase:document.querySelector('.grid').dataset.teleport,cards:[...document.querySelectorAll('.grid .panel')].map(el=>({opacity:getComputedStyle(el).opacity,animations:el.getAnimations().map(a=>({time:a.currentTime,state:a.playState}))}))}));
        assert.ok(departing.cards.some(card=>Number(card.opacity)<.9),'cards visibly disassemble '+JSON.stringify(departing));
        assert.ok(await page.$('.workspace-teleport-scan'),'scan line is present');
        if(width===1280&&process.env.PATHFINDER_TELEPORT_CAPTURE)await page.screenshot({path:path.join(process.env.PATHFINDER_TELEPORT_CAPTURE,'teleport-out.png')});
        await page.evaluate(()=>document.querySelectorAll('.grid .panel').forEach(card=>card.getAnimations().forEach(animation=>animation.finish())));
        await page.waitForFunction(()=>document.querySelector('.grid').dataset.teleport==='in');
        assert.equal(await page.$eval('.grid',el=>el.dataset.teleport),'in');
        assert.equal(await page.$eval('#studentName',el=>el.value),'');
      }
      await page.evaluate(()=>{
        window.__holdTeleport=false;Element.prototype.animate=window.__nativeAnimate;
        document.querySelectorAll('.grid .panel').forEach(card=>card.getAnimations().forEach(animation=>animation.finish()));
      });
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
        focus:document.activeElement.id,
        phase:document.querySelector('.grid').dataset.teleport,
        resets:window.__resetCount,
        opacity:getComputedStyle(document.querySelector('.grid .panel')).opacity
      }));
      assert.equal(result.name,'');assert.equal(result.notes,'');assert.equal(result.remarks,'');
      assert.equal(result.teacher,'Preserved Teacher');assert.equal(result.protocol,'MS');
      assert.equal(result.focus,'studentName');
      assert.ok(result.top>=0&&result.top<850,'student field is visible');
      assert.equal(result.resets,1,'exactly one reset');assert.equal(result.phase,undefined);
      assert.equal(result.opacity,'1');assert.equal(await page.$('.workspace-teleport-scan'),null);
      assert.equal(result.message,'Ready for your next student');
      if(width===1280&&!reduced&&process.env.PATHFINDER_TELEPORT_CAPTURE)await page.screenshot({path:path.join(process.env.PATHFINDER_TELEPORT_CAPTURE,'teleport-ready.png')});
      if(reduced)assert.ok(result.top>=0&&result.top<850,'readable workspace scrolls to the student field even with reduced motion');
      if(width===1280&&!reduced){
        await new Promise(r=>setTimeout(r,3500));
        assert.equal(await page.$eval('#nextStudentStatus',el=>el.textContent),'');
        await page.evaluate(()=>{
          document.querySelector('.grid .panel').animate=()=>{throw new Error('Synthetic animation failure');};
          document.getElementById('newStudentBtn').disabled=false;
          document.getElementById('newStudentBtn').click();
        });
        assert.equal(await page.$eval('#studentName',el=>el.value),'');
        assert.equal(await page.$eval('.grid',el=>el.dataset.teleport),undefined);
        assert.equal(await page.$('.workspace-teleport-scan'),null);
        assert.equal(await page.evaluate(()=>window.__resetCount),2,'animation failure still resets once');
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
        assert.equal(await page.evaluate(()=>scrollY),interrupted,'typing interrupts teleport');
        assert.equal(await page.$eval('#studentName',el=>el.value),'A');
        assert.equal(await page.$('.workspace-teleport-scan'),null);
        assert.equal(await page.evaluate(()=>window.__resetCount),2);
      }
      await page.close();
    }
    console.log('PASS New Student teleport: desktop/mobile, exit/entry phases, scan line, focus, single reset, preserved settings, interruption, cleanup, reduced motion');
    return 0;
  }finally{await browser.close();}
};
