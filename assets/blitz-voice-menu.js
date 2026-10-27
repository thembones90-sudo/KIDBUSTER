(function(){
  'use strict';
  var select=document.getElementById('blitzVoiceSelect');
  if(!select)return;
  var control=document.createElement('div');control.className='scout-voice-control';
  var trigger=document.createElement('button');trigger.type='button';trigger.className='scout-voice-trigger';
  trigger.id='blitzVoiceTrigger';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-label','Voice');trigger.setAttribute('aria-controls','blitzVoiceOptions');
  var list=document.createElement('div');list.id='blitzVoiceOptions';list.className='scout-voice-options';
  list.setAttribute('role','listbox');list.setAttribute('aria-label','Voice');list.hidden=true;
  var buttons=Array.from(select.options).map(function(option){
    var button=document.createElement('button');button.type='button';button.setAttribute('role','option');
    button.dataset.value=option.value;button.textContent=option.textContent;
    button.addEventListener('click',function(){
      select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));close(true);
    });list.appendChild(button);return button;
  });
  function sync(){
    trigger.textContent=select.options[select.selectedIndex].textContent;
    buttons.forEach(function(button){button.setAttribute('aria-selected',String(button.dataset.value===select.value));});
  }
  function close(focus){list.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}
  function open(){sync();list.hidden=false;trigger.setAttribute('aria-expanded','true');buttons[Math.max(0,select.selectedIndex)].focus();}
  trigger.addEventListener('click',function(){if(list.hidden)open();else close(false);});
  control.addEventListener('keydown',function(event){
    var index=buttons.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();close(true);}
    else if(event.key==='Tab')close(false);
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(list.hidden){open();return;}
      buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    }else if(event.key==='Home'||event.key==='End'){
      event.preventDefault();if(list.hidden)open();buttons[event.key==='Home'?0:buttons.length-1].focus();
    }
  });
  document.addEventListener('click',function(event){if(!control.contains(event.target))close(false);});
  select.addEventListener('change',sync);
  document.querySelectorAll('input[name="protocol"]').forEach(function(radio){radio.addEventListener('change',function(){close(false);sync();});});
  // Keep the existing select as the sole saved/prompt value and change handler.
  select.hidden=true;select.insertAdjacentElement('afterend',control);control.append(trigger,list);
  var label=document.querySelector('label[for="blitzVoiceSelect"]');if(label)label.htmlFor=trigger.id;
  sync();
})();
