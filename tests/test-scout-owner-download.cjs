'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createChecker } = require('./helpers/assert.cjs');
const MASTER='scout-download-synthetic-master';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
module.exports=async function run(){
  const {check,getFailures}=createChecker();
  const keys=['RADAR_VAN_ENABLED','RADAR_VAN_OWNER_SHA256','OWNER_LICENSE_KEYS','FOUNDER_LICENSE_KEYS','BLOB_STORE_ID','KIDBUSTER_TEST_KV'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  process.env.KIDBUSTER_TEST_KV='1';
  process.env.RADAR_VAN_ENABLED='true';
  process.env.RADAR_VAN_OWNER_SHA256=hash(MASTER);
  process.env.OWNER_LICENSE_KEYS=MASTER;
  process.env.FOUNDER_LICENSE_KEYS='different-founder-synthetic';
  delete process.env.BLOB_STORE_ID;
  try {
    const feedback=(await import('../api/feedback.js')).default;
    const call=async (key,method='GET')=>{
      const res={code:200,headers:{},body:null,setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
      await feedback({method,query:{radar:'download'},headers:key?{'x-app-key':key}:{},url:'/api/radar-van-download'},res);
      return res;
    };
    check('no account key cannot mint installer link',(await call(null)).code===401);
    check('ordinary customer cannot mint installer link',(await call('kb_pro_scout')).code===403);
    check('another founder cannot mint installer link',(await call('different-founder-synthetic')).code===403);
    check('only GET allowed',(await call(MASTER,'POST')).code===405);
    const master=await call(MASTER);
    check('master needs private storage (fail closed)',master.code===503);
    check('private download responses never cached',master.headers['cache-control']==='private, no-store');
    process.env.RADAR_VAN_OWNER_SHA256='broken';
    check('malformed fingerprint denies even master',(await call(MASTER)).code===403);
    process.env.RADAR_VAN_ENABLED='false';
    check('feature freeze denies installer to everyone',(await call(MASTER)).code===404);
    const root=path.resolve(__dirname,'..');
    const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const ui=fs.readFileSync(path.join(root,'assets/radar-van-client.js'),'utf8');
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/scout-release.json'),'utf8'));
    const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
    check('owner button sits in the gated Scout account section',
      html.indexOf('id="radarVanDownloadBtn"')>html.indexOf('id="radarVanSection"') &&
      html.indexOf('id="radarVanDownloadBtn"')<html.indexOf('</section>',html.indexOf('id="radarVanSection"')));
    check('browser sends access key via header not query',ui.includes("fetch('/api/radar-van-download'") && ui.includes("'x-app-key': key"));
    check('download is rewritten to existing feedback function',vercel.rewrites.some(x=>x.source==='/api/radar-van-download' && x.destination==='/api/feedback?radar=download'));
    check('public download continues to be unpublished',manifest.available===false && !('downloadUrl' in manifest));
    const downloadHandler=fs.readFileSync(path.join(root,'api/_lib/radar-van-download-handler.js'),'utf8');
    // The version stays private: the page says only "Download Scout".
    check('download button and status show no version',html.includes('>Download Scout</button>') && !/Download Scout \d|10Z[A-Z]/.test(html) && !/download is starting[^']*10Z/.test(ui));
    check('private Scout release points to the verified Windows installer',
      ui.includes('/releases/scout-1.4.9-owner-20261028-r3/ScoutSetup.exe') &&
      downloadHandler.includes('releases/scout-1.4.9-owner-20261028-r3/ScoutSetup.exe') &&
      downloadHandler.includes("filename: 'ScoutSetup.exe'"));
    check('private Scout installer checksum is pinned to the verified artifact',
      downloadHandler.includes('b743fe70b195160912f710fc631e8c24faf198e79401b1fd70ba75a6612cffbb'));
    check('download guidance uses installer branding, not ZIP extraction or RadarVan',
      ui.includes('Run ScoutSetup.exe to install Classbuster Scout') &&
      !ui.includes('Extract the ZIP') && !ui.includes('RadarVan.exe'));
  }catch(e){console.error('owner Scout download regression:',e.message);check('test handler completed',false);}
  finally{for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
  return getFailures();
};
if(require.main===module) module.exports().then(n=>process.exit(n?1:0));
