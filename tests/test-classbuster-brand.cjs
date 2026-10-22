'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const { createChecker } = require('./helpers/assert.cjs');
const hashes = require('./fixtures/classbuster-brand-sha256.json');

module.exports = async function run(){
  const { check, getFailures } = createChecker();
  console.log('\n=== test-classbuster-brand.cjs ===');
  const root = path.resolve(__dirname, '..');
  const brand = '/assets/brand/classbuster/';
  for(const [name, expected] of Object.entries(hashes)){
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, brand, name))).digest('hex');
    check(name + ': approved integration bytes preserved', actual === expected);
  }
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if(!target.startsWith(root + path.sep)){ res.writeHead(403); return res.end(); }
    fs.readFile(target, (err, body) => {
      if(err){ res.writeHead(404); return res.end(); }
      const types = { '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.ico':'image/x-icon', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
      res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
      res.end(body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try{
    browser = await puppeteer.launch({ headless:true, args:['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [], bad = [], external = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if(msg.type() === 'error') errors.push(msg.text()); });
    page.on('response', response => { if(response.status() >= 400) bad.push(response.status() + ' ' + response.url()); });
    page.on('requestfailed', request => {
      (request.url().startsWith(origin) ? bad : external).push(request.url() + ': ' + request.failure()?.errorText);
    });
    await page.goto(origin, { waitUntil:'networkidle2' });
    check('Classbuster page title', await page.title() === 'Classbuster');
    const assets = await page.evaluate(async ({brand, names}) => {
      const result = [];
      for(const name of names){
        const response = await fetch(brand + name);
        const item = {name, ok:response.ok};
        if(/\.(png|jpg|ico)$/.test(name)){
          const image = new Image(); image.src = brand + name;
          try{
            await image.decode(); item.width=image.naturalWidth; item.height=image.naturalHeight;
            const canvas=document.createElement('canvas');canvas.width=item.width;canvas.height=item.height;
            const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
            const pixels=ctx.getImageData(0,0,item.width,item.height).data;
            let transparent=0,visible=0;
            for(let i=3;i<pixels.length;i+=4){ if(pixels[i]===0)transparent++;if(pixels[i]>0)visible++; }
            item.transparent=transparent;item.visible=visible;
          }catch(err){item.error=err.message;}
        }
        if(name.endsWith('.svg')){
          const xml=new DOMParser().parseFromString(await response.text(),'image/svg+xml');
          item.validSvg=!xml.querySelector('parsererror') && xml.documentElement.localName==='svg';
        }
        result.push(item);
      }
      return result;
    }, {brand, names:Object.keys(hashes)});
    for(const item of assets){
      check(item.name + ': HTTP load', item.ok);
      if(/\.(png|jpg|ico)$/.test(item.name)) check(item.name + ': valid nonempty image', !item.error && item.width>0 && item.height>0 && item.visible>0);
      if(item.name.includes('transparent')) check(item.name + ': real alpha transparency', item.transparent>0 && item.visible>0);
      const size=item.name.match(/(?:icon-(?:dark|light|transparent)|maskable)-(\d+)\.png$/);
      if(size) check(item.name + ': declared dimensions', item.width===Number(size[1]) && item.height===Number(size[1]));
      if(item.name.endsWith('.svg')) check(item.name + ': valid XML (reference only)', item.validSvg);
      if(item.name==='apple-touch-icon.png') check('Apple touch icon is 180 x 180',item.width===180 && item.height===180);
    }
    const metadata=await page.evaluate(async () => {
      const manifestUrl=document.querySelector('link[rel=manifest]').href;
      const manifest=await (await fetch(manifestUrl)).json();
      return {manifest, links:[...document.querySelectorAll('link[rel=icon],link[rel=apple-touch-icon]')].map(e=>e.getAttribute('href')), social:document.querySelector('meta[property="og:image"]').content};
    });
    check('manifest name and launch URL',metadata.manifest.name==='Classbuster' && metadata.manifest.start_url==='/');
    check('any and maskable icons at both PWA sizes', ['any','maskable'].every(p=>['192x192','512x512'].every(s=>metadata.manifest.icons.some(i=>i.purpose===p&&i.sizes===s&&i.src.startsWith(brand)))));
    check('favicon and device links use installed kit',metadata.links.length===4 && metadata.links.every(h=>h.startsWith(brand) && hashes[h.split('/').pop()]));
    check('social artwork uses supplied lockup',metadata.social==='https://classbuster.com'+brand+'classbuster-lockup-dark-1600.png');
    const screenshotDir=process.env.CLASSBUSTER_SCREENSHOT_DIR;
    if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
    for(const width of [1440,390,320]){
      await page.setViewport({width,height:900});
      for(const protocol of ['MA','MS','FAIRY','BLITZ','BEIDA','OF','PREPLY']){
        await page.click('input[name="protocol"][value="'+protocol+'"]');
        const view=await page.evaluate(()=>{
          const logo=document.getElementById('kbLogo'), rect=logo.getBoundingClientRect();
          return {src:logo.getAttribute('src'),alt:logo.alt,loaded:logo.complete&&logo.naturalWidth===1600&&logo.naturalHeight===400,overflow:document.documentElement.scrollWidth>innerWidth,ratio:rect.width/rect.height,filter:getComputedStyle(logo).filter};
        });
        check(width+' '+protocol+': official undistorted logo, no overflow',view.src===brand.slice(1)+'classbuster-horizontal-transparent.png'&&view.alt==='Classbuster'&&view.loaded&&!view.overflow&&Math.abs(view.ratio-4)<0.03&&view.filter==='none');
        if(screenshotDir && width!==320)await page.screenshot({path:path.join(screenshotDir,'after-'+width+'-'+protocol+'.png'),fullPage:true});
      }
    }
    const tooltip = await page.$('#protocolSelect .info-icon');
    await tooltip.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    check('mobile focused help tooltip stays inside the viewport', await page.evaluate(()=>{
      const tip=getComputedStyle(document.querySelector('#protocolSelect .info-icon'),'::after');
      return tip.display==='block' && tip.position==='fixed' && document.documentElement.scrollWidth<=innerWidth;
    }));
    await page.evaluate(()=>document.activeElement.blur());
    await page.evaluate(()=>{
      for(const [id,value] of [['teacherName','Brand Test Teacher'],['studentName','Test Student'],['krispNotes','Synthetic draft used only in the local test.']]){
        const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
      }
    });
    const before=await page.evaluate(()=>localStorage.getItem('kidbuster_draft_v1'));
    await page.reload({waitUntil:'networkidle2'});
    const restored=await page.evaluate(()=>({draft:localStorage.getItem('kidbuster_draft_v1'),teacher:document.getElementById('teacherName').value,notes:document.getElementById('krispNotes').value,protocol:document.querySelector('input[name=protocol]:checked').value}));
    check('existing draft key and preferences survive reload',!!before&&restored.draft===before&&restored.teacher==='Brand Test Teacher'&&restored.protocol==='PREPLY'&&restored.notes==='Synthetic draft used only in the local test.');
    for(const file of ['terms-of-use.html','privacy-policy.html','disclaimers.html']){
      await page.goto(origin+'/'+file,{waitUntil:'networkidle2'});
      check(file+': Classbuster title and visible copy', (await page.title()).includes('Classbuster') && await page.evaluate(()=>!(/Pathfinder|PATHFINDER/.test(document.body.innerText))));
      check(file+': official logo and mobile layout', await page.evaluate(()=>{const logo=document.querySelector('.brand img');return logo.complete&&logo.naturalWidth===1600&&document.documentElement.scrollWidth<=innerWidth;}));
    }
    check('no JavaScript or console errors',errors.length===0);
    check('no failed app requests or HTTP errors',bad.length===0);
    check('external fonts loaded without failed requests',external.length===0);
    if(errors.length||bad.length||external.length)console.log({errors,bad,external});
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
  return getFailures();
};
if(require.main===module)module.exports().then(n=>process.exitCode=n?1:0).catch(e=>{console.error(e);process.exitCode=1;});
