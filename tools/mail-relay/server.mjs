import http from 'node:http';
import crypto from 'node:crypto';
const port=Number(process.env.PORT||3000);
const tokens=[process.env.PATHFINDER_MAIL_TOKEN_PROD,process.env.PATHFINDER_MAIL_TOKEN_STAGING].filter(Boolean);
const postmarkToken=process.env.ASOC_POSTMARK_SERVER_TOKEN;
const allowedOrigins=new Set(['https://kidbuster.vercel.app','https://pathfinder-v2-staging-preview.vercel.app']);
const prefix='Use this secure link within 15 minutes to access Pathfinder: ';
const subjects=new Set(['Verify your Pathfinder email','Recover your Pathfinder access']);
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body))}
function equal(a,b){if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function allowed(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')&&tokens.some(t=>equal(t,h.slice(7)))}
function verify(p){
  if(!p||typeof p.to!=='string'||p.to.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.to))return false;
  if(!subjects.has(p.subject)||typeof p.text!=='string'||!p.text.startsWith(prefix)||p.text.length>3000)return false;
  let url;try{url=new URL(p.text.slice(prefix.length).trim())}catch{return false}
  return allowedOrigins.has(url.origin)&&url.pathname==='/'&&url.searchParams.size===1&&url.searchParams.has('access_token')&&/^[A-Za-z0-9_-]{20,500}$/.test(url.searchParams.get('access_token')||'');
}
http.createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health')return json(res,200,{status:'ok'});
 if(req.url!=='/send'||req.method!=='POST')return json(res,404,{error:'Not found'});
 if(!allowed(req))return json(res,401,{error:'Unauthorized'});
 if(!postmarkToken)return json(res,503,{error:'Email unavailable'});
 let raw='';try{for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>5000)return json(res,413,{error:'Too large'})}}catch{return json(res,400,{error:'Invalid request'})}
 let p;try{p=JSON.parse(raw)}catch{return json(res,400,{error:'Invalid JSON'})}
 if(!verify(p))return json(res,400,{error:'Invalid email request'});
 try{
  const r=await fetch('https://api.postmarkapp.com/email',{method:'POST',signal:AbortSignal.timeout(12000),headers:{'X-Postmark-Server-Token':postmarkToken,'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({From:'Pathfinder <pathfinder@asocengine.com>',To:p.to,Subject:p.subject,TextBody:p.text,MessageStream:'outbound',Tag:'pathfinder-access'})});
  const result=await r.json().catch(()=>({}));
  return r.ok&&result.ErrorCode===0?json(res,202,{ok:true}):json(res,502,{error:'Provider rejected message'});
 }catch{return json(res,502,{error:'Email provider unavailable'})}
}).listen(port,'0.0.0.0',()=>console.log('Pathfinder mail relay ready'));
if(!tokens.length||!postmarkToken){console.error('Missing required private configuration');process.exit(1)}
