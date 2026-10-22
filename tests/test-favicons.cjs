'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async function(){
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const size of [16,32,48,180]){
  const href='assets/brand/classbuster/'+(size===180?'apple-touch-icon.png':'classbuster-icon-dark-'+size+'.png');
  assert.ok(html.includes('sizes="'+size+'x'+size+'" href="'+href+'"'));
  const png=fs.readFileSync(path.join(root,href));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 }
 const ico=fs.readFileSync(path.join(root,'assets/brand/classbuster/favicon.ico'));
 assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);
 const sizes=new Set();
 for(let i=0;i<ico.readUInt16LE(4);i++){
  const at=6+i*16,size=ico[at]||256;sizes.add(size);
  assert.equal(ico[at],ico[at+1]);
  const length=ico.readUInt32LE(at+8),offset=ico.readUInt32LE(at+12);
  assert.ok(length>0&&offset+length<=ico.length,'valid embedded icon bounds');
 }
 for(const size of [16,32,48,64,128,256])assert.ok(sizes.has(size));
 assert.ok(!html.includes('assets/icons/pathfinder-compass-v2'),'no stale browser branding');
 console.log('PASS Classbuster favicon links, PNG dimensions and multi-size ICO integrity');return 0;
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(e=>{console.error(e);process.exitCode=1;});
