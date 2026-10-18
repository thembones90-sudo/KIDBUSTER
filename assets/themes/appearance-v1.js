(function(){
 'use strict';
 var key='pathfinder_appearance_v1',allowed=['light','dark','system'],choice='system';
 var media=window.matchMedia('(prefers-color-scheme: dark)');
 try{var saved=localStorage.getItem(key);if(allowed.includes(saved))choice=saved;}catch(e){}
 function apply(){
  var resolved=choice==='system'?(media.matches?'dark':'light'):choice;
  document.documentElement.dataset.appearance=resolved;
  document.documentElement.dataset.appearanceChoice=choice;
  document.documentElement.style.colorScheme=resolved;
  document.querySelectorAll('[data-appearance-option]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.appearanceOption===choice));});
  document.querySelectorAll('.appearance-hint').forEach(function(hint){hint.textContent=choice==='system'?'Following your device’s '+resolved+' appearance.':'Your '+resolved+' appearance is saved on this browser.';});
 }
 // Synchronous head script: resolve appearance before the first paint.
 apply();
 media.addEventListener('change',function(){if(choice==='system')apply();});
 window.addEventListener('storage',function(event){if(event.key===key||event.key===null){choice=allowed.includes(event.newValue)?event.newValue:'system';apply();}});
 document.addEventListener('DOMContentLoaded',function(){
  function controls(panel,before,suffix){if(!panel)return;
  var section=document.createElement('section');section.className='appearance-settings';section.setAttribute('aria-labelledby','appearanceTitle');
  var heading=document.createElement('h3');heading.id='appearanceTitle'+suffix;heading.textContent='Appearance';section.setAttribute('aria-labelledby',heading.id);
  var group=document.createElement('div');group.className='appearance-options';group.setAttribute('role','group');group.setAttribute('aria-label','Choose appearance');
  [['light','Light','☀'],['dark','Dark','☾'],['system','System','◐']].forEach(function(option){
   var button=document.createElement('button');button.type='button';button.dataset.appearanceOption=option[0];
   var icon=document.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent=option[2];button.append(icon,document.createTextNode(option[1]));
   button.addEventListener('click',function(){choice=option[0];try{localStorage.setItem(key,choice);}catch(e){}apply();});group.append(button);
  });
  var hint=document.createElement('p');hint.className='appearance-hint';hint.setAttribute('role','status');
  section.append(heading,group,hint);panel.insertBefore(section,before);
  }
  var panel=document.getElementById('accountPanel');controls(panel,panel&&panel.querySelector('.account-grid'),'');
  var access=document.querySelector('#licenseModalOverlay .access-modal');controls(access,access&&access.querySelector('.license-modal-trust'),'-access');
  apply();
 });
})();
