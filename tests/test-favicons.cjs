'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
module.exports=async function(){
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.goto(pathToFileURL(path.join(root,'index.html')).href);
  for(const size of [16,32,48,180]){
   const href='assets/icons/pathfinder-compass-v2-'+size+'.png';
   assert.ok(html.includes('sizes="'+size+'x'+size+'" href="'+href+'"'));
   const pixels=await page.evaluate(async src=>{
    const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;
    let green=0,transparent=0;for(let i=0;i<p.length;i+=4){if(p[i+1]>p[i+2]*1.5&&p[i+1]>100&&p[i+3]>100)green++;if(p[i+3]===0)transparent++;}
    return {width:img.width,height:img.height,green,transparent};
   },'data:image/png;base64,'+fs.readFileSync(path.join(root,href)).toString('base64'));
   assert.equal(pixels.width,size);assert.equal(pixels.height,size);assert.ok(pixels.green>size*size*.1,'visible green compass at '+size);assert.ok(pixels.transparent>0);
  }
  const ico=fs.readFileSync(path.join(root,'assets/icons/pathfinder-compass-v2.ico'));
  assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),3);
  [16,32,48].forEach((size,i)=>{const at=6+i*16;assert.equal(ico[at],size);assert.equal(ico[at+1],size);
   const png=fs.readFileSync(path.join(root,'assets/icons/pathfinder-compass-v2-'+size+'.png'));
   assert.deepEqual(ico.subarray(ico.readUInt32LE(at+12),ico.readUInt32LE(at+12)+ico.readUInt32LE(at+8)),png);
  });
  assert.ok(!html.includes('sizes="1254x1254"'),'favicon no longer points at the oversized source logo');
  console.log('PASS versioned compass favicon links, decoded dimensions, green artwork, transparency and multi-size ICO');return 0;
 }finally{await browser.close();}
};
if(require.main===module)module.exports().then(n=>process.exit(n?1:0)).catch(e=>{console.error(e);process.exit(1);});
