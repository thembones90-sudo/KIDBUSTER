'use strict';
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer');
const {createChecker}=require('./helpers/assert.cjs');

module.exports=async function run(){
  const {check,getFailures}=createChecker();
  console.log('\n=== test-legacy-transfer-browser.cjs ===');
  const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const start=source.indexOf('async function handleLegacyAccountTransfer(){');
  const end=source.indexOf('\nhandleLegacyAccountTransfer();',start);
  if(start<0||end<0){check('transfer handler exists in production HTML',false);return getFailures();}
  const actualFlow=source.slice(start,end)+'\nhandleLegacyAccountTransfer();';
  const setup=[
    "const ACCESS_KEY_STORAGE='kidbuster_access_key';",
    "const outputBox=document.getElementById('output');",
    "function getStoredAccessKey(){return localStorage.getItem(ACCESS_KEY_STORAGE);}",
    "function getAccessInstallationId(){let v=localStorage.getItem('kidbuster_installation_id_v1');if(!v){v='new-device';localStorage.setItem('kidbuster_installation_id_v1',v);}return v;}",
    "function refreshAccountPanel(){window.accountRefreshes=(window.accountRefreshes||0)+1;}",
    "function promptForAccessKey(){window.accessPromptShown=true;return Promise.resolve(null);}",
  ].join('\n');
  const html='<!doctype html><html><head><meta charset="utf-8"></head><body><div id="output"></div><script>'+setup+'\n'+actualFlow+'</script></body></html>';
  let issueCount=0, redeemCount=0, generatedTicket=0;
  const ticket=()=>('secure-opaque-ticket-'+(++generatedTicket)+'-abcdefghijklmnopqrstuvwxyz-0123456789');
  let pending='';
  const browser=await puppeteer.launch({
    headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args:['--no-sandbox']
  });
  try{
    const page=await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request',req=>{
      const u=new URL(req.url());
      if(u.pathname==='/'){
        return req.respond({status:200,contentType:'text/html',body:html});
      }
      if(u.pathname==='/api/license-status'){
        const key=req.headers()['x-app-key']||'';
        const inst=req.headers()['x-installation-id']||'';
        const ok=key==='kb_live_old_pro'?inst==='legacy-device':
          key==='kb_live_current_free'||key==='kb_live_other_pro';
        const p=key==='kb_live_current_free'?'free':'pro';
        return req.respond({status:ok?200:403,contentType:'application/json',
          body:JSON.stringify(ok?{status:'active',expired:false,plan:p}: {error:'invalid'})});
      }
      if(u.pathname==='/api/license-verify'){
        const payload=JSON.parse(req.postData()||'{}');
        if(payload.action==='issue_legacy_transfer'){
          const key=req.headers()['x-app-key'];
          const inst=req.headers()['x-installation-id'];
          if(key!=='kb_live_old_pro'||inst!=='legacy-device'){
            return req.respond({status:400,contentType:'application/json',body:'{"error":"invalid"}'});
          }
          issueCount++;pending=ticket();
          return req.respond({status:200,contentType:'application/json',body:JSON.stringify({ticket:pending})});
        }
        if(payload.action==='redeem_legacy_transfer'){
          redeemCount++;
          if(payload.ticket!==pending){
            return req.respond({status:400,contentType:'application/json',body:'{"error":"expired"}'});
          }
          pending='';
          return req.respond({status:200,contentType:'application/json',
            body:JSON.stringify({licenseKey:'kb_live_old_pro',installationId:'legacy-device',plan:'pro'})});
        }
      }
      return req.respond({status:404,body:''});
    });
    await page.goto('https://classbuster.com/',{waitUntil:'load'});
    await page.evaluate(()=>{
      localStorage.setItem('kidbuster_access_key','kb_live_current_free');
      localStorage.setItem('kidbuster_installation_id_v1','new-device');
    });
    await page.goto('https://kidbuster.vercel.app/',{waitUntil:'load'});
    await page.evaluate(()=>{
      localStorage.setItem('kidbuster_access_key','kb_live_old_pro');
      localStorage.setItem('kidbuster_installation_id_v1','legacy-device');
    });
    try{await page.goto('https://kidbuster.vercel.app/?returning=1',{waitUntil:'load'});}catch(err){}
    // The old host now performs automatic migration after initial render.
    // Do not reload during the in-flight ticket request: that would issue twice.
    await new Promise(resolve=>setTimeout(resolve,250));
    await page.waitForFunction(()=>location.hostname==='classbuster.com'&&
      localStorage.getItem('kidbuster_access_key')==='kb_live_old_pro',{timeout:7000});
    const migrated=await page.evaluate(()=>({
      key:localStorage.getItem('kidbuster_access_key'),
      device:localStorage.getItem('kidbuster_installation_id_v1'),
      url:location.href,message:document.getElementById('output').textContent,
      refreshes:window.accountRefreshes||0
    }));
    check('old browser transfers original Pro license over mistaken new Free',migrated.key==='kb_live_old_pro');
    check('preserves originally claimed manual installation ID',migrated.device==='legacy-device');
    check('access key and installation ID never appear in destination URL',
      !migrated.url.includes('kb_live')&&!migrated.url.includes('legacy-device')&&!migrated.url.includes('ticket'));
    check('new browser reinitializes account data',migrated.refreshes>0);
    check('one issue and one redeem request',issueCount===1&&redeemCount===1);
    await page.goto('https://classbuster.com/',{waitUntil:'load'});
    await page.evaluate(()=>localStorage.setItem('kidbuster_access_key','kb_live_other_pro'));
    await page.goto('https://kidbuster.vercel.app/',{waitUntil:'load'});
    // old account browser credentials remain present.
    await page.goto('https://kidbuster.vercel.app/?reopen=1',{waitUntil:'load'});
    await page.goto('https://kidbuster.vercel.app/#classbuster_transfer_start',{waitUntil:'load'}).catch(()=>{});
    await page.reload({waitUntil:'load'}).catch(()=>{});
    await page.waitForFunction(()=>location.hostname==='classbuster.com'&&document.getElementById('output').textContent.includes('already has active access'),{timeout:7000});
    check('different active Pro account is not overwritten',await page.evaluate(()=>localStorage.getItem('kidbuster_access_key')==='kb_live_other_pro'));
    check('blocked conflicting Pro preserves unused ticket',redeemCount===1);
    const empty=await browser.newPage();
    await empty.setRequestInterception(true);
    empty.on('request',request=>{
      if(new URL(request.url()).pathname==='/')request.respond({status:200,contentType:'text/html',body:html});
      else request.respond({status:404,body:''});
    });
    await empty.goto('https://kidbuster.vercel.app/',{waitUntil:'load'});
    await empty.evaluate(()=>localStorage.removeItem('kidbuster_access_key'));
    await empty.goto('https://kidbuster.vercel.app/?fresh=1#classbuster_transfer_start',{waitUntil:'load'});
    await empty.waitForFunction(()=>window.accessPromptShown===true,{timeout:5000});
    check('no old key gives clear sign-in guidance',await empty.$eval('#output',el=>el.textContent.includes('No old account is signed in')));
  }catch(e){console.log('  FAIL  browser error: '+(e.stack||e));check('legacy browser flow completed',false);}
  finally{await browser.close();}
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exitCode=n?1:0);
