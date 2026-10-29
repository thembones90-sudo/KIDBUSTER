'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http');
module.exports=async function(){
  const source=fs.readFileSync('assets/krisp-poll-budget.js','utf8');
  const server=http.createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><title>Synthetic tab budget</title><script>'+source+'</script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  let browser;
  try{
    const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    browser=await require('puppeteer').launch({headless:true,executablePath,args:['--no-sandbox']});
    const pages=await Promise.all([browser.newPage(),browser.newPage()]);
    const origin='http://127.0.0.1:'+server.address().port;
    for(const page of pages){
      await page.goto(origin);
      await page.evaluate(()=>{
        window.fixture={key:'synthetic-tab-account',now:100000,calls:0,hidden:false};
        window.budget=ClassbusterKrispPollBudget.create({key:()=>fixture.key,now:()=>fixture.now,armed:()=>true,enabled:()=>true,hidden:()=>fixture.hidden,run:async()=>{fixture.calls++;await new Promise(r=>setTimeout(r,40));return {};}});
      });
    }
    await Promise.all(pages.map(p=>p.evaluate(()=>budget.tick())));
    assert.equal((await Promise.all(pages.map(p=>p.evaluate(()=>fixture.calls)))).reduce((a,b)=>a+b),1,'real Web Locks elect one scheduled reader');
    // Sequential contenders also respect the same-origin shared deadline.
    for(const p of pages)await p.evaluate(()=>budget.tick());
    const counts=await Promise.all(pages.map(p=>p.evaluate(()=>fixture.calls)));
    assert.equal(counts.reduce((a,b)=>a+b),1);
    const leader=counts.indexOf(1),follower=1-leader;
    await pages[leader].close();
    await pages[follower].evaluate(async()=>{fixture.now+=15000;await budget.tick();});
    assert.equal(await pages[follower].evaluate(()=>fixture.calls),1,'closed leader cannot strand automatic discovery');
    await pages[follower].evaluate(async()=>{fixture.hidden=true;fixture.now+=120000;await budget.tick();});
    assert.equal(await pages[follower].evaluate(()=>fixture.calls),1,'hidden tab spends no discovery commands');
    await pages[follower].evaluate(async()=>{fixture.hidden=false;fixture.key='other-synthetic-account';budget.reset();await budget.tick();});
    assert.equal(await pages[follower].evaluate(()=>fixture.calls),2,'other account cannot inherit old account cooldown');
    console.log('PASS real-browser Web Locks/shared-storage budget, leader closure, hidden state and account switch');return 0;
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
