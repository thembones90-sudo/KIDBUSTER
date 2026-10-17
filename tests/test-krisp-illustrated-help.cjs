'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
  const root=path.resolve(__dirname,'..');
  const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.setViewport({width:1440,height:1000});
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.click('#helpBtn');await page.evaluate(()=>document.getElementById('firstGuideDetails').open=true);
    const pictures=await page.$$eval('.krisp-guide-figure img',els=>els.map(e=>({src:e.getAttribute('src'),alt:e.alt})));
    assert.deepEqual(pictures.map(e=>path.basename(e.src)),['settings1.jpg','settings2.jpg'],'Settings picture comes before Integrations picture');
    assert.ok(pictures.every(e=>e.alt.length>30),'descriptive alternative text');
    for(const pic of pictures)assert.ok(fs.existsSync(path.join(root,pic.src)));
    assert.equal(await page.$$eval('.krisp-guide-full',els=>els.every(e=>e.rel.includes('noopener')&&e.target==='_blank')),true);
    const steps=await page.$$eval('.krisp-guide-figure',els=>els.map(e=>e.closest('.help-step').querySelector('.help-step-number').textContent));
    assert.deepEqual(steps,['2','3']);
    const copy=await page.$eval('#firstGuideDetails',e=>e.textContent);
    assert.match(copy,/Transcript created only/);assert.match(copy,/until you press DISARM KRISP/);assert.match(copy,/Copying the link alone does not confirm/);
    for(const width of [1440,390,320]){
      await page.setViewport({width,height:1000});
      for(let i=0;i<2;i++){
        const fig=(await page.$$('.krisp-guide-figure'))[i];
        await fig.evaluate(e=>e.scrollIntoView({block:'center'}));
        await page.waitForFunction(i=>{const e=document.querySelectorAll('.krisp-guide-figure img')[i];return e.complete&&e.naturalWidth>0;},{},i);
        const geometry=await fig.evaluate(e=>{const image=e.querySelector('img').getBoundingClientRect(),r=e.getBoundingClientRect(),caption=e.querySelector('figcaption').getBoundingClientRect();return {left:r.left,right:r.right,imageBottom:image.bottom,captionTop:caption.top};});
        assert.ok(geometry.left>=0&&geometry.right<=width,'illustration fits '+width);
        assert.ok(geometry.captionTop>=geometry.imageBottom-1,'explanation stays below picture');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        if(process.env.V2_KRISP_GUIDE_SCREENSHOTS)await fig.screenshot({path:path.join(process.env.V2_KRISP_GUIDE_SCREENSHOTS,'krisp-guide-'+width+'-'+(i+1)+'.png')});
      }
    }
    await page.focus('.krisp-guide-full');assert.equal(await page.$eval('.krisp-guide-full',e=>document.activeElement===e),true);
    await page.click('#helpModalCloseBtn');assert.equal(await page.$eval('#helpModalOverlay',e=>getComputedStyle(e).display),'none');
    console.log('PASS illustrated Krisp help: image order, loaded local assets, plain instructions, keyboard links and mobile layout');return 0;
  }finally{await browser.close();}
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
