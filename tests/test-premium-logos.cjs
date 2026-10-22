'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
module.exports=async function(){
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const mapping=Object.fromEntries(['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY'].map(key=>[key,'classbuster-horizontal-transparent.png']));
  const prefix='assets/brand/classbuster/';
  assert.ok(Buffer.byteLength(html)<600*1024,'do not embed large raster logos in HTML');
  for(const name of new Set([...Object.values(mapping)])){
    const png=fs.readFileSync(path.join(root,prefix,name));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png[25],6,'RGBA PNG required');
    assert.ok(png.readUInt32BE(16)>1000);
  }
  assert.ok(html.includes('href="assets/brand/classbuster/classbuster-icon-dark-32.png"'));
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('{}');}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
    browser=await require('puppeteer').launch({headless:true,executablePath,args:['--no-sandbox']});
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.setViewport({width:1440,height:1000});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    for(const [protocol,file] of Object.entries(mapping)){
      await page.evaluate(key=>document.querySelector('#protocolSelect input[value="'+key+'"]').click(),protocol);
      await page.waitForFunction(expected=>{const img=document.getElementById('kbLogo');return img.src.endsWith(expected)&&img.complete&&img.naturalWidth>0;},{timeout:10000},prefix+file);
      const pixels=await page.evaluate(()=>{
        const img=document.getElementById('kbLogo'),canvas=document.createElement('canvas');
        canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
        return {corner:ctx.getImageData(0,0,1,1).data[3],width:img.getBoundingClientRect().width};
      });
      assert.equal(pixels.corner,0);assert.ok(pixels.width>100);
      console.log('PASS premium logo '+protocol);
    }
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);
    await page.reload({waitUntil:'load'});
    const repeated=await page.evaluate(()=>{
      if(prefersReducedMotion)throw Error('Animation guard must be tested with motion enabled');
      const img=document.getElementById('kbLogo');let calls=0;img.animate=()=>{calls++;};updateLogo();updateLogo();return calls;
    });
    assert.equal(repeated,0,'same logo must not replay its animation');
    await page.evaluate(()=>document.querySelector('#protocolSelect input[value="MA"]').click());
    for(const width of [1440,1024,768,390,320]){
      await page.setViewport({width,height:1000});
      const layout=await page.evaluate(()=>{
        const logo=document.getElementById('kbLogo').getBoundingClientRect();
        return {left:logo.left,right:logo.right,width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};
      });
      assert.ok(layout.left>=0&&layout.right<=layout.width,'logo stays inside viewport at '+width);
      assert.ok(layout.overflow<=1,'no horizontal overflow at '+width);
      if(process.env.V2_LOGO_SCREENSHOTS&&[1440,390].includes(width))await page.screenshot({path:path.join(process.env.V2_LOGO_SCREENSHOTS,'premium-logo-'+width+'.png')});
    }
    const icon=await page.evaluate(async()=>{
      const img=new Image();img.src=document.querySelector('link[rel="icon"][sizes="48x48"]').href;await img.decode();return [img.naturalWidth,img.naturalHeight];
    });
    assert.deepEqual(icon,[48,48]);
    assert.deepEqual(errors,[]);
    console.log('PASS compass favicon, transparent logos, responsive layout and unchanged-logo animation guard');
    return 0;
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
};
if(require.main===module)module.exports().then(n=>process.exitCode=n).catch(error=>{console.error(error);process.exitCode=1;});
