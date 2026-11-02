import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const root='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/journal-integration';
const artifact=path.join(root,'pages-f0e6944');
const sites='https://nava-app-preview-cz.chizhang1031.chatgpt.site/';
const pages='https://chizhang-805.github.io/nava-app-preview/';
const expectedCommit='f0e69442cf3b62557dad0ae64f419a230cc86f01';
const sha=data=>createHash('sha256').update(data).digest('hex');
async function get(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});
 assert.equal(response.status,200,`Failed resource: ${url}`);
 return Buffer.from(await response.arrayBuffer());
}
const source=JSON.parse((await get(`${pages}source.json`)).toString());
assert.equal(source.sourceCommit,expectedCommit);assert.equal(source.version,166);
const files=[];
async function visit(directory){
 for(const item of await readdir(path.join(artifact,directory),{withFileTypes:true})){
  const relative=`${directory}/${item.name}`;
  if(item.isDirectory())await visit(relative);else files.push(relative);
 }
}
await visit('assets');await visit('journal');
const results=[];
// Two resources at a time bound memory without starting any browser processes.
async function check(relative){
 const local=await readFile(path.join(artifact,relative));
 const sitePath=relative.startsWith('assets/')?relative.slice(7):relative;
 const [publishedSites,publishedPages]=await Promise.all([get(`${sites}${sitePath}`),get(`${pages}${relative}`)]);
 const text=/\.(?:js|css|html|json|svg|txt)$/.test(relative);
 const cloudflare=/<script>\(function\(\)\{function c\(\)[\s\S]*?\/cdn-cgi\/challenge-platform\/scripts\/jsd\/main\.js[\s\S]*?<\/script>/g;
 const normalized=data=>{
  if(!text)return data;
  let value=data.toString().replace(/\r\n/g,'\n');
  if(relative.endsWith('.html'))value=value.replace(cloudflare,'').trimEnd();
  return Buffer.from(value);
 };
 assert.equal(sha(normalized(local)),sha(normalized(publishedSites)),`Sites source mismatch: ${relative}`);
 assert.equal(sha(normalized(local)),sha(normalized(publishedPages)),`Pages source mismatch: ${relative}`);
 results.push({relative,byteIdentical:sha(publishedSites)===sha(publishedPages),hostingInjection:relative.endsWith('.html')&&publishedSites.includes(Buffer.from('/cdn-cgi/challenge-platform/scripts/jsd/main.js')),sourceMatches:true});
}
for(let index=0;index<files.length;index+=2)await Promise.all(files.slice(index,index+2).map(check));
await mkdir(root,{recursive:true});
await writeFile(path.join(root,'public-artifacts.json'),JSON.stringify({source,files:results.length,byteIdentical:results.filter(r=>r.byteIdentical).length,lineEndingOnly:results.filter(r=>!r.byteIdentical&&!r.hostingInjection).length,hostingHtmlInjection:results.filter(r=>r.hostingInjection).length,results},null,2));
console.log(`Dual-site artifact check passed: ${results.length} resources; ${results.filter(r=>r.byteIdentical).length} byte-identical.`);
