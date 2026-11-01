'use strict';
const assert=require('node:assert/strict');
const {auditScope,CRITICAL,PROVIDER,REQUIRED}=require('../tools/release/audit-preview-environment.cjs');
module.exports=function run(){
 let failures=0;
 const check=(name,fn)=>{try{fn();console.log('  PASS  '+name)}catch(e){failures++;console.error('  FAIL  '+name+': '+e.message)}};
 const separated=REQUIRED.flatMap(key=>[
   {key,target:['production']},{key,target:['preview']}
 ]);
 check('all necessary variables separately scoped is a pass with remaining manual verification',()=>{
   const r=auditScope(separated);
   assert.equal(r.blocked,false);assert.equal(r.findings.length,0);
   assert.ok(r.verificationStillRequired.length>0);
 });
 check('shared Redis token blocks positive preview testing',()=>{
   const r=auditScope([...separated,{key:'KV_REST_API_TOKEN',target:['preview','production']}]);
   assert.equal(r.blocked,true);
   assert.ok(r.findings.some(x=>x.key==='KV_REST_API_TOKEN'&&x.severity==='BLOCK'));
 });
 check('shared Upstash URLs block, even when the token is scoped',()=>{
   const r=auditScope([...separated,{key:'KV_REST_API_URL',target:['preview','production']}]);
   assert.equal(r.blocked,true);
 });
 check('shared Google Sheets and application access keys also block',()=>{
   for(const key of ['GOOGLE_SHEET_WEBHOOK_URL','APP_ACCESS_KEY']){
     const r=auditScope([...separated,{key,target:['preview','production']}]);
     assert.equal(r.blocked,true,key);
   }
 });
 check('shared Lemon Squeezy secrets block positive testing',()=>{
   const r=auditScope([...separated,{key:'LEMONSQUEEZY_WEBHOOK_SECRET',target:['preview','production']}]);
   assert.ok(r.findings.some(x=>x.severity==='BLOCK'));assert.equal(r.blocked,true);
 });
 check('missing preview variant or test checkout scope blocks',()=>{
   const r=auditScope(separated.filter(x=>!(x.key==='LEMONSQUEEZY_PRO_VARIANT_ID'&&x.target[0]==='preview')));
   assert.equal(r.blocked,true);
 });
 check('missing production redis token blocks',()=>{
   const r=auditScope(separated.filter(x=>!(x.key==='KV_REST_API_TOKEN'&&x.target[0]==='production')));
   assert.equal(r.blocked,true);
 });
 check('unknown/malformed scopes fail closed',()=>{
   assert.throws(()=>auditScope(null),TypeError);
   assert.throws(()=>auditScope([{key:'X',target:'preview'}]),TypeError);
 });
 check('secret values are excluded from computed findings',()=>{
   const r=auditScope([...separated,{key:'KV_REST_API_URL',target:['preview','production'],value:'SENTINEL_SECRET_DO_NOT_PRINT'}]);
   assert.ok(!JSON.stringify(r).includes('SENTINEL_SECRET_DO_NOT_PRINT'));
 });
 check('one shared production-preview record cannot masquerade as two separate values',()=>{
   const without=separated.filter(x=>x.key!=='KV_REST_API_URL');
   const r=auditScope([...without,{key:'KV_REST_API_URL',target:['preview','production']}]);
   assert.equal(r.blocked,true);
 });
 return failures;
};
if(require.main===module)process.exitCode=module.exports()?1:0;
