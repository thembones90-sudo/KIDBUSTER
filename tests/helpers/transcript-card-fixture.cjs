'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'../..');
module.exports=async function({port=0,preview=false}={}){
 const start='2026-10-24T10:59:00Z',end='2026-10-24T11:25:00Z';
 const state={actions:[],scout:[
  {meetingId:'rv:00000000-0000-4000-8000-000000000001',studentLabel:'Jackie',title:'Classbuster Scout lesson 2026-10-24',startedAt:start,endedAt:end,durationSeconds:1560,contentPreview:'[00:05] TEACHER: Hello, Jackie. Today we practiced describing pictures and answering questions.'},
  {meetingId:'rv:00000000-0000-4000-8000-000000000002',title:'Classbuster Scout lesson 2026-10-24',startedAt:start,endedAt:end,durationSeconds:1560,contentPreview:'[00:05] TEACHER: Hello, Jamie. A name heard in speech is not an explicit student label.'}
 ],krisp:[{meetingId:'synthetic-krisp',title:'Afternoon lesson',detectedStudentName:'Jackie',meetingStartTime:start,durationSeconds:1560,contentPreview:'Jackie practiced describing pictures and answering questions about the story.'}]};
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const json=(data,code=200)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='POST'){let body='';for await(const p of req)body+=p;state.actions.push({path:url.pathname,body});return json({error:'Fixture is read-only'},409);}
  if(url.pathname==='/api/license-status')return json({status:'active',plan:'pro',founder:true});
  if(url.pathname==='/api/krisp-session')return json({pending:state.krisp,waiting:true});
  if(url.pathname==='/api/radar-van-session')return json({enabled:true,connected:true,automatic:true,inboxOnly:true,matched:null,inboxPending:state.scout,waitingCount:state.scout.length});
  if(url.pathname.startsWith('/api/'))return json({},403);
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json({},404);
  res.setHeader('content-type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');
  let data=fs.readFileSync(file);
  if(preview&&file.endsWith('index.html'))data=Buffer.from(data.toString().replace('</head>',"<script>localStorage.setItem('kidbuster_access_key','synthetic-card-preview');</script></head>"));
  res.end(data);
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 return {server,state,url:'http://127.0.0.1:'+server.address().port};
};
if(require.main===module)module.exports({port:47831,preview:true}).then(x=>console.log('Synthetic transcript-card preview: '+x.url));
