/* Size the desktop settings panel to the actual space below the header.
   Ratings remain the original native controls, outside the scroll area. */
(() => {
  'use strict';
  const grid=document.querySelector('.wrap>.grid');
  const panel=grid?.querySelector(':scope>div:first-child>.panel');
  if(!panel)return;
  const desktop=matchMedia('(min-width:861px)');
  const settings=document.getElementById('workspaceSettingsScroll');
  let frame=0;
  function fit(){
    frame=0;
    const scroll=settings.scrollTop;
    document.body.classList.remove('workspace-height-fit');
    // Measure the unrestricted panel before deciding whether it needs fitting.
    const natural=panel.getBoundingClientRect().height;
    const top=grid.getBoundingClientRect().top+window.scrollY;
    const available=Math.floor(window.innerHeight-top-16);
    if(desktop.matches&&available>=280&&natural>available+1){
      document.documentElement.style.setProperty('--workspace-fit-height',available+'px');
      document.body.classList.add('workspace-height-fit');
      settings.setAttribute('tabindex','0');
      settings.scrollTop=scroll;
    }else{
      document.documentElement.style.removeProperty('--workspace-fit-height');
      settings.removeAttribute('tabindex');
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
  window.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  desktop.addEventListener('change',schedule);
  const observer=new ResizeObserver(schedule);
  for(const node of document.querySelectorAll('.header,.scout-workspace-entry,#accountPanel,#scoutReleaseBanner'))observer.observe(node);
  new MutationObserver(schedule).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden']});
  document.fonts.ready.then(schedule);
  schedule();
})();
