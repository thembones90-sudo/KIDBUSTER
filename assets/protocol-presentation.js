// UI-only protocol presentation. This module never builds prompts, accesses
// account state or changes layout. Canonical protocol semantics stay in Core.
(function(root){
'use strict';
const NUMERIC_RATING_UI_COLORS = Object.freeze({
  '1':   '#FF4248',
  '1.5': '#FF803D',
  '2':   '#FFB13D',
  '2.5': '#FFE33F',
  '3':   '#F2FB44',
  '3.5': '#C6FB48',
  '4':   '#89F548',
  '4.5': '#4EF144',
  '5':   '#29EB4F'
});

const VERDICT_LABEL = {
  "1": "Critical.",
  "1.5": "Struggling.",
  "2": "Below Expectations.",
  "2.5": "Developing.",
  "3": "Satisfactory.",
  "3.5": "Promising.",
  "4": "Very Good.",
  "4.5": "Excellent.",
  "5": "Outstanding.",
  "6": "Legendary."
};

const OF_TIER_VERDICT = {
  'Low':         'Needs support.',
  'Low/Medium':  'Developing.',
  'Medium':      'Solid.',
  'Medium/High': 'Strong.',
  'High':        'Exceptional.'
};

const OF_TIER_DISPLAY = {
  'Low':         'Low',
  'Low/Medium':  'Low/Med',
  'Medium':      'Medium',
  'Medium/High': 'Med/High',
  'High':        'High'
};
Object.freeze(VERDICT_LABEL);Object.freeze(OF_TIER_VERDICT);Object.freeze(OF_TIER_DISPLAY);
function protocolLabel(definitions,key){
  const protocol=definitions[key];
  return protocol ? protocol.label : (key || 'This protocol');
}
// Preserve the existing logo interaction and iris motion in one bounded helper.
function installBrandLogo(logo,onReload,reducedMotion){
  const defaultSrc=logo.src;
  logo.setAttribute('role','button');logo.setAttribute('tabindex','0');
  logo.setAttribute('title','Reload Classbuster');logo.setAttribute('aria-label','Reload Classbuster');
  logo.addEventListener('click',onReload);
  logo.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();onReload();}
  });
  Object.keys(logo.dataset).filter(key=>key.indexOf('logo')===0).forEach(key=>{
    const image=new root.Image();image.src=logo.dataset[key];
  });
  return Object.freeze({update(key){
    const nextSrc=(key==='MS'||key==='FAIRY')?logo.dataset.logoMs
      :key==='OF'?logo.dataset.logoOf:key==='BLITZ'?logo.dataset.logoBlitz
      :key==='BEIDA'?logo.dataset.logoBeida:key==='PREPLY'?logo.dataset.logoPreply:defaultSrc;
    if(new URL(nextSrc,root.document.baseURI).href===logo.src)return;
    logo.src=nextSrc;
    if(reducedMotion||typeof logo.animate!=='function')return;
    logo.animate([
      {opacity:0.15,filter:'brightness(2.4) saturate(1.6) blur(2px)',transform:'scale(0.96)'},
      {opacity:1,filter:'brightness(1) saturate(1) blur(0px)',transform:'scale(1)'}
    ],{duration:480,easing:'ease-out'});
  }});
}
root.ClassbusterPresentation=Object.freeze({NUMERIC_RATING_UI_COLORS,VERDICT_LABEL,OF_TIER_VERDICT,OF_TIER_DISPLAY,protocolLabel,installBrandLogo});
})(window);
