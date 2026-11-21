import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium,webkit,expect } from '@playwright/test';
import { createServer } from 'vite';
import { applyProjectPublicEnv } from './project-env.mjs';
applyProjectPublicEnv(process.cwd());
const outputDir='Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/calendar-readability';
await mkdir(outputDir,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'silent'});await server.listen();
const results=[];
try {for(const [engine,type] of Object.entries({chromium,webkit})) {
 const browser=await type.launch();
 try {for(const [width,height] of [[320,568],[360,740],[375,812],[390,844],[430,932]]) {
  const context=await browser.newContext({viewport:{width,height},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   sessionStorage.setItem('nava.review.demo.auth.v1','signed-in');localStorage.setItem('nava.locale','zh');
   localStorage.setItem('nava.app-skin.v1:00000000-0000-4000-8000-000000000001','violet-dusk');
   localStorage.setItem('nava-todos:00000000-0000-4000-8000-000000000001',JSON.stringify([
    {id:'calendar-pending',title:'待办',scheduledDate:'2027-02-16',completed:false},
    {id:'calendar-complete',title:'已完成',scheduledDate:'2027-02-15',completed:true}
   ]));
   localStorage.setItem('nava.onboarding.v3.00000000-0000-4000-8000-000000000001',JSON.stringify({completed:true,version:3,answers:{}}));
   localStorage.setItem('nava.review.demo.journal.v1',JSON.stringify([
    {id:'calendar-test-food',category:'food',recordDate:'2027-02-15',createdAt:'2027-02-15T12:00:00Z',data:{meal:'早餐',mealTime:'08:00',foods:['燕麦','鸡蛋','牛奶']}},
    {id:'calendar-test-focus',category:'focus',recordDate:'2027-02-15',createdAt:'2027-02-15T12:00:00Z',data:{task:'专注阅读',durationMinutes:50},focus:{startedAt:'2027-02-15T09:30:00+08:00',endedAt:'2027-02-15T10:20:00+08:00'}},
    {id:'calendar-test-sport',category:'sport',recordDate:'2027-02-15',createdAt:'2027-02-15T12:00:00Z',data:{activity:'下午散步',durationMinutes:35,startTime:'15:00',endTime:'15:35'}},
    {id:'calendar-test-other',category:'food',recordDate:'2027-02-16',createdAt:'2027-02-16T12:00:00Z',data:{meal:'午餐',mealTime:'12:10',foods:['米饭']}}
   ]));
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.setFixedTime(new Date('2027-02-15T12:00:00+08:00'));
  await page.goto(`${server.resolvedUrls.local[0]}?demo=1#tab=today&view=calendar`);
  if(await page.locator('.launch-sequence').isVisible())await page.locator('.launch-sequence').click();
  const screen=page.locator('[data-calendar-layout]');
  await expect(screen).toHaveAttribute('data-expanded','false');
  await expect(page.locator('.home-calendar-day')).toHaveCount(7);
  await expect(page.locator('.calendar-activities h3').first()).toHaveText('早餐');
  await expect(page.locator('.home-calendar-day.has-todo')).toHaveCount(1);
  await expect(page.locator('.home-calendar-day.has-todo')).toHaveAttribute('data-date','2027-02-16');
  await expect(page.locator('.home-calendar-day[data-date="2027-02-15"]')).not.toHaveClass(/has-todo/);
  await expect(page.locator('.home-year-card')).toHaveCount(0);
  const geometry=async()=>page.evaluate(()=>{
   const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
   return {overflow:document.documentElement.scrollWidth-innerWidth,grid:rect('.home-calendar-grid'),agenda:rect('.calendar-agenda'),expand:rect('.calendar-expand'),selected:rect('.home-calendar-day.is-selected'),selectedFill:getComputedStyle(document.querySelector('.home-calendar-day.is-selected b')).backgroundColor,calendarBackground:getComputedStyle(document.querySelector('.home-calendar-card')).backgroundColor,selectedBackground:getComputedStyle(document.querySelector('.home-calendar-day.is-selected')).backgroundImage,monthButtonBackground:getComputedStyle(document.querySelector('.home-calendar-month-switcher button')).backgroundColor};
  });
  const week=await geometry();assert(week.overflow<=1);assert(week.expand.width>=44&&week.expand.height>=44);assert(week.selected.width>=43.9);
  assert.equal(week.calendarBackground,'rgba(0, 0, 0, 0)');assert.equal(week.selectedBackground,'none');assert.equal(week.monthButtonBackground,'rgba(0, 0, 0, 0)');assert.equal(week.selectedFill,'rgb(249, 206, 100)');
  await page.screenshot({path:`${outputDir}/${engine}-${width}-week.png`});
  await page.getByRole('button',{name:'展开整月',exact:true}).click();
  await expect(page.locator('.home-calendar-day')).toHaveCount(28);
  const month=await geometry();assert(Math.abs(month.agenda.y-week.agenda.y-162)<2);
  await page.screenshot({path:`${outputDir}/${engine}-${width}-month.png`});
  await page.locator('.home-calendar-day[data-date="2027-02-16"]').click();
  await expect(page.locator('.calendar-agenda')).toHaveAttribute('data-selected-date','2027-02-16');
  await expect(page.locator('.calendar-activities h3').first()).toHaveText('午餐');
  await page.getByRole('button',{name:'收起整月',exact:true}).click();
  await expect(page.locator('.home-calendar-day')).toHaveCount(7);
  await page.locator('.home-calendar-day[data-date="2027-02-17"]').click();
  await expect(page.locator('.calendar-agenda-empty')).toHaveText('这一天还没有记录');
  await page.getByRole('button',{name:'展开整月',exact:true}).click();
  await page.getByRole('button',{name:'下个月',exact:true}).click();
  await expect(page.locator('.home-calendar-day')).toHaveCount(31);
  assert.equal((await geometry()).grid.height,270);
  await page.getByRole('button',{name:'下个月',exact:true}).click();
  await page.getByRole('button',{name:'下个月',exact:true}).click();
  assert.equal((await geometry()).grid.height,324);
  await page.getByRole('button',{name:'更多月历操作'}).click();
  await page.getByRole('menuitem',{name:'回到本月'}).click();
  await page.getByRole('button',{name:'更多月历操作'}).click();
  await page.getByRole('menuitem',{name:'月度与季度统计'}).click();
  const quarter=page.locator('.home-year-card');await expect(quarter).toHaveAttribute('data-quarter','1');
  await expect(page.locator('.home-year-months > span')).toHaveCount(3);
  await page.getByRole('button',{name:'上一季度'}).click();
  await expect(quarter).toHaveAttribute('data-year','2026');await expect(quarter).toHaveAttribute('data-quarter','4');
  await expect(page.locator('.home-year-day[data-date^="2026-"]')).toHaveCount(92);
  await page.screenshot({path:`${outputDir}/${engine}-${width}-statistics.png`});
  await page.getByRole('button',{name:'更多月历操作'}).click();
  await page.getByRole('menuitem',{name:'当日综合报告'}).click();
  await expect(page.locator('[data-home-view="daily"]')).toBeVisible();
  assert.deepEqual(errors,[]);results.push({engine,width,height,week,month});await context.close();
 }}finally{await browser.close();}
}}
finally{await server.close();}
await writeFile(`${outputDir}/report.json`,JSON.stringify({passed:true,fixtures:'local demo journal only',results},null,2));
console.log(`Calendar: week/month, date timelines, empty state and quarter navigation passed at ${results.length} layouts.`);
