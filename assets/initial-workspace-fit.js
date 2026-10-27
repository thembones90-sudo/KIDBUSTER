(function(){
  'use strict';
  var canvas=document.querySelector('.wrap');
  var output=document.getElementById('outputBox');
  var account=document.getElementById('accountPanel');
  if(!canvas||!output||!account)return;
  // Top-layer dialogs belong outside the zoomed workspace, like the existing
  // Krisp integration panel. Move the same nodes once: handlers/IDs stay intact.
  canvas.querySelectorAll('[popover]').forEach(function(panel){document.body.appendChild(panel);});
  var marker='initial-workspace-fit';
  var scheduled=false;
  var workspaceSize=null;
  function visible(element){return !element.hidden&&getComputedStyle(element).display!=='none';}
  function measure(){
    // Measure the Classic control slots for every protocol, then restore styles
    // synchronously before paint. No selection, handler or DOM parent changes.
    var restored=[];
    function temporary(id,property,value){
      var element=document.getElementById(id);if(!element)return;
      restored.push([element,property,element.style.getPropertyValue(property)]);
      element.style.setProperty(property,value);
    }
    var sidebar=canvas.querySelector('.grid>div:first-child>.panel');
    restored.push([sidebar,'height',sidebar.style.height]);sidebar.style.height='auto';
    temporary('lengthFormatField','display','block');
    temporary('lengthFormatField','height','139px');
    temporary('lengthFormatField','overflow','hidden');
    ['blitzVoiceField','preplyModuleField','studentGenderField','protocolFormatField','preplyTrialPersonField'].forEach(function(id){temporary(id,'display','none');});
    temporary('ratingField','display','block');
    temporary('ratingTrack','height','86px');
    temporary('ratingTrack','min-height','86px');
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
    var size={width:canvas.offsetWidth,height:canvas.offsetHeight,sidebar:sidebar.offsetHeight};
    caption.style.minHeight=previous;
    restored.forEach(function(item){if(item[2])item[0].style.setProperty(item[1],item[2]);else item[0].style.removeProperty(item[1]);});
    return size;
  }
  function refresh(){
    scheduled=false;
    document.documentElement.classList.add(marker);
    document.body.classList.add(marker);
    // Keep the empty workspace's reference dimensions during generation and
    // after completion. Report length must never change the display scale.
    if((output.classList.contains('empty')&&!visible(account))||!workspaceSize){
      canvas.style.zoom='1';
      workspaceSize=measure();
    }
    var size=workspaceSize;
    canvas.style.setProperty('--workspace-sidebar-height',size.sidebar+'px');
    // Allow for body padding and device-pixel rounding of scaled borders.
    // Never sacrifice readability to fit a tall form into a short window.
    // Scroll the page instead. All protocols still share the Classic envelope.
    var narrow=window.matchMedia('(max-width:860px)').matches;
    var scale=narrow?1:Math.min(1,(document.documentElement.clientWidth-48)/size.width,Math.max(.8,(window.innerHeight-48)/size.height));
    var fitted=String(Math.max(0.01,Math.floor(scale*10000)/10000));
    canvas.style.setProperty('--workspace-scale',fitted);
    canvas.style.zoom=fitted;
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(refresh);}}
  // Menus/dialogs must not unscale the workspace underneath them.
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
