// Software releases only. Never accepts lesson/transcript paths. No automatic
// eviction: archival names are explicit, current/rollback are protected, and
// remote removal happens only after a durable verified local backup exists.
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,rename,open,stat} from 'node:fs/promises';
import {resolve,isAbsolute,basename,relative,sep} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

const releasePath=/^releases\/(?:scout-[A-Za-z0-9._-]+\/ScoutSetup\.exe|Classbuster-Scout-[A-Za-z0-9._-]+-Windows\.zip)$/;
function safePath(path){if(!releasePath.test(path))throw Error('Only branded Scout software-release paths are allowed');return path;}
export function validatePolicy(policy,active){
 if(!Number.isSafeInteger(policy.capacityBytes)||policy.capacityBytes<=0||!Number.isSafeInteger(policy.reserveBytes)||policy.reserveBytes<0||policy.reserveBytes>=policy.capacityBytes)throw Error('Invalid release capacity policy');
 const protectedPaths=[policy.current,policy.rollback,...(policy.protected||[])];
 protectedPaths.forEach(safePath);
 if(policy.current===policy.rollback)throw Error('Current and rollback must be distinct');
 if(active!==policy.current)throw Error('Storage policy disagrees with the active download route');
 return new Set(protectedPaths);
}
export async function inventory(blob){
 let cursor;const items=[],seen=new Set(),cursors=new Set();
 do{
  const page=await blob.list({limit:1000,...(cursor?{cursor}:{})});
  for(const item of page.blobs){
   if(seen.has(item.pathname))throw Error('Duplicate inventory entry; retry with a stable store');
   if(!Number.isSafeInteger(item.size)||item.size<0)throw Error('Invalid inventory size');
   seen.add(item.pathname);items.push({pathname:item.pathname,size:item.size});
  }
  cursor=page.hasMore?page.cursor:undefined;
  if(page.hasMore&&(!cursor||cursors.has(cursor)))throw Error('Incomplete inventory pagination');
  if(cursor)cursors.add(cursor);
 }while(cursor);
 return items;
}
export function capacity(items,policy,incomingBytes=0){
 if(!Number.isSafeInteger(incomingBytes)||incomingBytes<0)throw Error('Invalid incoming size');
 const usedBytes=items.reduce((n,x)=>n+x.size,0),remainingBytes=policy.capacityBytes-usedBytes;
 return {usedBytes,remainingBytes,incomingBytes,reserveBytes:policy.reserveBytes,
  uploadAllowed:usedBytes+incomingBytes+policy.reserveBytes<=policy.capacityBytes};
}
export async function digestFile(path){
 const digest=createHash('sha256');let size=0;
 for await(const chunk of createReadStream(path)){digest.update(chunk);size+=chunk.length;}
 return {size,sha256:digest.digest('hex')};
}
export async function archiveRelease({blob,pathname,archiveDir,policy,active,sourceRoot}){
 const protectedPaths=validatePolicy(policy,active);safePath(pathname);
 if(protectedPaths.has(pathname))throw Error('Current/rollback/recent recovery installer is protected');
 if(!isAbsolute(archiveDir))throw Error('Archive directory must be absolute');
 const root=resolve(archiveDir),source=resolve(sourceRoot);
 const relation=relative(source,root);
 if(!relation||(!relation.startsWith('..'+sep)&&relation!=='..'&&!isAbsolute(relation)))throw Error('Archive must be outside the source checkout');
 const info=await blob.head(pathname);
 if(info.pathname!==pathname||!Number.isSafeInteger(info.size)||info.size<=0)throw Error('Unexpected release metadata');
 const identity=createHash('sha256').update(pathname).digest('hex').slice(0,16);
 const folder=resolve(root,identity);await mkdir(folder,{recursive:true});
 const artifact=resolve(folder,basename(pathname)),receipt=artifact+'.json',partial=artifact+'.partial-'+randomUUID();
 let facts;
 try{
  const existing=JSON.parse(await readFile(receipt,'utf8'));
  facts=await digestFile(artifact);
  if(existing.pathname!==pathname||existing.size!==info.size||facts.size!==existing.size||facts.sha256!==existing.sha256)throw Error('Existing archive failed verification');
 }catch(error){
  if(error.code!=='ENOENT')throw error;
  if(typeof info.etag!=='string'||!info.etag)throw Error('Remote release has no conditional-read identity');
  const hash=createHash('sha256');let size=0;
  const chunkSize=8*1024*1024,handle=await open(partial,'wx');
  const readChunk=async(start)=>{
   const end=Math.min(info.size-1,start+chunkSize-1);
   for(let attempt=0;attempt<3;attempt++){
    try{
     const remote=await blob.get(pathname,{access:'private',abortSignal:AbortSignal.timeout(90000),headers:{Range:`bytes=${start}-${end}`,'If-Match':info.etag}});
     if(remote?.statusCode!==200||!remote.stream)throw Error('Cannot retrieve private release for archival');
     if(remote.headers?.get('content-range')!==`bytes ${start}-${end}/${info.size}`)throw Error('Incomplete or unbounded archive response; remote copy retained');
     const parts=[];let length=0;
     for await(const chunk of remote.stream){length+=chunk.length;if(length>end-start+1)throw Error('Oversized archive range');parts.push(Buffer.from(chunk));}
     if(length!==end-start+1)throw Error('Incomplete archive download; remote copy retained');
     return Buffer.concat(parts);
    }catch(error){if(attempt===2)throw error;}
   }
  };
  try{
   // Bounded ranges survive interrupted large downloads; at most 32MiB buffered.
   for(let start=0;start<info.size;start+=4*chunkSize){
    const offsets=[];for(let n=0;n<4&&start+n*chunkSize<info.size;n++)offsets.push(start+n*chunkSize);
    for(const chunk of await Promise.all(offsets.map(readChunk))){await handle.writeFile(chunk);hash.update(chunk);size+=chunk.length;}
   }
   await handle.sync();
  }finally{await handle.close();}
  facts=await digestFile(partial);
  if(facts.size!==size||facts.sha256!==hash.digest('hex'))throw Error('Local archive checksum mismatch');
  try{await stat(artifact);throw Error('Unreceipted archive exists; remote copy retained');}catch(e){if(e.code!=='ENOENT')throw e;}
  await rename(partial,artifact);
  const receiptHandle=await open(receipt,'wx');
  try{await receiptHandle.writeFile(JSON.stringify({pathname,...facts,archivedAt:new Date().toISOString()},null,2));await receiptHandle.sync();}finally{await receiptHandle.close();}
 }
 // Re-read both archive and remote metadata immediately before removal.
 const verified=await digestFile(artifact),latest=await blob.head(pathname);
 if(verified.sha256!==facts.sha256||verified.size!==info.size||latest.pathname!==pathname||latest.size!==info.size||latest.etag!==info.etag||latest.uploadedAt?.toString()!==info.uploadedAt?.toString())throw Error('Release changed during archival; remote copy retained');
 await blob.del(pathname,{ifMatch:info.etag});
 return {pathname,...facts,artifact,receipt,removedRemote:true};
}
export async function uploadRelease({blob,pathname,file,policy,active}){
 const protectedPaths=validatePolicy(policy,active);safePath(pathname);
 if(!pathname.endsWith('/ScoutSetup.exe'))throw Error('New uploads must be branded installers');
 const items=await inventory(blob);
 if([...protectedPaths].some(path=>!items.some(x=>x.pathname===path)))throw Error('Protected release missing from store');
 if(protectedPaths.has(pathname)||items.some(x=>x.pathname===pathname))throw Error('Refusing to overwrite an existing/protected release');
 const facts=await digestFile(file),preflight=capacity(items,policy,facts.size);
 if(!facts.size||!preflight.uploadAllowed)throw Error('Insufficient release capacity including safety reserve; archive obsolete packages first');
 const uploaded=await blob.put(pathname,createReadStream(file),{access:'private',addRandomSuffix:false,allowOverwrite:false,multipart:true,contentType:'application/vnd.microsoft.portable-executable'});
 if(uploaded.pathname!==pathname)throw Error('Upload path differs from requested release; do not publish');
 const downloaded=await blob.get(pathname,{access:'private'});
 if(downloaded?.statusCode!==200)throw Error('Uploaded installer could not be verified; do not publish');
 const digest=createHash('sha256');let size=0;
 for await(const chunk of downloaded.stream){digest.update(chunk);size+=chunk.length;}
 if(size!==facts.size||digest.digest('hex')!==facts.sha256)throw Error('Uploaded installer differs from source; do not publish');
 return {pathname:uploaded.pathname,...facts,verified:true};
}

