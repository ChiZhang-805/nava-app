import {chromium,webkit} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
const server=await createServer({server:{host:'127.0.0.1',port:5284,strictPort:true},logLevel:'silent'});await server.listen();
const results=[];
const selectedEngine=process.env.NAVA_LAYOUT_ENGINE||'chromium';
try {
 for(const [name,engine] of Object.entries({chromium,webkit})) {
  if(name!==selectedEngine)continue;
  const browser=await engine.launch();
  try {
   const page=await browser.newPage();await page.goto(server.resolvedUrls.local[0],{waitUntil:'networkidle'});
   const result=await page.evaluate(async()=>{
    const api=await import('/src/services/secureFaceDraft.ts');
    const file=new File(['test-bytes'],'camera.jpg');
    await Promise.all(['2026-10-28','2026-10-29'].map(date=>api.saveSecureFaceDraft('parallel-fixture',date,file)));
    for(const date of ['2026-10-28','2026-10-29']) {
     const concurrent=await api.loadSecureFaceDraft('parallel-fixture',date);
     if(!concurrent||await concurrent.text()!=='test-bytes')throw new Error('Concurrent first saves lost their encryption key');
    }
    await api.clearSecureFaceDraftsForUser('parallel-fixture');
    await api.saveSecureFaceDraft('fixture','2026-10-30',file);
    const loaded=await api.loadSecureFaceDraft('fixture','2026-10-30');
    if(!loaded||await loaded.text()!=='test-bytes'||loaded.type!=='image/jpeg')throw new Error('MIME fallback failed encryption round-trip');
    if(await api.loadSecureFaceDraft('another-user','2026-10-30'))throw new Error('Cross-account draft leak');
    const put=IDBObjectStore.prototype.put;
    let rejected=false;
    try {
     IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);request.addEventListener('success',()=>this.transaction.abort());return request;};
     await api.saveSecureFaceDraft('fixture','2026-10-31',file);
    }catch{rejected=true;}finally{IDBObjectStore.prototype.put=put;}
    if(!rejected)throw new Error('Aborted write reported success');
    if(await api.loadSecureFaceDraft('fixture','2026-10-31'))throw new Error('Aborted write persisted');
    await api.clearSecureFaceDraftsForUser('fixture');
    if(await api.loadSecureFaceDraft('fixture','2026-10-30'))throw new Error('Cleanup left a draft');
    return {concurrentFirstSave:true,mimeFallback:true,accountIsolation:true,abortRejected:true,cleanup:true};
   });results.push({engine:name,...result});
  }finally{await browser.close();}
 }
 const dir='Q:/NAVA-Workspace/Build/TestRuns/mobile-layout';await mkdir(dir,{recursive:true});await writeFile(`${dir}/secure-draft-runtime-${selectedEngine}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await server.close();}
