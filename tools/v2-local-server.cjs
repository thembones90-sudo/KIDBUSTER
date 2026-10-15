// Isolated Pathfinder V2 localhost server. Not a production deployment.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'), privateDir=path.join(root,'.v2-local');
fs.mkdirSync(privateDir,{recursive:true});
const ownerFile=path.join(privateDir,'v2-owner-key.txt');
let ownerKey;
if(fs.existsSync(ownerFile))ownerKey=fs.readFileSync(ownerFile,'utf8').trim();
else {ownerKey='kb_v2_owner_'+crypto.randomBytes(24).toString('hex');fs.writeFileSync(ownerFile,ownerKey+'\n',{mode:0o600,flag:'wx'});}
if(!/^kb_v2_owner_[0-9a-f]{48}$/.test(ownerKey))throw new Error('Invalid V2-only owner key.');
delete process.env.KIDBUSTER_TEST_KV;
for(const variable of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','LEMON_SQUEEZY_API_KEY','ANTHROPIC_API_KEY','GOOGLE_SHEET_WEBHOOK_URL','OWNER_LICENSE_KEYS','FOUNDER_LICENSE_KEYS'])delete process.env[variable];
process.env.PATHFINDER_V2_LOCAL_DB=path.join(privateDir,'licenses.json');
const aliasFile=path.join(privateDir,'v2-owner-alias.txt');
const ownerAlias=fs.existsSync(aliasFile)?fs.readFileSync(aliasFile,'utf8').trim():'';
process.env.OWNER_LICENSE_KEYS=[ownerKey,ownerAlias].filter(Boolean).join(',');
process.env.FREE_MONTHLY_LIMIT='5';
const PORT=Number(process.env.V2_DEV_PORT||8765),HOST='127.0.0.1';
const apiPaths={
 'GET /api/license-status':'license-status.js',
 'POST /api/admin-create-license':'admin-create-license.js',
 'POST /api/admin-license-lookup':'admin-license-lookup.js'
};
function json(res,code,body){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));}
async function api(req,res,file){
 let raw='';
 if(req.method==='POST'){
  try{for await(const chunk of req){raw+=chunk.toString('utf8');if(raw.length>32768){json(res,413,{error:'Input too large'});return;}}}
  catch{json(res,400,{error:'Unable to read request'});return;}
 }
 let body={};if(raw){try{body=JSON.parse(raw);}catch{json(res,400,{error:'Invalid JSON'});return;}}
 const mod=await import(pathToFileURL(path.join(root,'api',file)).href);
 const fakeRes={status(code){this.code=code;return this;},json(value){json(res,this.code||200,value);}};
 await mod.default({method:req.method,headers:req.headers,body,query:{}},fakeRes);
 if(!res.writableEnded)json(res,500,{error:'Handler did not respond'});
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon'};
const app=http.createServer(async(req,res)=>{
 try{
  const allowed=['127.0.0.1:'+PORT,'localhost:'+PORT];
  // A clicked external link can be a cross-site top-level navigation. Allow only
  // document GET navigations, never cross-site subresource/API requests.
  const isDocumentNavigation=req.method==='GET'
    && req.headers['sec-fetch-mode']==='navigate'
    && req.headers['sec-fetch-dest']==='document'
    && !req.headers.origin
    && (req.url==='/'||req.url==='/index.html');
  if(!allowed.includes(req.headers.host)
    || (req.headers['sec-fetch-site']==='cross-site'&&!isDocumentNavigation)
    || (req.headers.origin&&!allowed.some(h=>req.headers.origin==='http://'+h))){
   json(res,403,{error:'Local V2 access only'});return;
  }
  const url=new URL(req.url,'http://127.0.0.1:'+PORT);
  const route=decodeURIComponent(url.pathname);
  if(route==='/__v2/health'&&req.method==='GET'){
   json(res,200,{mode:'isolated-local-v2',status:'ok',ownerConfigured:true,persistentStorage:true});return;
  }
  if(route==='/api/ping' && req.method==='GET'){json(res,200,{ok:true});return;}
  if(route.startsWith('/api/')){
   const file=apiPaths[req.method+' '+route];
   if(!file){json(res,503,{error:'This integration is disabled in isolated V2 local development.'});return;}
   await api(req,res,file);return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'Method not allowed'});return;}
  const name=route==='/'?'index.html':route.slice(1);
  if(name.split(/[\\/]/).some(x=>x.startsWith('.')||['api','tools','node_modules','tests'].includes(x))){
   json(res,404,{error:'Not found'});return;
  }
  const file=path.resolve(root,name),type=mime[path.extname(file).toLowerCase()];
  if(!file.startsWith(root+path.sep)||!type||!fs.existsSync(file)||!fs.statSync(file).isFile()){json(res,404,{error:'Not found'});return;}
  res.writeHead(200,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY'});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(err){
  console.error('Local V2 request error:',err?.message);
  if(!res.headersSent)json(res,500,{error:'Local V2 handler failed'});else res.destroy();
 }
});
app.listen(PORT,HOST,()=>{
 console.log('Pathfinder V2 LOCAL preview: http://'+HOST+':'+PORT+'/');
 console.log('V2 owner code FILE: '+ownerFile);
 console.log('Local database FILE: '+process.env.PATHFINDER_V2_LOCAL_DB);
 console.log('No live integrations or production secrets used.');
});