async function main(){
 const [action,...args]=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/.test(args[i])||!args[i+1])throw Error('Expected named argument/value pairs');options[args[i].slice(2)]=args[i+1];}
 if(!['inspect','archive','upload'].includes(action))throw Error('Use inspect, archive or upload');
 const sourceRoot=fileURLToPath(new URL('../../',import.meta.url));
 const policy=JSON.parse(await readFile(new URL('./scout-storage-policy.json',import.meta.url),'utf8'));
 const route=await readFile(new URL('../../api/_lib/radar-van-download-handler.js',import.meta.url),'utf8');
 const active=route.match(/const PATHNAME = '([^']+)'/)?.[1];validatePolicy(policy,active);
 const blob=await import('@vercel/blob');
 let result;
 if(action==='inspect'){
  const items=await inventory(blob),protectedPaths=validatePolicy(policy,active);
  const absent=[...protectedPaths].filter(path=>!items.some(x=>x.pathname===path));if(absent.length)throw Error('Protected release missing from store');
  result={...capacity(items,policy,Number(options['incoming-bytes']||0)),softwareReleases:items.filter(x=>releasePath.test(x.pathname)).map(x=>({...x,protected:protectedPaths.has(x.pathname)}))};
 }else if(action==='archive')result=await archiveRelease({blob,pathname:options.pathname,archiveDir:options['archive-dir'],policy,active,sourceRoot});
 else result=await uploadRelease({blob,pathname:options.pathname,file:options.file,policy,active});
 console.log(JSON.stringify(result,null,2));
 if(action==='inspect'&&!result.uploadAllowed)process.exitCode=2;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1;});
