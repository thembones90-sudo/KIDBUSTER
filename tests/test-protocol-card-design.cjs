'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(){
  const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:1000});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto('file:///'+path.resolve(__dirname,'../index.html').replace(/\\/g,'/'));
    const palette=await page.$$eval('#protocolSelect>label',els=>els.map(e=>{
      const s=getComputedStyle(e);return {rgb:s.getPropertyValue('--rgb').trim(),background:s.backgroundImage,shadow:s.boxShadow,animation:s.animationName,left:getComputedStyle(e,'::after').left,check:getComputedStyle(e,'::before').display,selected:e.querySelector('input').checked};
    }));
    assert.equal(palette.length,7);assert.equal(new Set(palette.map(e=>e.rgb)).size,7,'seven distinct designated colours');
    for(const card of palette){
      assert.ok(card.background.startsWith('linear-gradient(145deg'),'quiet single-gradient surface');
      assert.ok(!/repeating|radial/.test(card.background),'no decorative patterns');
      assert.equal(card.shadow,'none');assert.equal(card.animation,'none');assert.equal(card.left,'8px');
      assert.equal(card.check,card.selected?'grid':'none','only the selected card has a selection marker');
    }
    for(const value of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
      const selector='#protocolSelect>label:has(input[value="'+value+'"])';
      await page.click(selector);
      assert.equal(await page.$eval(selector,e=>e.querySelector('input').checked),true);
      assert.equal(await page.$eval(selector,e=>getComputedStyle(e).outlineStyle),'none','pointer selection does not show a double focus ring');
      assert.equal(await page.$eval(selector,e=>getComputedStyle(e,'::before').display),'grid');
    }
    await page.click('#protocolSelect>label:has(input[value="MA"])');
    await page.keyboard.press('Tab');await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
    assert.equal(await page.$eval('#protocolSelect>label:has(input[value="MA"])',e=>getComputedStyle(e).outlineStyle),'solid','keyboard focus stays visible');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.$eval('#protocolSelect input[value="MS"]',e=>e.checked),true,'native keyboard selection works');
    await page.click('#protocolSelect>label:has(input[value="MA"])');
    for(const width of [1440,768,390,320]){
      await page.setViewport({width,height:1000});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
      const titlesFit=await page.$$eval('#protocolSelect>label',els=>els.every(e=>{
        const text=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
        const range=document.createRange();range.selectNodeContents(text);
        const rect=range.getBoundingClientRect(),subtitle=parseFloat(getComputedStyle(e,'::after').top);
        return rect.bottom-e.getBoundingClientRect().top<subtitle;
      }));
      assert.ok(titlesFit,'titles never collide with descriptions at '+width);
      if(process.env.V2_PROTOCOL_SCREENSHOTS)await page.$('#protocolSelect').then(e=>e.screenshot({path:path.join(process.env.V2_PROTOCOL_SCREENSHOTS,'protocol-cards-'+width+'.png')}));
    }
    console.log('PASS seven restrained protocol colours, pattern-free surfaces, selected checks, mouse/keyboard focus and responsive layout');
    return 0;
  }finally{await browser.close();}
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
