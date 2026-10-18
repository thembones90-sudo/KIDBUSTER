(function(){
 'use strict';
 var key='pathfinder_appearance_v1',allowed=['light','dark','system'],choice='system';
 var media=window.matchMedia('(prefers-color-scheme: dark)');
 var reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)'),transition=null,fallbackTimer;
 try{var saved=localStorage.getItem(key);if(allowed.includes(saved))choice=saved;}catch(e){}
 function paint(){
  var resolved=choice==='system'?(media.matches?'dark':'light'):choice;
  document.documentElement.dataset.appearance=resolved;
  document.documentElement.dataset.appearanceChoice=choice;
  document.documentElement.style.colorScheme=resolved;
  document.querySelectorAll('[data-appearance-option]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.appearanceOption===choice));});
  document.querySelectorAll('.appearance-hint').forEach(function(hint){hint.textContent=choice==='system'?'Following your device’s '+resolved+' appearance.':'Your '+resolved+' appearance is saved on this browser.';});
 }
 function apply(animate){
  var resolved=choice==='system'?(media.matches?'dark':'light'):choice;
  if(transition){transition.skipTransition();transition=null;}
  if(!animate||reducedMotion.matches||document.visibilityState==='hidden'||resolved===document.documentElement.dataset.appearance){paint();return;}
  if(typeof document.startViewTransition==='function'){
   // Native snapshots dissolve the entire surface together, without cloning
   // report text, moving the page, changing focus, or persisting any images.
   try{
    var current=document.startViewTransition(function(){paint();});transition=current;
    current.ready.catch(function(){});
    current.finished.catch(function(){}).finally(function(){if(transition===current)transition=null;});
    return;
   }catch(e){/* Older/embedded browsers use the colour-transition fallback. */}
  }
  clearTimeout(fallbackTimer);document.documentElement.classList.add('appearance-dissolving');paint();
  fallbackTimer=setTimeout(function(){document.documentElement.classList.remove('appearance-dissolving');},460);
 }
 // Synchronous head script: resolve appearance before the first paint.
 apply();
 media.addEventListener('change',function(){if(choice==='system')apply();});
 reducedMotion.addEventListener('change',function(){if(reducedMotion.matches){if(transition)transition.skipTransition();clearTimeout(fallbackTimer);document.documentElement.classList.remove('appearance-dissolving');}});
 window.addEventListener('storage',function(event){if(event.key===key||event.key===null){choice=allowed.includes(event.newValue)?event.newValue:'system';apply();}});
 document.addEventListener('DOMContentLoaded',function(){
  function controls(panel,before,suffix){if(!panel)return;
  var section=document.createElement('section');section.className='appearance-settings';section.setAttribute('aria-labelledby','appearanceTitle');
  var heading=document.createElement('h3');heading.id='appearanceTitle'+suffix;heading.textContent='Appearance';section.setAttribute('aria-labelledby',heading.id);
  var group=document.createElement('div');group.className='appearance-options';group.setAttribute('role','group');group.setAttribute('aria-label','Choose appearance');
  [['light','Light','☀'],['dark','Dark','☾'],['system','System','◐']].forEach(function(option){
   var button=document.createElement('button');button.type='button';button.dataset.appearanceOption=option[0];
   var icon=document.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent=option[2];button.append(icon,document.createTextNode(option[1]));
   button.addEventListener('click',function(){choice=option[0];try{localStorage.setItem(key,choice);}catch(e){}apply(true);});group.append(button);
  });
  var hint=document.createElement('p');hint.className='appearance-hint';hint.setAttribute('role','status');
  section.append(heading,group,hint);panel.insertBefore(section,before);
  }
  var panel=document.getElementById('accountPanel');controls(panel,panel&&panel.querySelector('.account-grid'),'');
  var access=document.querySelector('#licenseModalOverlay .access-modal');controls(access,access&&access.querySelector('.license-modal-trust'),'-access');
  apply();
 });
})();
