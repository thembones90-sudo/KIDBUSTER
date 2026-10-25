(function(){
  'use strict';
  var canvas=document.querySelector('.wrap');
  if(!canvas)return;
  // Native popovers use viewport coordinates and stay outside the scaled canvas.
  canvas.querySelectorAll('[popover]').forEach(function(panel){document.body.appendChild(panel);});
  var scheduled=false;
  function measureWorkspace(){
    // Measure an inert empty-report copy. Generated documents must extend the
    // page naturally, without participating in the application's fit scale.
    var sample=canvas.cloneNode(true);
    sample.inert=true;
    sample.setAttribute('aria-hidden','true');
    // Measurement radios must never join the real form's selection groups.
    sample.querySelectorAll('[name]').forEach(function(field){field.removeAttribute('name');});
    sample.style.cssText='position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;margin:0;zoom:1';
    sample.querySelectorAll('.output-box').forEach(function(box){
      box.textContent='';
      box.classList.remove('error','is-generating');
      box.classList.add('empty');
    });
    sample.querySelectorAll('#feedbackCard,#lintResults,#trialStatusBox,#prevReportToggle').forEach(function(panel){panel.style.display='none';});
    document.body.appendChild(sample);
    // Budget for every rating explanation before any rating is selected.
    // Switching to 6 (or another grade) therefore cannot shrink the page.
    var caption=sample.querySelector('#ratingCaption');
    var reserved=caption.offsetHeight;
    [KidbusterCore.LEVEL_TONE_DESC,KidbusterCore.OF_QUALITATIVE_TIER_DESC].forEach(function(descriptions){
      Object.keys(descriptions).forEach(function(key){
        var verdict=document.createElement('span');
        verdict.className='verdict';
        verdict.textContent=VERDICT_LABEL[key]||OF_TIER_VERDICT[key]||'';
        caption.replaceChildren(verdict,document.createTextNode(' '+descriptions[key]));
        reserved=Math.max(reserved,caption.offsetHeight);
      });
    });
    caption.textContent='';
    caption.style.minHeight=reserved+'px';
    var size={width:sample.offsetWidth,height:sample.offsetHeight};
    sample.remove();
    return size;
  }
  function fit(){
    scheduled=false;
    canvas.style.zoom='1';
    var padding=32;
    var size=measureWorkspace();
    var scale=Math.min(1,(document.documentElement.clientWidth-padding)/size.width,(window.innerHeight-padding)/size.height);
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
