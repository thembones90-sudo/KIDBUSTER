'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
  const root=path.resolve(__dirname,'..');
  const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  const browser=await require('puppeteer').launch({headless:true,executablePath,args:['--no-sandbox']});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1440,height:1000});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
    assert.equal(await page.$eval('.brand-promise',e=>e.textContent),'Lesson notes. Professional feedback.');
    for(const protocol of ['MA','MS','FAIRY']){
      await page.evaluate(p=>document.querySelector('#protocolSelect input[value="'+p+'"]').click(),protocol);
      for(const [length,target,limit] of [['short',2200,2400],['medium',2800,3000],['long',4500,4800]]){
        await page.evaluate(value=>document.querySelector('input[name="lengthFormat"][value="'+value+'"]').click(),length);
        const result=await page.evaluate(()=>({caption:document.getElementById('lengthFormatCaption').textContent,details:document.getElementById('lengthFormatDetails').textContent,open:document.getElementById('lengthDetails').open,font:getComputedStyle(document.getElementById('lengthFormatCaption')).fontFamily}));
        assert.equal(result.caption,length.charAt(0).toUpperCase()+length.slice(1)+' · Up to '+limit.toLocaleString('en-US')+' characters');
        assert.ok(result.details.includes(target.toLocaleString('en-US'))&&result.details.includes(limit.toLocaleString('en-US')));
        assert.equal(result.open,false);assert.ok(!result.font.toLowerCase().includes('mono'));
        const segment=await page.$eval('#lengthFormatSelect>label:has(input:checked)',e=>({border:getComputedStyle(e).borderColor,colour:getComputedStyle(e).getPropertyValue('--toxin-rgb'),icon:getComputedStyle(e.querySelector('svg')).color,outline:getComputedStyle(e).outlineStyle}));
        assert.ok(segment.border.includes(segment.colour.trim().split(',').map(s=>s.trim()).join(', ')),'selected border uses current protocol colour');
        assert.ok(segment.icon.startsWith('rgb('),'detail icon remains visible');
        await page.focus('#lengthDetails summary');await page.keyboard.press('Enter');
        assert.equal(await page.$eval('#lengthDetails',e=>e.open),true,'keyboard opens length details');
        await page.keyboard.press('Enter');
      }
    }
    assert.deepEqual(await page.$$eval('#lengthFormatSelect .length-detail-icon path',els=>els.map(e=>(e.getAttribute('d').match(/M/g)||[]).length)),[2,3,4],'line icons show increasing detail');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    assert.equal(await page.$eval('#lengthFormatSelect>label',e=>getComputedStyle(e).transitionDuration),'0s');
    await page.click('#lengthFormatSelect>label:has(input[value="medium"])');
    await page.keyboard.press('Tab');await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
    assert.equal(await page.$eval('#lengthFormatSelect>label:has(input[value="medium"])',e=>getComputedStyle(e).outlineStyle),'solid','keyboard selection has a visible focus ring');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('input[name="lengthFormat"][value="long"]',e=>e.checked),true);
    if(process.env.V2_LENGTH_SCREENSHOTS){
      for(const width of [1440,390,320]){
        await page.setViewport({width,height:1000});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.$('#lengthFormatField').then(e=>e.screenshot({path:path.join(process.env.V2_LENGTH_SCREENSHOTS,'length-segments-'+width+'.png')}));
      }
    }
    for(const protocol of ['BLITZ','BEIDA','OF','PREPLY']){
      await page.evaluate(p=>document.querySelector('#protocolSelect input[value="'+p+'"]').click(),protocol);
      assert.equal(await page.$eval('#lengthFormatField',e=>getComputedStyle(e).display),'none','fixed-format protocols retain hidden length controls');
    }
    await page.evaluate(()=>{document.querySelector('#protocolSelect input[value="MA"]').click();document.querySelector('input[name="lengthFormat"][value="medium"]').click();});
    for(const width of [1440,768,390,320]){
      await page.setViewport({width,height:1000});
      await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow at '+width);
      await page.focus('#lengthDetails summary');await page.keyboard.press('Enter');
      const bounds=await page.$eval('#lengthFormatDetails',e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right};});
      assert.ok(bounds.left>=0&&bounds.right<=width,'info panel fits at '+width);
      await page.keyboard.press('Enter');
      if(process.env.V2_COPY_SCREENSHOTS&&[1440,390].includes(width))await page.screenshot({path:path.join(process.env.V2_COPY_SCREENSHOTS,'polished-copy-'+width+'.png')});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS concise header, all three dynamic length limits, keyboard details, seven protocol visibility rules and responsive layout');return 0;
  }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
