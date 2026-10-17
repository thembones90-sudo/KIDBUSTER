'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
  const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const source=html.slice(html.indexOf('const GENERATION_STATUS_MESSAGES ='),html.indexOf('let currentUserIsFounder ='));
  let callback,period,next=1;const timers=new Map(),history=[];
  const classes={add(){},remove(){},toggle(){}};
  const label={classList:classes,offsetWidth:1,set textContent(v){this.value=v;history.push(v);},get textContent(){return this.value;}};
  const sandbox={generateBtnLabel:label,generateBtn:{classList:classes,setAttribute(k,v){this[k]=v;}},setInterval(fn,ms){callback=fn;period=ms;timers.set(next,fn);return next++;},clearInterval(id){timers.delete(id);}};
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  sandbox.setLoading(true);assert.equal(period,3000);assert.equal(sandbox.generateBtn['aria-busy'],'true');
  for(let i=0;i<9;i++)callback();
  assert.equal(history.length,10);assert.equal(new Set(history).size,10);
  assert.deepEqual(history,[
    '👋 You taught the lesson. We’ll help with the words…',
    '📝 Turning your notes into thoughtful feedback…',
    '🧩 Bringing the lesson’s key moments together…',
    '✨ Shaping your report in your chosen style…',
    '💬 Helping you find the right words…',
    '☕ A little less paperwork. A little more breathing room…',
    '🌿 More time for teaching. Less time typing…',
    '⏳ Taking a little longer, but we’re still here…',
    '💛 Thanks for waiting. We appreciate your patience…',
    '🙆 Feel free to stretch. We’ll keep working…'
  ]);
  assert.equal(vm.runInContext('GENERATION_COMPLETE_MESSAGE',sandbox),'✅ Your report is ready!');
  assert.equal(timers.size,0,'final line holds with no remaining timer');
  sandbox.setLoading(true);sandbox.setLoading(true);assert.equal(timers.size,1,'restarting never leaks a timer');
  sandbox.setLoading(false);assert.equal(timers.size,0);assert.equal(label.textContent,'Generate feedback');
  assert.equal(sandbox.generateBtn['aria-busy'],'false');
  const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.evaluate(()=>{
      window.testLabels=[];const original=setStatusText;
      setStatusText=text=>{window.testLabels.push(text);original(text);};
      document.getElementById('teacherName').value='Synthetic Teacher';
      document.getElementById('studentName').value='Synthetic Student';
      document.getElementById('krispNotes').value='Synthetic lesson notes about clouds.';
      document.querySelector('#ratingTrack button[data-lvl="4"]').click();
      callClaude=async()=>{throw new Error('Synthetic provider failure');};
    });
    await page.evaluate(()=>generate());
    assert.equal(await page.evaluate(()=>window.testLabels.includes(GENERATION_COMPLETE_MESSAGE)),false,'failure never claims success');
    assert.equal(await page.$eval('#generateBtn',e=>e.disabled),false);
    await page.evaluate(async()=>{
      callClaude=async()=>({text:'Synthetic report for UI lifecycle testing.',usage:null});
      await generate();
    });
    assert.equal(await page.evaluate(()=>window.testLabels.filter(t=>t===GENERATION_COMPLETE_MESSAGE).length),1,'successful generation alone announces ready');
    assert.equal(await page.$eval('#generateBtn .btn-label',e=>e.textContent),'Generate feedback');
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    for(const width of [1440,390,320]){
      await page.setViewport({width,height:1000});
      for(const message of history){
        await page.evaluate(text=>setStatusText(text),message);
        assert.ok(await page.$eval('#generateBtn',e=>{const r=e.getBoundingClientRect(),l=e.querySelector('.btn-label').getBoundingClientRect();return l.left>=r.left&&l.right<=r.right&&l.top>=r.top&&l.bottom<=r.bottom;}),'message fits at '+width);
      }
      assert.equal(await page.$eval('#generateBtn .btn-label',e=>getComputedStyle(e).animationName),'none');
    }
    await page.close();console.log('PASS ten 3-second messages, final hold, timer cleanup, success/failure lifecycle, mobile text fit and reduced motion');return 0;
  }finally{await browser.close();}
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
