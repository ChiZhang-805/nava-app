// Read-only release boundary check: actual public authentication + asset hashes.
// Never creates an account, signs in, or sends a purchase request.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
const build=process.env.NAVA_RELEASE_DIST;
assert.ok(build,'Set NAVA_RELEASE_DIST to the verified clean release build');
const sitesBuild=process.env.NAVA_SITES_DIST;
assert.ok(sitesBuild,'Set NAVA_SITES_DIST to the verified clean Sites release build');
const out='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/shop-navigation-products/public';await mkdir(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const sources=[{id:'sites',url:'https://nava-app-preview-cz.chizhang1031.chatgpt.site/',assets:'',build:sitesBuild},{id:'pages',url:'https://chizhang-805.github.io/nava-app-preview/',assets:'assets/',build}];
const browser=await chromium.launch({headless:true});const result=[];
try {
 for(const site of sources){
  const response=await fetch(site.url,{signal:AbortSignal.timeout(30000)});assert.ok(response.ok);const html=await response.text();assert.match(html,/NAVA App/);
  const allNames=await readdir(path.join(site.build,'assets'));
  // Chunk names are not a stable contract: Vite may group the client with demo helpers.
  const identities=[];
  for(const name of allNames.filter(n=>n.endsWith('.js'))){if((await readFile(path.join(site.build,'assets',name),'utf8')).includes('wxteapvwagvhhtrjrbim'))identities.push(name);}
  assert.ok(identities.length,'Canonical Supabase identity missing from build');
  const names=[...new Set([...allNames.filter(n=>/^(App-|index-|home-drowsy-|supabaseClient-)/.test(n)),...identities])];
  const checked=[];
  for(const name of names){const r=await fetch(new URL(site.assets+name,site.url),{signal:AbortSignal.timeout(30000)});assert.ok(r.ok,name+' missing');const expected=hash(await readFile(path.join(site.build,'assets',name)));assert.equal(hash(Buffer.from(await r.arrayBuffer())),expected,site.id+' '+name);checked.push(name);}
  if(site.id==='pages'){const r=await fetch(new URL('source.json',site.url),{signal:AbortSignal.timeout(30000)});const provenance=await r.json();assert.equal(provenance.sourceCommit,process.env.NAVA_RELEASE_COMMIT);}
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN'});
  try { const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(site.url+'?demo=1#tab=today&view=points-shop',{waitUntil:'domcontentloaded'});
   await expect(page.locator('input[autocomplete="username"]')).toBeVisible({timeout:40000});
   assert.equal(await page.locator('.points-shop-screen').count(),0,'Public demo must not bypass login');
   assert.ok(identities.every(name=>checked.includes(name)),'Identity chunks must match the live site');
   assert.deepEqual(errors,[]);await page.screenshot({path:out+'/public-'+site.id+'-auth.png'});
   result.push({site:site.id,assetHashesMatched:checked,publicLoginRequired:true,supabaseProject:'wxteapvwagvhhtrjrbim'});
  }finally {await context.close();}
 }
 await writeFile(out+'/public-release.json',JSON.stringify({sourceCommit:process.env.NAVA_RELEASE_COMMIT,result},null,2));console.log(JSON.stringify({passed:true,sites:result.length,assetsPerSite:result.map((item)=>item.assetHashesMatched.length)}));
}finally {await browser.close();}
