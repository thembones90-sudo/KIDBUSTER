'use strict';
// Reproducible size conversions of the approved compass; no new logo artwork.
const fs=require('node:fs'),path=require('node:path');
async function build(){
 const root=path.resolve(__dirname,'..'),dir=path.join(root,'assets/icons');
 const source=fs.readFileSync(path.join(root,'assets/logos/premium-v1/compass-classic.png'));
 const browser=await require('puppeteer').launch({headless:true,executablePath:['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync),args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  const rendered=await page.evaluate(async data=>{
   const img=new Image();img.src=data;await img.decode();
   return [16,32,48,180].map(size=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,0,0,size,size);return {size,data:canvas.toDataURL('image/png').split(',')[1]};
   });
  },'data:image/png;base64,'+source.toString('base64'));
  fs.mkdirSync(dir,{recursive:true});
  const images=rendered.map(({size,data})=>({size,png:Buffer.from(data,'base64')}));
  for(const {size,png} of images) fs.writeFileSync(path.join(dir,'pathfinder-compass-v2-'+size+'.png'),png);
  const icons=images.filter(i=>i.size<=48),header=Buffer.alloc(6+16*icons.length);
  header.writeUInt16LE(1,2);header.writeUInt16LE(icons.length,4);let offset=header.length;
  icons.forEach(({size,png},i)=>{
   const at=6+i*16;header[at]=header[at+1]=size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);
   header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;
  });
  fs.writeFileSync(path.join(dir,'pathfinder-compass-v2.ico'),Buffer.concat([header,...icons.map(i=>i.png)]));
  console.log('Built approved compass favicons: 16, 32, 48, 180px and multi-size ICO.');
 }finally{await browser.close();}
}
build().catch(e=>{console.error(e);process.exit(1);});
