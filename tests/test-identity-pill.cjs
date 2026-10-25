'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-identity-pill.cjs ===');
  let puppeteer;
  try{puppeteer=require('puppeteer');}
  catch(e){console.log('SKIPPED: Chrome/Puppeteer unavailable',e.message);return 0;}
  const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser=await puppeteer.launch({args:['--no-sandbox'],...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  try{
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const ids=['teacherName','teacherSignoffEmoji','studentName'];
    const protocols=['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY'];
    for(const width of [1280,390]){
      await page.setViewport({width,height:1000});
      await page.goto('file://'+path.join(__dirname,'..','index.html'));
      const results=[];
      for(const protocol of protocols){
        await page.click('#protocolSelect label:has(input[value="'+protocol+'"])');
        await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        const r=await page.evaluate(ids=>{
          const ui={};
          for(const id of ids){
            const el=document.getElementById(id);
            const cs=getComputedStyle(el);
            ui[id]={
              classApplied:el.classList.contains('identity-pill'),
              height:el.offsetHeight,
              width:el.offsetWidth,
              border:cs.borderTopColor,
              radius:cs.borderTopLeftRadius,
              padding:cs.padding,
              fontSize:cs.fontSize,
              weight:cs.fontWeight,
              labelColor:getComputedStyle(document.querySelector('label[for="'+id+'"]')).color,
              labelOpacity:getComputedStyle(document.querySelector('label[for="'+id+'"]')).opacity
            };
          }
          const panel=document.querySelector('.grid>div:first-child>.panel');
          return {ui,panelHeight:panel.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth+1};
        },ids);
        results.push({protocol,...r});
        const same=Object.values(r.ui);
        const equal=attr=>same.every(x=>x[attr]===same[0][attr]);
        check(protocol+' '+width+'px: all 3 inputs match Student geometry and theme',
          same.every(v=>v.classApplied)&&
          ['height','width','border','radius','padding','fontSize','weight','labelColor','labelOpacity'].every(equal)&&
          same[0].height>=43&&same[0].height<=45&&
          same[0].labelOpacity==='1'
        );
        // Focus each field separately to verify a matching focus ring.
        const focus=await page.evaluate(ids=>ids.map(id=>{
          const el=document.getElementById(id);
          el.focus();
          const cs=getComputedStyle(el);
          return {color:cs.borderTopColor,shadow:cs.boxShadow,height:el.getBoundingClientRect().height};
        }),ids);
        check(protocol+' '+width+'px: matching protocol-colored focus rings',
          focus.every(x=>x.color===focus[0].color&&x.shadow===focus[0].shadow&&x.height===focus[0].height)&&
          focus[0].shadow!=='none'
        );
      }
      check(width+'px: switching protocols preserves sidebar footprint',
        results.every(v=>Math.abs(v.panelHeight-results[0].panelHeight)<=1));
      check(width+'px: no horizontal overflow',
        results.every(v=>!v.overflow));
      check(width+'px: protocol colors actually change between Classic, Sugarcoat and OF',
        new Set(['MA','MS','OF'].map(p=>results.find(x=>x.protocol===p).ui.studentName.border)).size===3);
    }
    check('no page errors during protocol switching',errors.length===0);
    if(errors.length)console.log('Page errors',errors);
  }finally{await browser.close();}
  return getFailures();
};
if(require.main===module)module.exports().then(v=>process.exit(v?1:0)).catch(e=>{console.error(e);process.exit(1);});
