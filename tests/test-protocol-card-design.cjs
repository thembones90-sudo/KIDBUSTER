'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(){
  const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:1000});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-color-scheme',value:'dark'}]);
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
    for(const width of [1440,768,390,320])for(const skin of ['dark','light']){
      await page.setViewport({width,height:1000});
      await page.evaluate(skin=>document.documentElement.dataset.appearance=skin,skin);
      await page.waitForFunction(()=>{const img=document.querySelector('.lingo-ace-watermark');return img.complete&&img.naturalWidth>0;});
      const watermark=await page.$eval('.lingo-ace-watermark',e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {width:e.naturalWidth,opacity:s.opacity,filter:s.filter,pointer:s.pointerEvents,z:s.zIndex,animation:s.animationName,hidden:e.getAttribute('aria-hidden'),alt:e.alt,contained:r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom};});
      assert.equal(watermark.width,119,'supplied logo loads unchanged');assert.equal(watermark.opacity,skin==='dark'?'0.07':'0.065');
      assert.equal(watermark.filter,skin==='dark'?'none':'brightness(0)');assert.equal(watermark.pointer,'none');assert.equal(watermark.z,'-1');
      assert.equal(watermark.animation,'none');assert.equal(watermark.hidden,'true');assert.equal(watermark.alt,'');assert.ok(watermark.contained,'watermark stays inside its own card');
      assert.equal(await page.$$eval('#protocolSelect .lingo-ace-watermark',els=>els.length),1,'only Lingo Ace has the school watermark');
      await page.waitForFunction(()=>{const img=document.querySelector('.beida-watermark');return img.complete&&img.naturalWidth>0;});
      const beida=await page.$eval('.beida-watermark',e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {width:e.naturalWidth,opacity:s.opacity,filter:s.filter,blend:s.mixBlendMode,pointer:s.pointerEvents,z:s.zIndex,animation:s.animationName,hidden:e.getAttribute('aria-hidden'),alt:e.alt,contained:r.left>=p.left&&r.right<=p.right&&r.top>=p.top&&r.bottom<=p.bottom};});
      assert.equal(beida.width,243,'supplied BetaKid image loads unchanged');
      assert.equal(beida.opacity,watermark.opacity,'both school marks have the same quiet intensity');
      assert.equal(beida.filter,'grayscale(1) brightness(0.7) contrast(20)'+(skin==='light'?' invert(1)':''));
      assert.equal(beida.blend,skin==='dark'?'screen':'multiply');
      assert.equal(beida.pointer,'none');assert.equal(beida.z,'-1');assert.equal(beida.animation,'none');
      assert.equal(beida.hidden,'true');assert.equal(beida.alt,'');assert.ok(beida.contained,'Beida mark stays inside its card at '+width+' '+skin);
      assert.equal(await page.$$eval('#protocolSelect .beida-watermark',els=>els.length),1,'only Beida has the BetaKid mark');
      const beidaCenter=await page.$eval('.beida-watermark',e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
      await page.mouse.click(beidaCenter.x,beidaCenter.y);
      assert.equal(await page.$eval('#protocolSelect input[value="BEIDA"]',e=>e.checked),true,'watermark does not block card selection');
      assert.equal(await page.$eval('#protocolSelect>label:has(input[value="BEIDA"])',e=>getComputedStyle(e,'::before').display),'grid');
      const markCenter=await page.$eval('.lingo-ace-watermark',e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
      await page.mouse.click(markCenter.x,markCenter.y);
      assert.equal(await page.$eval('#protocolSelect input[value="OF"]',e=>e.checked),true);
      assert.equal(await page.$eval('#protocolSelect>label:has(input[value="OF"])',e=>getComputedStyle(e,'::before').display),'grid','selection tick remains visible');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
      const titlesFit=await page.$$eval('#protocolSelect>label',els=>els.every(e=>{
        const text=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
        const range=document.createRange();range.selectNodeContents(text);
        const rect=range.getBoundingClientRect(),subtitle=parseFloat(getComputedStyle(e,'::after').top);
        return rect.bottom-e.getBoundingClientRect().top<subtitle;
      }));
      assert.ok(titlesFit,'titles never collide with descriptions at '+width);
      if(process.env.V2_PROTOCOL_SCREENSHOTS)await page.$('#protocolSelect').then(e=>e.screenshot({path:path.join(process.env.V2_PROTOCOL_SCREENSHOTS,'protocol-cards-'+skin+'-'+width+'.png')}));
    }
    console.log('PASS seven restrained protocol colours, pattern-free surfaces, selected checks, mouse/keyboard focus and responsive layout');
    return 0;
  }finally{await browser.close();}
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
