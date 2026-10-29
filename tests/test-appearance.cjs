'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
module.exports=async function(){
 const root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(403,{'Content-Type':'application/json'});return res.end('{}');}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>localStorage.setItem('kidbuster_access_key','synthetic-appearance-test'));
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await page.setViewport({width:1440,height:1100});await page.goto(url);
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'light','new browser follows light system');
  assert.equal(await page.$eval('html',e=>e.style.colorScheme),'light');
  await page.evaluate(()=>{
   window.appearanceTransitionCount=0;const native=document.startViewTransition.bind(document);
   document.startViewTransition=function(update){
    window.appearanceTransitionCount++;const transition=native(update);
    window.appearanceTransitionReady=transition.ready.then(()=>({
     running:document.getAnimations().some(a=>a.animationName==='appearance-dissolve'),
     duration:getComputedStyle(document.documentElement,'::view-transition-new(root)').animationDuration
    }));window.appearanceTransitionDone=transition.finished;return transition;
   };
  });
  await page.click('#accountBtn');await page.click('#accountPanel [data-appearance-option="dark"]');
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='dark');
  const dissolve=await page.evaluate(()=>window.appearanceTransitionReady);
  assert.ok(dissolve.running,'theme changes run a real dissolve animation');assert.equal(dissolve.duration,'0.42s');
  await page.evaluate(()=>window.appearanceTransitionDone);
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'dark');
  assert.equal(await page.$eval('#kbLogo',e=>getComputedStyle(e).filter),'none','dark logo keeps its approved artwork');
  assert.equal(await page.$eval('.mode-badge',e=>getComputedStyle(e).color),'rgb(135, 243, 22)','dark Classic badge retains its neon green');
  await page.waitForFunction(()=>!document.body.getAnimations().some(a=>a.transitionProperty==='--workspace-wash'));
  const darkCanvas=await page.$eval('body',e=>{const s=getComputedStyle(e);return {base:s.backgroundColor,wash:s.getPropertyValue('--workspace-wash'),layers:(s.backgroundImage.match(/radial-gradient/g)||[]).length,animation:s.animationName};});
  assert.equal(darkCanvas.base,'rgb(16, 17, 19)');assert.equal(darkCanvas.layers,2);assert.equal(darkCanvas.animation,'none','ambient canvas has no perpetual animation');
  assert.match(darkCanvas.wash,/135, 243, 22/,'dark canvas follows Classic identity');
  if(process.env.V2_APPEARANCE_SCREENSHOTS){await page.click('#accountBtn');await page.setViewport({width:2560,height:1440});await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'ambient-dark-wide.png')});await page.setViewport({width:1440,height:1100});}
  await page.reload();assert.equal(await page.$eval('html',e=>e.dataset.appearance),'dark','manual choice survives reload');
  await page.click('#accountBtn');await page.click('#accountPanel [data-appearance-option="system"]');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='dark');
  await page.evaluate(()=>window.appearanceTransitionDone);
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='light');
  await page.evaluate(()=>window.appearanceTransitionDone);
  // Reload above removes the test's transition promise wrapper. Wait for the
  // real snapshot/colour transitions before clicking a moving account control.
  await page.waitForFunction(()=>!document.getAnimations().some(a=>(a.animationName==='appearance-dissolve'||a.transitionProperty)&&a.playState==='running'));
  await page.click('#accountPanel [data-appearance-option="light"]');
  await page.waitForFunction(()=>document.documentElement.dataset.appearanceChoice==='light');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'light','manual light ignores OS changes');
  await page.click('#accountBtn');
  for(const mode of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
   await page.click('#protocolSelect label:has(input[value="'+mode+'"])');
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   if(mode==='MS'){
    const washTransition=await page.$eval('body',e=>{
     getComputedStyle(e).getPropertyValue('--workspace-wash');
     const a=e.getAnimations().find(a=>a.transitionProperty==='--workspace-wash');if(!a)return null;
     a.pause();a.currentTime=0;const start=getComputedStyle(e).getPropertyValue('--workspace-wash');
     a.currentTime=325;const middle=getComputedStyle(e).getPropertyValue('--workspace-wash');
     a.currentTime=650;const end=getComputedStyle(e).getPropertyValue('--workspace-wash');a.finish();
     return {start,middle,end,duration:a.effect.getTiming().duration};
    });
    assert.ok(washTransition,'protocol changes crossfade the ambient colour');assert.equal(washTransition.duration,650);
    assert.notEqual(washTransition.middle,washTransition.start);assert.notEqual(washTransition.middle,washTransition.end,'ambient colour interpolates instead of jumping');
   }
   await page.waitForFunction(()=>!document.body.getAnimations().some(a=>a.transitionProperty==='--workspace-wash'));
   const ambient=await page.$eval('body',e=>{const s=getComputedStyle(e);return {rgb:s.getPropertyValue('--toxin-rgb').trim(),wash:s.getPropertyValue('--workspace-wash'),image:s.backgroundImage,base:s.backgroundColor,animation:s.animationName};});
   assert.equal(ambient.base,'rgb(245, 245, 242)');assert.equal(ambient.animation,'none');
   assert.ok(ambient.wash.replace(/\s/g,'').includes(ambient.rgb.replace(/\s/g,'')),mode+' ambient wash uses its own protocol colour');
   assert.equal((ambient.image.match(/radial-gradient/g)||[]).length,2);
   await page.waitForFunction(()=>['#krispNotes','#teacherName','#lengthFormatSelect>label:not(:has(input:checked))'].every(s=>getComputedStyle(document.querySelector(s)).borderTopColor==='rgb(135, 153, 140)'));
   await page.waitForFunction(()=>!document.querySelector('.mode-badge').getAnimations().some(a=>a.playState==='running'));
   const colors=await page.evaluate(()=>{
    const c=s=>getComputedStyle(document.querySelector(s));return {panel:c('.grid .panel').backgroundColor,input:c('#krispNotes').backgroundColor,text:c('#krispNotes').color,
     fieldBorder:c('#krispNotes').borderTopColor,fieldWidth:c('#krispNotes').borderTopWidth,zoom:parseFloat(c('.wrap').zoom),
     identityBorder:c('#teacherName').borderTopColor,pillWidth:c('#protocolSelect>label').borderTopWidth,
     idleLengthBorder:c('#lengthFormatSelect>label:not(:has(input:checked))').borderTopColor};
   });
   assert.equal(colors.panel,'rgb(255, 255, 255)',mode+' has white panels');assert.equal(colors.input,'rgb(246, 247, 244)');assert.equal(colors.text,'rgb(32, 42, 40)');
   assert.equal(colors.fieldBorder,'rgb(135, 153, 140)',mode+' fields have discernible outlines');assert.equal(colors.identityBorder,colors.fieldBorder);
   assert.equal(colors.idleLengthBorder,colors.fieldBorder);
   // Chrome quantizes scaled borders to device pixels, so computed CSS widths
   // can be fractional even though the visible outline remains one pixel.
   assert(Math.abs(parseFloat(colors.fieldWidth)*colors.zoom-1)<0.02,'field outline remains one rendered pixel');
   assert.equal(colors.pillWidth,colors.fieldWidth,'pill outlines match the field outlines without thickening');
   const brand=await page.evaluate(()=>{
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=canvas.height=1;
    function luminance(color){ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
    function contrast(el){const s=getComputedStyle(el),a=luminance(s.color),b=luminance(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
    const badge=document.querySelector('.mode-badge');return {filter:getComputedStyle(document.getElementById('kbLogo')).filter,badgeContrast:contrast(badge),brand:getComputedStyle(document.body).getPropertyValue('--skin-brand').trim(),nameContrasts:[...document.querySelectorAll('#protocolSelect>label')].map(contrast)};
   });
   assert.ok(!brand.filter.includes('brightness(0.6)'),'logos retain their original vivid colours');
   assert.equal(brand.brand,({MA:'#467500',MS:'#b31580',FAIRY:'#a33382',BLITZ:'#806400',BEIDA:'#a6500a',OF:'#06718f',PREPLY:'#7042b2'})[mode]);
   assert.ok(brand.badgeContrast>=4.5,mode+' badge text has readable contrast');
   assert.ok(brand.nameContrasts.every(c=>c>=4.5),mode+' all protocol names remain readable on their tinted pills');
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>document.getElementById('kbLogo').complete&&!document.getElementById('kbLogo').getAnimations().some(a=>a.playState==='running'));
   if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-brand-'+mode+'.png'),clip:{x:0,y:0,width:1440,height:460}});
   if(process.env.V2_APPEARANCE_SCREENSHOTS&&['MA','MS'].includes(mode)){await page.setViewport({width:2560,height:1440});await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'ambient-light-'+mode+'-wide.png')});await page.setViewport({width:1440,height:1100});}
  }
  await page.click('#protocolSelect label:has(input[value="MA"])');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>!document.getElementById('kbLogo').getAnimations().some(a=>a.playState==='running'));
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-workspace-1440.png'),fullPage:true});
  await page.click('#helpBtn');assert.equal(await page.$eval('.help-modal',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-help.png')});
  await page.click('#helpModalCloseBtn');
  await page.evaluate(()=>{
   showFeedbackCard('MA','4',null,null,'0123456789abcdef');currentUserIsFounder=true;renderLint(['Review this report before sending.']);
   document.getElementById('krispIntegrationPanel').showPopover();
  });
  assert.equal(await page.$eval('#krispIntegrationPanel',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-krisp.png')});
  await page.evaluate(()=>document.getElementById('krispIntegrationPanel').hidePopover());
  for(const width of [768,390,320]){
   await page.setViewport({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no light overflow at '+width);
   if(process.env.V2_APPEARANCE_SCREENSHOTS&&width===390)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-workspace-390.png'),fullPage:true});
  }
  await page.click('#accountBtn');
  assert.ok(await page.$$eval('#accountPanel .appearance-options button',buttons=>buttons.every(b=>b.offsetHeight>=44)));
  await page.focus('#accountPanel [data-appearance-option="dark"]');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='dark');
  await page.evaluate(()=>window.appearanceTransitionDone);
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'dark');
  await page.evaluate(()=>localStorage.removeItem('kidbuster_access_key'));
  await page.waitForFunction(()=>!document.getAnimations().some(a=>a.animationName==='appearance-dissolve'));
  // Exercise signed-out access by keyboard after the theme transition.
  // Browser view-transition snapshots can intercept a synthetic pointer click.
  await page.focus('#accountBtn');await page.keyboard.press('Enter');
  // Wait for the actual sign-in control before testing its appearance.
  await page.waitForSelector('#licenseModalOverlay [data-appearance-option="light"]',{visible:true});
  // The newly opened modal can still be moving when it becomes visible.
  // Activate its real control by keyboard so a transition snapshot cannot
  // intercept the synthetic pointer; retain the resulting-theme assertion.
  await page.focus('#licenseModalOverlay [data-appearance-option="light"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.documentElement.dataset.appearance==='light');
  assert.equal(await page.$eval('html',e=>e.dataset.appearance),'light','appearance available before sign-in');
  assert.equal(await page.$eval('#licenseModalOverlay .access-modal',e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
  if(process.env.V2_APPEARANCE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.V2_APPEARANCE_SCREENSHOTS,'light-access-390.png')});
  await page.evaluate(()=>window.appearanceTransitionDone);
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'reduce'}]);
  const reduced=await page.evaluate(()=>{
   const before=window.appearanceTransitionCount;document.querySelector('#licenseModalOverlay [data-appearance-option="dark"]').click();
   return {before,after:window.appearanceTransitionCount,theme:document.documentElement.dataset.appearance};
  });
  assert.equal(reduced.before,reduced.after,'reduced motion never starts a snapshot animation');assert.equal(reduced.theme,'dark');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'},{name:'prefers-reduced-motion',value:'no-preference'}]);
  const fallback=await page.evaluate(()=>{
   document.startViewTransition=undefined;document.querySelector('#licenseModalOverlay [data-appearance-option="light"]').click();
   return {theme:document.documentElement.dataset.appearance,active:document.documentElement.classList.contains('appearance-dissolving')};
  });
  assert.equal(fallback.theme,'light');assert.ok(fallback.active,'older browsers get the colour-fade fallback');
  await page.waitForFunction(()=>!document.documentElement.classList.contains('appearance-dissolving'));
  assert.deepEqual(errors,[]);console.log('PASS appearance: real dissolve, reduced motion, fallback, system changes, saved override, seven protocols, modals, mobile and keyboard');return 0;
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});
