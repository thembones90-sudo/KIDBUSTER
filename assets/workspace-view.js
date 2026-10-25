(function(){
  'use strict';
  var key='classbuster_workspace_view',view='original';
  try{if(localStorage.getItem(key)==='columns')view='columns';}catch(e){}
  function size(){
    var grid=document.querySelector('.grid');
    if(grid)document.documentElement.style.setProperty('--workspace-available-height',Math.max(0,window.innerHeight-grid.getBoundingClientRect().top-20)+'px');
  }
  function paint(){
    document.documentElement.dataset.workspaceView=view;
    var button=document.getElementById('workspaceViewToggle');
    if(button){button.textContent=view==='columns'?'Change view: Original layout':'Change view: Three columns';button.setAttribute('aria-pressed',String(view==='columns'));}
    requestAnimationFrame(size);
  }
  paint();
  document.addEventListener('DOMContentLoaded',function(){
    paint();
    window.addEventListener('resize',size);
    if(window.ResizeObserver){var observer=new ResizeObserver(size);observer.observe(document.querySelector('.header'));observer.observe(document.getElementById('accountPanel'));}
    if(document.fonts)document.fonts.ready.then(size);
    document.getElementById('workspaceViewToggle').addEventListener('click',function(){
      view=view==='columns'?'original':'columns';
      try{localStorage.setItem(key,view);}catch(e){}
      var account=document.getElementById('accountBtn');
      if(account&&account.getAttribute('aria-expanded')==='true')account.click();
      paint();
    });
  });
})();
