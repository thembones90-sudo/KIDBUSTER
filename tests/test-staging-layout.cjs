'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createChecker}=require('./helpers/assert.cjs');
module.exports=async function run(){
 const {check,getFailures}=createChecker();
 console.log('\n=== test-staging-layout.cjs ===');
 const root=path.resolve(__dirname,'..');
 const api=path.join(root,'api');
 const ignored=fs.readFileSync(path.join(root,'.vercelignore'),'utf8')
   .split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const serverless=fs.readdirSync(api).filter(n=>n.endsWith('.js')&&
   fs.statSync(path.join(api,n)).isFile()&&!ignored.includes('api/'+n));
 const conf=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 const ping=JSON.parse(fs.readFileSync(path.join(root,'ping.json'),'utf8'));
 const localServer=fs.readFileSync(path.join(root,'tools','v2-local-server.cjs'),'utf8');
 const gitIgnore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
 check('V2 deployment contains at most 12 included API functions',
   serverless.length<=12);
 check('only trivial ping is excluded, while billing/licensing endpoints remain',
   ignored.includes('api/ping.js')&&gitIgnore.includes('/api/ping.js')&&
   !serverless.includes('ping.js')&&
   serverless.includes('license-status.js')&&serverless.includes('payment-webhook.js'));
 check('GET /api/ping rewrites to static JSON with original response',
   conf.rewrites?.some(r=>r.source==='/api/ping'&&r.destination==='/ping.json')&&
   ping.ok===true&&Object.keys(ping).length===1);
 check('local preview handles ping without depending on a deployed API function',
   localServer.includes("if(route==='/api/ping' && req.method==='GET')")&&
   !localServer.includes("'GET /api/ping':'ping.js'"));
 check('staging ignores secrets, local tools, tests and private files',
   ['.v2-local/','.v2-tmp/','tests/','tools/','.env*'].every(x=>ignored.includes(x)));
 check('generation function duration covers the 110 s provider budget (Haiku effort high)',
   conf.functions?.['api/generate.js']?.maxDuration===120);
 return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1)});
