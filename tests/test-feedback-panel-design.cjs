'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
  const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.evaluate(()=>{
      localStorage.setItem('kidbuster_access_key','synthetic-feedback-test');
      window.testFeedbackRequests=[];window.testFeedbackError=false;
      window.fetch=async(url,options)=>{if(url==='/api/feedback'){window.testFeedbackRequests.push(JSON.parse(options.body));return {ok:!window.testFeedbackError};}return {ok:false,status:403,json:async()=>({})};};
      showFeedbackCard('MA','4',null,null,'0123456789abcdef');
      currentUserIsFounder=true;
      renderLint(['Report is 2854 characters — over the 2800 working target. Review before sending.']);
    });
    assert.equal(await page.$eval('#feedbackSubmitBtn',e=>e.disabled),true);
    await page.focus('#feedbackStars button[data-score="4"]');await page.keyboard.press('Enter');
    assert.equal(await page.$eval('#feedbackStars button[data-score="4"]',e=>e.getAttribute('aria-pressed')),'true');
    assert.equal(await page.evaluate(()=>window.testFeedbackRequests.length),0,'choosing stars never submits');
    assert.equal(await page.$eval('#feedbackSubmitBtn',e=>e.disabled),false);
    await page.click('#feedbackSubmitBtn');
    await page.waitForFunction(()=>document.getElementById('feedbackStatus').classList.contains('sent'));
    assert.equal(await page.evaluate(()=>window.testFeedbackRequests[0].score),4);
    assert.equal(await page.$$eval('#feedbackStars [aria-pressed="true"]',els=>els.length),0,'sent feedback clears selected state');
    for(const category of ['bug','idea']){
      await page.click('#feedbackTabs button[data-category="'+category+'"]');
      assert.equal(await page.$eval('#feedbackSubmitBtn',e=>e.disabled),true);
      await page.type('#feedbackComment','Synthetic '+category+' feedback');
      await page.click('#feedbackSubmitBtn');
      await page.waitForFunction(()=>document.getElementById('feedbackStatus').classList.contains('sent'));
      assert.equal(await page.evaluate(()=>window.testFeedbackRequests.at(-1).category),category);
    }
    await page.type('#feedbackComment','Please preserve this draft');
    await page.evaluate(()=>window.testFeedbackError=true);await page.click('#feedbackSubmitBtn');
    await page.waitForFunction(()=>document.getElementById('feedbackStatus').textContent.includes('Could not send'));
    assert.equal(await page.$eval('#feedbackComment',e=>e.value),'Please preserve this draft');
    assert.equal(await page.$eval('#feedbackSubmitBtn',e=>e.disabled),false,'failed submission can be retried');
    await page.evaluate(()=>showFeedbackCard('MA','4',null,null,'0123456789abcdef'));
    await page.click('#feedbackStars button[data-score="4"]');
    for(const width of [1440,768,390,320]){
      await page.setViewport({width,height:1000});
      await page.evaluate(()=>document.getElementById('feedbackCard').scrollIntoView({block:'center'}));
      const bounds=await page.$eval('#feedbackCard',e=>{
        const r=e.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,contentFits:e.scrollWidth<=e.clientWidth+1};
      });
      assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.contentFits,'feedback card fits '+width);
      assert.ok(bounds.height<=(width===1440?250:360),'feedback stays compact at '+width);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.equal(await page.$eval('#feedbackSubmitBtn',e=>e.getBoundingClientRect().height>=44),true);
      if(process.env.V2_FEEDBACK_SCREENSHOTS){
        await page.$('#feedbackCard').then(e=>e.screenshot({path:path.join(process.env.V2_FEEDBACK_SCREENSHOTS,'feedback-panel-'+width+'.png')}));
        if(width===1440)await page.$('#lintResults').then(e=>e.screenshot({path:path.join(process.env.V2_FEEDBACK_SCREENSHOTS,'feedback-review-warning.png')}));
      }
    }
    assert.match(await page.$eval('#lintResults',e=>e.textContent),/2854 characters/,'warning remains fully visible and unchanged');
    assert.equal(await page.$eval('#lintResults',e=>getComputedStyle(e).color),'rgb(197, 203, 208)','warning body uses neutral grey, not orange');
    assert.equal(await page.$eval('#lintResults .lint-title',e=>getComputedStyle(e).color),'rgb(224, 228, 232)','warning heading uses neutral text');
    assert.ok(!(await page.$eval('.feedback-card-label',e=>getComputedStyle(e).fontFamily)).includes('mono'));
    assert.equal(await page.$eval('#feedbackStatus',e=>e.getAttribute('role')),'status');
    console.log('PASS polished feedback: keyboard stars, explicit submission, all categories, failure recovery, warning text and responsive layout');return 0;
  }finally{await browser.close();}
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
