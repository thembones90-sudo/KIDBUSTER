/* Size the desktop settings panel to the actual space below the header.
   Ratings remain the original native controls, outside the scroll area. */
(() => {
  'use strict';
  const grid=document.querySelector('.wrap>.grid');
  const panel=grid?.querySelector(':scope>div:first-child>.panel');
  if(!panel)return;
  const desktop=matchMedia('(min-width:861px)');
  const settings=document.getElementById('workspaceSettingsScroll');
  const right=grid.querySelector(':scope>div:nth-child(2)');
  const notesPanel=right.querySelector(':scope>.panel:first-child');
  const outputPanel=right.querySelector(':scope>.panel:last-child');
  // Move the existing nodes, never clone controls or replace their listeners.
  // On leaving desktop fitting, restore their exact original document order.
  function scrollRegion(parent,id,label,head,foot){
    const original=[...parent.childNodes],pinned=new Set([...head,...foot]);
    const viewport=document.createElement('div');viewport.id=id;
    viewport.className='workspace-content-scroll';viewport.setAttribute('role','region');
    viewport.setAttribute('aria-label',label);viewport.tabIndex=0;
    function mount(){
      if(viewport.parentNode)return;
      const focus=document.activeElement;
      for(const node of original)if(!pinned.has(node))viewport.append(node);
      parent.append(...head,viewport,...foot);
      if(focus!==document.body&&parent.contains(focus))focus.focus({preventScroll:true});
    }
    function unmount(){
      if(!viewport.parentNode)return;
      const focus=document.activeElement;
      for(const node of original)parent.append(node);
      viewport.remove();
      if(focus!==document.body&&parent.contains(focus))focus.focus({preventScroll:true});
    }
    return {viewport,mount,unmount};
  }
  const notes=scrollRegion(notesPanel,'workspaceNotesScroll','Lesson notes and special remarks',[],[document.getElementById('generateBtn'),document.getElementById('krispIntegrationPanel'),document.getElementById('mobileGenerateBar')]);
  const output=scrollRegion(outputPanel,'workspaceOutputScroll','Report output and feedback',[outputPanel.querySelector('.of-output-heading')],[document.getElementById('actionRow')]);
  let frame=0;
  function fit(){
    frame=0;
    const scroll=settings.scrollTop;
    const notesScroll=notes.viewport.scrollTop,outputScroll=output.viewport.scrollTop;
    document.body.classList.remove('workspace-height-fit');
    // Measure the unrestricted panel before deciding whether it needs fitting.
    const natural=Math.max(panel.getBoundingClientRect().height,right.getBoundingClientRect().height);
    const top=grid.getBoundingClientRect().top+window.scrollY;
    const available=Math.floor(window.innerHeight-top-16);
    if(desktop.matches&&available>=280&&natural>available+1){
      document.documentElement.style.setProperty('--workspace-fit-height',available+'px');
      document.body.classList.add('workspace-height-fit');
      notes.mount();output.mount();
      settings.setAttribute('tabindex','0');
      settings.scrollTop=scroll;
      notes.viewport.scrollTop=notesScroll;output.viewport.scrollTop=outputScroll;
    }else{
      document.documentElement.style.removeProperty('--workspace-fit-height');
      settings.removeAttribute('tabindex');
      notes.unmount();output.unmount();
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
  window.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  desktop.addEventListener('change',schedule);
  const observer=new ResizeObserver(schedule);
  for(const node of document.querySelectorAll('.header,.scout-workspace-entry,#accountPanel,#scoutReleaseBanner'))observer.observe(node);
  new MutationObserver(schedule).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['style','hidden']});
  // Ignore our own region moves, but react to delivered reports, split fields
  // and feedback visibility changes after the regular UI handlers finish.
  new MutationObserver(records=>{
    if(records.some(record=>!['workspaceNotesScroll','workspaceOutputScroll'].includes(record.target.id)&&record.target!==notesPanel&&record.target!==outputPanel))schedule();
  }).observe(right,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','hidden','class']});
  document.fonts.ready.then(schedule);
  schedule();
})();
