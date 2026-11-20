import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, webkit, expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const output='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/home-feedback';
await mkdir(output,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent'});
await server.listen();
const report=[];
try {
  for(const [engine,launcher] of Object.entries({chromium,webkit})) {
    const browser=await launcher.launch();
    try {
      for(const [width,height] of [[360,740],[375,812],[390,844],[430,932]]) {
        const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,locale:'zh-CN'});
        await context.addInitScript(()=>{
          sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');
          localStorage.setItem('nava.locale','zh');
          localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
          const now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
          localStorage.setItem('nava.review.demo.journal.v1',JSON.stringify([
            {id:'face',category:'face',recordDate:date,createdAt:now.toISOString(),data:{feeling:'有点疲惫'}},
            {id:'food',category:'food',recordDate:date,createdAt:now.toISOString(),data:{foods:'米饭、青菜、豆腐，还有一碗汤'}},
          ]));
        });
        const page=await context.newPage();
        await page.route('**/*.supabase.co/**',route=>route.abort());
        // Supply recorded journal data at the snapshot boundary; production
        // authentication and the fixed demo snapshot remain unchanged.
        await page.route('**/src/services/records.ts*',async route=>{
          const response=await route.fetch(),source=await response.text();
          const body=source.replace('if (isDemoMode()) return demoTodaySnapshot(date);',
            'if (isDemoMode()) return {...demoTodaySnapshot(date), journal: JSON.parse(localStorage.getItem("nava.review.demo.journal.v1") || "[]")};');
          assert.notEqual(body,source,'Snapshot fixture did not attach');
          await route.fulfill({response,body});
        });
        await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=today`);
        await expect(page.locator('[data-home-widget="face"] .home-widget-value strong')).toHaveText('有点疲惫');
        await expect(page.locator('[data-home-widget="diet"] .home-widget-value strong')).toHaveText('已记录');
        const cards=await page.locator('.home-health-widget').evaluateAll(nodes=>nodes.map(el=>{
          const strong=el.querySelector('strong'),r=strong.getBoundingClientRect(),style=getComputedStyle(strong);
          return {text:strong.textContent,height:r.height,line:parseFloat(style.lineHeight),scroll:strong.scrollWidth,width:strong.clientWidth,select:style.userSelect||style.webkitUserSelect};
        }));
        for(const card of cards){assert(card.height<=card.line+1,JSON.stringify(card));assert(card.scroll<=card.width+1,JSON.stringify(card));assert.equal(card.select,'none');}
        const cat=page.locator('.option-two-life-stage .nava-mascot'), hit=cat.locator('button');
        await expect(cat.locator('canvas')).toHaveAttribute('data-ready','true',{timeout:20000});
        await page.waitForTimeout(800);
        const layout=await cat.locator('canvas').evaluate(el=>[el.offsetLeft,el.offsetTop,el.offsetWidth,el.offsetHeight]);
        const art=await cat.locator('canvas').boundingBox(),circle=await hit.boundingBox();
        const run=await cat.getAttribute('data-motion-run');
        for(const [x,y] of [[.4,.28],[.85,.72],[.44,.76]]) await page.mouse.click(art.x+art.width*x,art.y+art.height*y);
        // A rounded rectangle's transparent corner must not be clickable either.
        await page.mouse.click(circle.x+1,circle.y+1);
        assert.equal(await cat.getAttribute('data-motion-run'),run,'Tail/ears/feet/transparent corner triggered cat');
        await hit.click();
        await expect(cat).not.toHaveAttribute('data-motion-run',run);
        assert.deepEqual(await cat.locator('canvas').evaluate(el=>[el.offsetLeft,el.offsetTop,el.offsetWidth,el.offsetHeight]),layout,'Hit area changed cat layout');
        await page.waitForTimeout(800); // Let the existing dock entrance settle.
        const icons=await page.locator('.nav-button:not(.ai-nav-button) > img').evaluateAll(nodes=>nodes.map(el=>{
          const i=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect(),s=getComputedStyle(el),p=getComputedStyle(el.parentElement);return {ratio:i.width/b.width,width:i.width,button:b.width,css:s.width,transform:s.transform,padding:p.padding,grid:p.gridTemplateColumns};
        }));
        assert.equal(icons.length,4);
        assert(icons.every(i=>i.ratio>=.70&&i.ratio<=.9),JSON.stringify(icons));
        const card=page.locator('[data-home-widget="face"]');
        const box=await card.boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
        await expect(page.locator('.option-two-home')).toHaveAttribute('data-home-widget-arranging','true');
        assert.equal(await page.evaluate(()=>getSelection()?.toString()),'','Long press selected card text');
        await page.screenshot({path:`${output}/${engine}-${width}.png`});
        report.push({engine,width,height,cards,icons,hit:circle,art});
        await context.close();
      }
    }finally{await browser.close();}
  }
}finally{await server.close();await writeFile(`${output}/result.json`,JSON.stringify(report,null,2));}
console.log(`PASS ${report.length} home states: single-line cards, selection, circle hit region and dock icons.`);
