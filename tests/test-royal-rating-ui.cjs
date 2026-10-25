'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {createChecker}=require('./helpers/assert.cjs');
const KidbusterCore=require('./helpers/extract-core.cjs').extractKidbusterCore();

module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-royal-rating-ui.cjs ===');
 let puppeteer;
 try{puppeteer=require('puppeteer');}
 catch(e){console.log('SKIPPED - no browser:',e.message);return 0;}
 const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
 const browser=await puppeteer.launch({args:['--no-sandbox'],...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
 try{
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file://'+path.join(__dirname,'..','index.html'));
  await page.setViewport({width:1280,height:900});

  const initial=await page.evaluate(()=>{
   const track=document.getElementById('ratingTrack');
   const buttons=[...track.querySelectorAll('.rating-btn')];
   const crown=track.querySelector('.rating-btn[data-lvl="6"] .rating-crown');
   const elite=track.querySelector('.rating-btn[data-lvl="6"]');
   const style=getComputedStyle(elite);
   return {
    numeric:track.classList.contains('rating-track-numeric'),
    count:buttons.length,
    labels:buttons.map(b=>b.dataset.lvl),
    crownSvg:crown?.namespaceURI==='http://www.w3.org/2000/svg',
    aria:elite?.getAttribute('aria-label'),
    title:elite?.title,
    background:style.backgroundImage,
    height:elite?.getBoundingClientRect().height,
    tooltipCount:track.querySelectorAll('.rating-elite-tooltip').length
   };
  });
  check('numeric protocol keeps all ten canonical values unchanged',initial.numeric&&initial.count===10&&
   initial.labels.join(',')==='1,1.5,2,2.5,3,3.5,4,4.5,5,6');
  check('6/5 keeps the crowned golden design but no special hover tooltip',
    initial.crownSvg&&initial.background.includes('gradient')&&
    initial.title==='6/5'&&initial.aria.includes('Legendary')&&initial.tooltipCount===0);
  check('rating tiles retain original compact 40px height',initial.height>=39&&initial.height<=41);

  const intendedColors={
    // Siren remains decorative; the canonical red background is unchanged.
    '1':'rgb(255, 66, 72)',
    '1.5':'rgb(255, 128, 61)',
    '2':'rgb(255, 177, 61)',
    '2.5':'rgb(255, 227, 63)',
    '3':'rgb(242, 251, 68)',
    '3.5':'rgb(198, 251, 72)',
    '4':'rgb(137, 245, 72)',
    '4.5':'rgb(78, 241, 68)',
    '5':'rgb(41, 235, 79)'
  };
  const actualColors=await page.evaluate(()=>Object.fromEntries(
    [...document.querySelectorAll('#ratingTrack .rating-btn:not(.beyond)')].map(b=>[
      b.dataset.lvl,getComputedStyle(b).backgroundColor
    ])
  ));
  check('all nine ordinary grades display the intended vivid colors',
    Object.entries(intendedColors).every(([level,color])=>actualColors[level]===color));

  const criticalSelector='#ratingTrack .rating-btn[data-lvl="1"]';
  const critical=await page.$eval(criticalSelector,e=>({
    svg:e.querySelector('.rating-siren')?.namespaceURI,
    path:e.querySelector('.rating-siren path')?.getAttribute('d'),
    title:e.title,height:e.getBoundingClientRect().height,
    decorative:e.querySelector('.rating-siren')?.getAttribute('aria-hidden'),
    idle:getComputedStyle(e.querySelector('.rating-siren')).animationName
  }));
  check('Critical has a decorative SVG siren, ordinary title, and exact 40px height',
    critical.svg==='http://www.w3.org/2000/svg'&&critical.path&&critical.decorative==='true'&&critical.title==='1/5'&&critical.height===40&&critical.idle==='none');
  await page.hover(criticalSelector);
  const sirenStart=await page.$eval(criticalSelector+' .rating-siren',e=>({name:getComputedStyle(e).animationName,filter:getComputedStyle(e).filter}));
  await new Promise(resolve=>setTimeout(resolve,350));
  const sirenLater=await page.$eval(criticalSelector+' .rating-siren',e=>getComputedStyle(e).filter);
  check('siren glow visibly changes during its hover animation',sirenStart.name==='ratingSirenPulse'&&sirenStart.filter!==sirenLater);
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  check('reduced motion disables the siren pulse',await page.$eval(criticalSelector+' .rating-siren',e=>getComputedStyle(e).animationName==='none'));
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
  await page.click(criticalSelector);
  await new Promise(resolve=>setTimeout(resolve,190));
  check('Critical selection preserves value, pressed state, and canonical caption without tooltip',await page.evaluate(description=>
    state.rating==='1'&&document.querySelector('#ratingTrack [data-lvl="1"]').getAttribute('aria-pressed')==='true'&&
    document.querySelector('#ratingCaption .verdict').textContent==='Critical.'&&
    document.getElementById('ratingCaption').textContent.includes(description)&&
    !document.querySelector('#ratingTrack [role="tooltip"], #ratingTrack .rating-elite-tooltip'),KidbusterCore.LEVEL_TONE_DESC['1']));

  // Desktop pointer hover adds only a shadow, not a larger button or a changed grade.
  const hoverChecks=[];
  for(const level of ['1','5','6']){
   const selector='#ratingTrack .rating-btn[data-lvl="'+level+'"]';
   await page.mouse.move(0,0);
   await new Promise(resolve=>setTimeout(resolve,240));
   const baseline=await page.$eval(selector,e=>({
     shadow:getComputedStyle(e).boxShadow,
     height:e.getBoundingClientRect().height,
     halo:getComputedStyle(e).getPropertyValue('--rating-halo').trim()
   }));
   await page.hover(selector);
   await new Promise(resolve=>setTimeout(resolve,240));
   const hovered=await page.$eval(selector,e=>({
     shadow:getComputedStyle(e).boxShadow,
     height:e.getBoundingClientRect().height,
     halo:getComputedStyle(e).getPropertyValue('--rating-halo').trim()
   }));
   hoverChecks.push({level,baseline,hovered});
  }
  check('red, green and elite gold gain a visible shadow only on hover',
    hoverChecks.every(entry=>entry.hovered.shadow!==entry.baseline.shadow));
  check('hover glows match each grade rather than sharing one fixed color',
    new Set(hoverChecks.map(entry=>entry.hovered.halo)).size===3);
  check('hover preserves compact 40px tile geometry',
    hoverChecks.every(entry=>entry.hovered.height>=39&&entry.hovered.height<=41));

  // Assert that glow ACTUALLY ANIMATES, rather than existing as a static shadow.
  const pulsing=[];
  for(const level of ['1','5','6']){
    const selector='#ratingTrack .rating-btn[data-lvl="'+level+'"]';
    await page.mouse.move(0,0);
    await page.hover(selector);
    const start=await page.$eval(selector,e=>({
      animation:getComputedStyle(e).animationName,
      shadow:getComputedStyle(e).boxShadow
    }));
    await new Promise(resolve=>setTimeout(resolve,350));
    const later=await page.$eval(selector,e=>getComputedStyle(e).boxShadow);
    pulsing.push({level,animated:start.animation.includes('ratingHaloBreath'),changing:start.shadow!==later});
  }
  check('hover starts a genuine CSS glow animation for red, green and gold',
    pulsing.every(x=>x.animated&&x.changing));

  await page.click('#ratingTrack .rating-btn[data-lvl="6"]');
  const selectedGlows=await page.$eval('#ratingTrack .rating-btn[data-lvl="6"]',
    e=>getComputedStyle(e).animationName.includes('ratingHaloBreath'));
  check('an already-selected crowned 6 still animates when hovered',selectedGlows);
  await new Promise(resolve=>setTimeout(resolve,190));
  const chosen=await page.evaluate(()=>({
   value:state.rating,active:document.querySelectorAll('#ratingTrack .rating-btn.active').length,
   pressed:document.querySelector('#ratingTrack .rating-btn[data-lvl="6"]').getAttribute('aria-pressed'),
   label:document.getElementById('ratingCaption').textContent,
   markup:document.getElementById('ratingCaption').querySelector('.verdict')?.textContent,
   selected:document.getElementById('ratingTrack').classList.contains('has-selection')
  }));
  check('golden 6 selects canonical numeric rating 6 and exposes accessible state',
   chosen.value==='6'&&chosen.active===1&&chosen.pressed==='true'&&chosen.selected);
  check('6 has the identical verdict + canonical rating description format as grades 1–5',
    chosen.markup==='Legendary.' &&
    chosen.label.includes(KidbusterCore.LEVEL_TONE_DESC['6']) &&
    !chosen.label.includes('Reserved for the very best kids'));

  await page.mouse.move(0,0);
    await new Promise(resolve=>setTimeout(resolve,250)); // allow CSS hover transitions to settle
    const colorsAfterSelection=await page.evaluate(()=>Object.fromEntries(
    [...document.querySelectorAll('#ratingTrack .rating-btn:not(.beyond)')].map(b=>[
      b.dataset.lvl,{
        color:getComputedStyle(b).backgroundColor,
        filter:getComputedStyle(b).filter
      }
    ])
  ));
  check('selecting 6 does not dim or desaturate other grades',
    Object.entries(intendedColors).every(([level,color])=>
      colorsAfterSelection[level].color===color && colorsAfterSelection[level].filter==='none'
    ));
  await page.hover('#ratingTrack .rating-btn[data-lvl="6"]');
  await new Promise(resolve=>setTimeout(resolve,220));
  check('hover over 6 shows no competing custom tooltip',await page.$eval('#ratingTrack',
    el=>el.querySelectorAll('.rating-elite-tooltip').length===0));

  await page.click('#ratingTrack .rating-btn[data-lvl="4.5"]');
  const ordinary=await page.evaluate(()=>({
   value:state.rating,
   chosen:document.querySelector('#ratingTrack .rating-btn[data-lvl="4.5"]').getAttribute('aria-pressed'),
   old:document.querySelector('#ratingTrack .rating-btn[data-lvl="6"]').getAttribute('aria-pressed'),
   crownCount:document.querySelectorAll('#ratingTrack .rating-crown').length
  }));
  check('normal rating selection deselects gold without changing the rating semantics',
    ordinary.value==='4.5'&&ordinary.chosen==='true'&&ordinary.old==='false'&&ordinary.crownCount===1);

  // A previous 130ms caption timer must never overwrite a newer elite choice.
  const fastSwitch=await page.evaluate(async()=>{
    document.querySelector('#ratingTrack .rating-btn[data-lvl="4"]').click();
    document.querySelector('#ratingTrack .rating-btn[data-lvl="6"]').click();
    await new Promise(resolve=>setTimeout(resolve,180));
    return {rating:state.rating,caption:document.getElementById('ratingCaption').textContent};
  });
  check('rapid switching leaves the canonical Legendary 6 description intact',
    fastSwitch.rating==='6'&&fastSwitch.caption.includes('Legendary.')&&
    fastSwitch.caption.includes(KidbusterCore.LEVEL_TONE_DESC['6']));

  await page.click('input[name="protocol"][value="OF"]');
  const of=await page.evaluate(()=>({
   of:document.getElementById('ratingTrack').classList.contains('rating-track-of'),
   numeric:document.getElementById('ratingTrack').classList.contains('rating-track-numeric'),
   count:document.querySelectorAll('#ratingTrack .rating-btn').length,
   crowns:document.querySelectorAll('#ratingTrack .rating-crown').length
  }));
  check('OF retains its original five qualitative tiers without any crowns',of.of&&!of.numeric&&of.count===5&&of.crowns===0);
  check('OF has no critical siren',await page.$eval('#ratingTrack',e=>!e.querySelector('.rating-siren')));

  await page.click('input[name="protocol"][value="BEIDA"]');
  const beida=await page.evaluate(()=>({
   beida:document.getElementById('ratingTrack').classList.contains('rating-track-beida'),
   numeric:document.getElementById('ratingTrack').classList.contains('rating-track-numeric'),
   count:document.querySelectorAll('#ratingTrack .rating-btn').length
  }));
  check('Beida retains its original two tier choices',beida.beida&&!beida.numeric&&beida.count===2);
  check('Beida has no critical siren',await page.$eval('#ratingTrack',e=>!e.querySelector('.rating-siren')));

  await page.click('input[name="protocol"][value="PREPLY"]');
  check('Preply still hides rating entirely',await page.evaluate(()=>
   document.getElementById('ratingField').style.display==='none'&&
   document.querySelectorAll('#ratingTrack .rating-btn').length===0));

  await page.click('input[name="protocol"][value="MA"]');
  await page.setViewport({width:390,height:844});
  const mobile=await page.evaluate(()=>{
   const track=document.getElementById('ratingTrack');
   const box=track.getBoundingClientRect();
   return {columns:getComputedStyle(track).gridTemplateColumns.split(' ').length,
    width:box.width,viewport:innerWidth,
    scroll:document.documentElement.scrollWidth,
    count:track.querySelectorAll('.rating-btn').length,
    crown:!!track.querySelector('.rating-crown'),
    heights:[...track.querySelectorAll('.rating-btn')].map(b=>b.getBoundingClientRect().height)};
  });
  check('mobile retains five columns with visible crown and no horizontal overflow',
    mobile.columns===5&&mobile.count===10&&mobile.crown&&mobile.width<mobile.viewport&&mobile.scroll<=mobile.viewport+1&&mobile.heights.every(h=>h>=39&&h<=41));
  check('no uncaught browser exceptions',errors.length===0);
  if(errors.length)console.log('Page errors:',errors);
  await page.close();
 }finally{await browser.close();}
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});
