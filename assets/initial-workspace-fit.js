(function(){
  'use strict';
  var canvas=document.querySelector('.wrap');
  var output=document.getElementById('outputBox');
  var account=document.getElementById('accountPanel');
  if(!canvas||!output||!account)return;
  var marker='initial-workspace-fit';
  var scheduled=false;
  var workspaceSize=null;
  function visible(element){return !element.hidden&&getComputedStyle(element).display!=='none';}
  function workspace(){
    return !Array.from(document.querySelectorAll('.license-modal-overlay')).some(visible)&&
      !document.querySelector('[popover]:popover-open');
  }
  function release(){
    document.documentElement.classList.remove(marker);
    document.body.classList.remove(marker);
    canvas.style.removeProperty('zoom');
  }
  function measure(){
    var caption=document.getElementById('ratingCaption');
    var previous=caption.style.minHeight;
    if(caption.offsetWidth){
      // Reserve every possible rating explanation, without replacing any real
      // controls or changing their content, selection or event handlers.
      var probe=document.createElement('div');
      probe.className='rating-caption';
      probe.setAttribute('aria-hidden','true');
      probe.style.cssText='position:absolute;visibility:hidden;pointer-events:none;margin:0;min-height:0;opacity:1;width:'+caption.offsetWidth+'px';
      caption.parentElement.appendChild(probe);
      var height=0;
      [KidbusterCore.LEVEL_TONE_DESC,KidbusterCore.OF_QUALITATIVE_TIER_DESC].forEach(function(descriptions){
        Object.keys(descriptions).forEach(function(key){
          var verdict=document.createElement('span');verdict.className='verdict';
          verdict.textContent=VERDICT_LABEL[key]||OF_TIER_VERDICT[key]||'';
          probe.replaceChildren(verdict,document.createTextNode(' '+descriptions[key]));
          height=Math.max(height,probe.offsetHeight);
        });
      });
      probe.remove();
      caption.style.minHeight=height+'px';
    }
    var size={width:canvas.offsetWidth,height:canvas.offsetHeight};
    caption.style.minHeight=previous;
    return size;
  }
  function refresh(){
    scheduled=false;
    if(!workspace()){release();return;}
    document.documentElement.classList.add(marker);
    document.body.classList.add(marker);
    // Keep the empty workspace's reference dimensions during generation and
    // after completion. Report length must never change the display scale.
    if((output.classList.contains('empty')&&!visible(account))||!workspaceSize){
      canvas.style.zoom='1';
      workspaceSize=measure();
    }
    var size=workspaceSize;
    // Allow for body padding and device-pixel rounding of scaled borders.
    var scale=Math.min(1,(document.documentElement.clientWidth-48)/size.width,(window.innerHeight-48)/size.height);
    canvas.style.zoom=String(Math.max(0.01,Math.floor(scale*10000)/10000));
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}}
  // Release before the existing handlers position/open their original views.
  // No existing application handler or DOM parent is replaced.
  document.addEventListener('click',function(event){
    var button=event.target.closest('.header-actions button');
    if(button&&button.id!=='accountBtn')release();
  },true);
  new MutationObserver(refresh).observe(output,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
  var visibilityObserver=new MutationObserver(refresh);
  [account].concat(Array.from(document.querySelectorAll('.license-modal-overlay'))).forEach(function(panel){
    visibilityObserver.observe(panel,{attributes:true,attributeFilter:['style','hidden']});
  });
  document.querySelectorAll('[popover]').forEach(function(panel){panel.addEventListener('toggle',refresh);});
  document.addEventListener('change',schedule);
  window.addEventListener('resize',schedule);
  if(window.visualViewport)window.visualViewport.addEventListener('resize',schedule);
  if(window.ResizeObserver)new ResizeObserver(schedule).observe(canvas);
  if(document.fonts)document.fonts.ready.then(schedule);
  refresh();
})();
