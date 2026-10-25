(function(){
  'use strict';
  var canvas=document.querySelector('.wrap');
  if(!canvas)return;
  // Native popovers use viewport coordinates and stay outside the scaled canvas.
  canvas.querySelectorAll('[popover]').forEach(function(panel){document.body.appendChild(panel);});
  var scheduled=false;
  function fit(){
    scheduled=false;
    canvas.style.zoom='1';
    var padding=32;
    var width=canvas.offsetWidth;
    var height=canvas.offsetHeight;
    var scale=Math.min(1,(document.documentElement.clientWidth-padding)/width,(window.innerHeight-padding)/height);
    var zoom=String(Math.max(0.01,Math.floor(scale*10000)/10000));
    if(canvas.style.zoom!==zoom)canvas.style.zoom=zoom;
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(fit);}}
  window.addEventListener('resize',schedule);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',schedule);
  if(window.ResizeObserver)new ResizeObserver(schedule).observe(canvas);
  if(document.fonts)document.fonts.ready.then(schedule);
  fit();
})();
