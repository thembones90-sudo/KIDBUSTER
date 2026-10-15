// V2-local-only owner alias bridge. No production requests or key sharing.
// Provides a second local preview at 127.0.0.1:8766 without restarting 8765.
'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const dir=path.resolve(__dirname,'..','.v2-local');
const aliasFile=path.join(dir,'v2-owner-alias.txt');
const primaryFile=path.join(dir,'v2-owner-key.txt');
const PORT=8766,UPSTREAM_PORT=8765;
const allowedHosts=new Set(['127.0.0.1:'+PORT,'localhost:'+PORT]);
const ownerAliases=['http://127.0.0.1:'+PORT,'http://localhost:'+PORT];
function matches(a,b){
  const x=Buffer.from(String(a||''),'utf8'),y=Buffer.from(String(b||''),'utf8');
  return x.length===y.length && crypto.timingSafeEqual(x,y);
}
function deny(res,status,message){
  res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify({error:message}));
}
http.createServer((req,res)=>{
  if(!allowedHosts.has(req.headers.host)){
    deny(res,403,'Local V2 access only.');return;
  }
  if(req.headers['sec-fetch-site']==='cross-site' ||
      (req.headers.origin && !ownerAliases.includes(req.headers.origin))){
    deny(res,403,'Cross-site requests blocked.');return;
  }
  if(req.method==='OPTIONS'){deny(res,403,'Cross-site requests blocked.');return;}
  let headerKey=String(req.headers['x-app-key']||'');
  const alias=fs.readFileSync(aliasFile,'utf8').trim();
  const realOwner=fs.readFileSync(primaryFile,'utf8').trim();
  if(matches(headerKey,alias))headerKey=realOwner;
  const headers={...req.headers,host:'127.0.0.1:'+UPSTREAM_PORT};
  if(req.headers['x-app-key'])headers['x-app-key']=headerKey;
  if(req.headers.origin)headers.origin='http://127.0.0.1:'+UPSTREAM_PORT;
  delete headers.cookie;
  const upstream=http.request({host:'127.0.0.1',port:UPSTREAM_PORT,path:req.url,method:req.method,headers},response=>{
    const outputHeaders={...response.headers,'cache-control':'no-store'};
    delete outputHeaders['set-cookie'];
    res.writeHead(response.statusCode||502,outputHeaders);
    response.pipe(res);
  });
  upstream.on('error',()=>{
    if(!res.headersSent)deny(res,502,'The underlying V2 preview is offline.');
    else res.destroy();
  });
  req.pipe(upstream);
}).listen(PORT,'127.0.0.1',()=>console.log('V2 owner alias is enabled at http://127.0.0.1:'+PORT+'/ (localhost only, original 8765 untouched)'));
