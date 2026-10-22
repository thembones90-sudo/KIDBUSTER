/* First-use guide. Eligibility comes only from authenticated account status. */
(() => {
  'use strict';
  const overlay = document.createElement('div');
  overlay.className='cb-tour-overlay'; overlay.id='cbOnboardingOverlay'; overlay.hidden=true;
  overlay.innerHTML=`<section class="cb-tour" role="dialog" aria-modal="true" aria-labelledby="cbTourTitle" aria-describedby="cbTourDescription">
    <header class="cb-tour-top"><div class="cb-brand"><img src="/assets/brand/classbuster/classbuster-icon-dark-48.png" alt=""><span>Classbuster<small>A quick introduction</small></span></div><button class="cb-close" type="button" aria-label="Close introduction">×</button></header>
    <ol class="cb-progress" aria-label="Introduction progress"><li aria-label="1. Welcome"></li><li aria-label="2. Your first report"></li><li aria-label="3. Meet Scout"></li><li aria-label="4. You're ready"></li></ol>
    <div id="cbTourContent"></div>
    <p class="cb-save-status" id="cbTourSaveStatus" role="status"></p>
  </section>`;
  document.body.append(overlay);
  const syncNotice=document.createElement('p');
  syncNotice.className='cb-onboarding-sync';syncNotice.setAttribute('role','status');syncNotice.hidden=true;
  document.querySelector('.scout-workspace-entry')?.after(syncNotice);
  const panel=overlay.querySelector('.cb-tour'),content=document.getElementById('cbTourContent');
  const progress=overlay.querySelector('.cb-progress');
  let account=null,accountKey=null,step=0,mode='replay',choice='skipped',opener=null,overflow='';
  let inertNodes=[],saving=false,retryTimer=null;
  const seen=new Set(),receipts=new Map();
  const readKey=()=>getStoredAccessKey();
  function updateHeader(){
    let completed=false;
    try{completed=localStorage.getItem(HELP_COMPLETED_KEY)==='1';}catch{}
    if(account) completed=!account.eligible||['completed','skipped'].includes(account.state)||!!receipt(account.accountId);
    updateHelpButton(completed);
  }
  function openFromHeader(){
    if(document.getElementById('helpBtn')?.classList.contains('onboarding-done')) return false;
    const pending=account?.eligible&&account.state==='pending'&&!receipt(account.accountId)&&accountKey===readKey();
    open(pending?'first':'replay');
    return true;
  }
  function updateSyncNotice(){
    syncNotice.hidden=!account||!receipt(account.accountId)?.pending;
    syncNotice.textContent=syncNotice.hidden?'':'Your introduction choice is saved in this browser. We’ll sync it to your account when the connection is ready.';
  }
  function receipt(id){
    if(receipts.has(id)) return receipts.get(id);
    try{return JSON.parse(localStorage.getItem('classbuster.onboarding.v1.'+id)||'null');}catch{return null;}
  }
  function store(id,value){
    receipts.set(id,value);
    try{localStorage.setItem('classbuster.onboarding.v1.'+id,JSON.stringify(value));}catch{/* Session memory still prevents repeated prompts. */}
  }
  async function sync(){
    if(saving||!account||accountKey!==readKey()) return;
    const id=account.accountId,key=accountKey,value=receipt(id);
    if(!value?.pending) return;
    saving=true;
    try{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
      let response;
      try{response=await fetch('/api/license-status',{method:'POST',headers:{'Content-Type':'application/json','x-app-key':key,'x-installation-id':getAccessInstallationId()},body:JSON.stringify({action:'onboarding',state:value.state}),signal:controller.signal});}finally{clearTimeout(timeout);}
      const data=await response.json();
      if(response.ok&&['completed','skipped'].includes(data.onboarding?.state)){
        store(id,{state:data.onboarding.state,pending:false});
        if(account?.accountId===id) account.state=data.onboarding.state;
      }
    }catch{/* Keep the account-scoped receipt and retry without blocking work. */}
    finally{saving=false;updateSyncNotice();updateHeader();}
    clearTimeout(retryTimer);
    if(account&&receipt(account.accountId)?.pending) retryTimer=setTimeout(sync,30000);
  }
  function finish(state){
    if(mode!=='scout'){
      try{localStorage.setItem(HELP_COMPLETED_KEY,'1');}catch{}
    }
    if(mode==='first'&&account&&accountKey===readKey()){
      store(account.accountId,{state,pending:true}); seen.add(account.accountId); sync();
      updateSyncNotice();
    }
    updateHeader();close();
  }
  function close(){
    overlay.hidden=true;
    document.body.style.overflow=overflow;
    for(const [node,prior] of inertNodes) node.inert=prior;
    inertNodes=[];
    if(opener?.isConnected&&!opener.closest('[hidden]')) opener.focus({preventScroll:true});
    else document.getElementById('helpBtn')?.focus({preventScroll:true});
  }
  function open(kind,start=0){
    if(!overlay.hidden) return;
    mode=kind;step=start;choice='skipped';
    opener=document.activeElement;
    // Reuse the existing help panel as the replay entry, not a second header.
    if(typeof closeHelpModal==='function'&&getComputedStyle(document.getElementById('helpModalOverlay')).display!=='none'){
      closeHelpModal();opener=document.getElementById('helpBtn');
    }
    overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    inertNodes=Array.from(document.body.children).filter(n=>n!==overlay&&n.tagName!=='SCRIPT'&&n.tagName!=='STYLE'&&n.tagName!=='LINK').map(n=>[n,n.inert]);
    for(const [node] of inertNodes) node.inert=true;
    overlay.hidden=false;render();
  }
  function releaseBlock(){
    return `<div class="cb-release"><strong data-release-title>Scout is coming soon</strong><p data-release-copy>The verified Windows installer isn’t available yet. You can use every available Classbuster report feature without it.</p><a class="cb-button cb-primary" data-scout-download hidden target="_blank" rel="noopener noreferrer">Install Scout for Windows</a><p class="cb-checksum" data-release-checksum hidden></p></div>`;
  }
  function updateRelease(){
    const release=window.ClassbusterScoutRelease;
    const link=content.querySelector('[data-scout-download]');
    if(!release||!link)return;
    content.querySelector('[data-release-title]').textContent='Scout for Windows · Version '+release.version;
    content.querySelector('[data-release-copy]').textContent='Download the installer, open it, and follow the Windows instructions. Installing Scout is optional.';
    link.href=release.downloadUrl;link.hidden=false;
    const checksum=content.querySelector('[data-release-checksum]');checksum.textContent='SHA-256: '+release.sha256;checksum.hidden=false;
    link.onclick=()=>{if(mode!=='scout'){choice='selected';setTimeout(()=>{step=3;render();},0);}};
  }
  function render(){
    const scoutOnly=mode==='scout';
    overlay.querySelector('.cb-close').setAttribute('aria-label',scoutOnly?'Close Scout information':'Close introduction');
    progress.hidden=scoutOnly;
    progress.querySelectorAll('li').forEach((node,i)=>{node.classList.toggle('cb-past',i<step);if(i===step)node.setAttribute('aria-current','step');else node.removeAttribute('aria-current');});
    const eyebrow=scoutOnly?'YOUR OPTIONAL COMPANION':`STEP ${step+1} OF 4`;
    let html='';
    if(step===0)html=`<h2 id="cbTourTitle" tabindex="-1">Welcome to Classbuster</h2><p id="cbTourDescription" class="cb-lead">Your lesson is finished.<br>Let’s make the feedback easier.</p><div class="cb-hero"><span aria-hidden="true">✦</span><div><h3>A few notes. Thoughtful feedback.</h3><p>Turn your lesson notes into professional student feedback, ready for you to review and share.</p></div></div><p>No complicated setup. We’ll show you the essentials.</p><div class="cb-actions"><button class="cb-primary" data-next>Show me around <span aria-hidden="true">→</span></button><button class="cb-quiet" data-skip>Skip introduction</button></div><p class="cb-footnote">You can revisit this introduction from Help &amp; guide anytime.</p>`;
    if(step===1)html=`<h2 id="cbTourTitle" tabindex="-1">Your first report</h2><p id="cbTourDescription">Three small steps. Your own teaching judgment, always.</p><ol class="cb-steps"><li><span class="cb-step-number" aria-hidden="true">1</span><div><h3>Choose a report style</h3><p>Classic is a good place to start. Explore the others later.</p></div></li><li><span class="cb-step-number" aria-hidden="true">2</span><div><h3>Add your lesson notes</h3><p>A short summary is enough. Add the student’s name and a performance rating.</p></div></li><li><span class="cb-step-number" aria-hidden="true">3</span><div><h3>Generate, then review</h3><p>Select Generate feedback. Read the report before sharing it.</p></div></li></ol><button class="cb-quiet" id="cbExampleBtn" aria-expanded="false" aria-controls="cbExampleNotes">Show example notes</button><p class="cb-example" id="cbExampleNotes" hidden>Alex practised describing animals. We covered feathers, fur, and claws. Alex answered confidently but needed help with past-tense verbs. Next time: practise three sentences about a favourite animal.</p><div class="cb-actions"><button data-back>Back</button><button class="cb-primary" data-next>Continue <span aria-hidden="true">→</span></button></div>`;
    if(step===2)html=`<h2 id="cbTourTitle" tabindex="-1">Meet Scout</h2><p id="cbTourDescription" class="cb-lead">Less note-taking. More time for teaching.</p><p>Scout is an optional Windows desktop companion that helps turn lesson audio into a transcript. It is designed to transcribe locally on your computer.</p><div class="cb-hero"><span aria-hidden="true">♪</span><div><h3>From your lesson to your next report</h3><p>Use Scout for a lesson, then bring the transcript into Classbuster as your notes.</p></div></div>${releaseBlock()}<p class="cb-footnote">Windows only. No Scout? Simply type or paste your own notes.</p><div class="cb-actions">${scoutOnly?'<button class="cb-primary" data-done>Back to Classbuster</button>':'<button data-back>Back</button><button class="cb-primary" id="cbSkipScout">Not now, continue without Scout</button>'}</div>`;
    if(step===3){
      const reassurance=choice==='selected'?'Your download was requested. Finish installing Scout when you’re ready; Classbuster is ready to use now.':window.ClassbusterScoutRelease?'You can find Scout above your workspace whenever you want to try it.':'Scout is coming soon. Find its information above your workspace anytime. For now, your own notes are all you need.';
      html=`<div class="cb-success" aria-hidden="true">✓</div><h2 id="cbTourTitle" tabindex="-1">You’re ready!</h2><p id="cbTourDescription" class="cb-lead">Your next report starts with your lesson notes.</p><p>${reassurance}</p><div class="cb-hero"><span aria-hidden="true">↗</span><div><h3>Make it yours, one report at a time</h3><p>Choose a style, add your notes, and review the feedback before you share.</p></div></div><div class="cb-actions"><button data-back>Back</button><button class="cb-primary" data-done>Enter Classbuster <span aria-hidden="true">→</span></button></div>`;
    }
    content.innerHTML=`<p class="cb-eyebrow">${eyebrow}</p>`+html;
    const iconPaths=step===2?'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H3v7h4v-7Zm16 0h1v7h-4v-7ZM9 11v4m3-6v8m3-6v4"/>':step===3?'<path d="M6 3h9l4 4v14H6Z M14 3v5h5M9 14l2 2 5-5"/>':'<path d="M12 6c-3-3-7-3-9-2v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-2-1-6-1-9 2Zm0 0v15M6 8h3m-3 4h3m6-4h3m-3 4h3"/>';
    const heroIcon=content.querySelector('.cb-hero>span');
    if(heroIcon)heroIcon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+iconPaths+'</svg>';
    const success=content.querySelector('.cb-success');
    if(success)success.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    if(step===1){
      const trials=document.createElement('p');trials.className='cb-trial-note';
      trials.textContent='Try the styles on Free: 5 Classic reports each month, plus 5 one-time trial reports in each other report style. Each style has its own trial allowance.';
      content.querySelector('#cbTourDescription').after(trials);
    }
    document.getElementById('cbTourSaveStatus').textContent=mode==='first'?'Your introduction is linked to your account.':'';
    content.querySelector('[data-next]')?.addEventListener('click',()=>{step++;render();});
    content.querySelector('[data-back]')?.addEventListener('click',()=>{step--;render();});
    content.querySelector('[data-skip]')?.addEventListener('click',()=>finish('skipped'));
    content.querySelector('[data-done]')?.addEventListener('click',()=>finish('completed'));
    content.querySelector('#cbSkipScout')?.addEventListener('click',()=>{choice='skipped';step=3;render();});
    content.querySelector('#cbExampleBtn')?.addEventListener('click',event=>{
      const example=content.querySelector('#cbExampleNotes');example.hidden=!example.hidden;
      event.currentTarget.setAttribute('aria-expanded',String(!example.hidden));
      event.currentTarget.textContent=example.hidden?'Show example notes':'Hide example notes';
    });
    updateRelease();panel.scrollTop=0;content.querySelector('h2').focus({preventScroll:true});
  }
  overlay.querySelector('.cb-close').addEventListener('click',()=>finish('skipped'));
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish('skipped');return;}
    if(event.key!=='Tab')return;
    const nodes=Array.from(panel.querySelectorAll('button:not(:disabled),a[href],summary')).filter(n=>n.getClientRects().length);
    const first=nodes[0],last=nodes[nodes.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement.tagName==='H2')){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  document.addEventListener('focusin',event=>{if(!overlay.hidden&&!panel.contains(event.target))content.querySelector('h2')?.focus();});
  function accountStatus(data){
    const next=data?.onboarding;
    if(accountKey!==readKey()||account?.accountId!==next?.accountId){
      if(!overlay.hidden&&mode==='first')close();
      clearTimeout(retryTimer);
    }
    account=next||null;accountKey=readKey();
    updateHeader();
    updateSyncNotice();
    if(!account)return;
    if(['completed','skipped'].includes(account.state)){
      store(account.accountId,{state:account.state,pending:false});
      if(!overlay.hidden&&mode==='first')close();
      return;
    }
    if(receipt(account.accountId)){sync();return;}
    if(account.eligible&&account.state==='pending'&&!seen.has(account.accountId)&&overlay.hidden&&data.status==='active'&&!data.expired&&!accountVerificationInProgress){
      // Never place onboarding over checkout/activation controls.
      const access=document.getElementById('licenseModalOverlay');
      if(access&&getComputedStyle(access).display!=='none')return;
      seen.add(account.accountId);open('first');
    }
  }
  window.ClassbusterOnboarding={accountStatus,openFromHeader};
  document.getElementById('replayOnboardingBtn')?.addEventListener('click',()=>open('replay'));
  document.getElementById('helpScoutBtn')?.addEventListener('click',()=>open('scout',2));
  document.getElementById('scoutWorkspaceBtn')?.addEventListener('click',()=>open('scout',2));
  document.addEventListener('classbuster:scout-release',()=>{if(!overlay.hidden&&step===2)updateRelease();});
  document.addEventListener('kidbuster:access-key-saved',()=>{if(accountKey!==readKey())accountStatus(null);});
  window.addEventListener('storage',event=>{
    if(event.key==='kidbuster_access_key'||event.key===null){accountStatus(null);refreshAccountPanel();}
    else if(account&&event.key==='classbuster.onboarding.v1.'+account.accountId){receipts.delete(account.accountId);if(!overlay.hidden&&mode==='first')close();sync();}
  });
  window.addEventListener('online',()=>{sync();refreshAccountPanel();});
  // Consume an already-verified result if it beat this deferred module. Do not
  // issue a duplicate status/activation request while the original is in flight.
  if(onboardingStatusSnapshot&&!accountVerificationInProgress)accountStatus(onboardingStatusSnapshot);
  else updateHeader();
})();
