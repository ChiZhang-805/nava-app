// Real component + real storage resolver, with synthetic records and intercepted media only.
// No user account, user media, production endpoint, or model is accessed.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { webkit, expect } from "@playwright/test";
import { createServer } from "vite";

process.env.VITE_SUPABASE_URL = "https://nava-media-test.invalid";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "fixture-public-key";
const port = Number(process.env.MEAL_PHOTO_TEST_PORT || 5347);
const out = process.env.MEAL_PHOTO_TEST_OUTPUT || "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/health-report-meal-photos";
await mkdir(out, { recursive: true });
const knownArt = await readFile("docs/visual-prototypes/assets/diet-flow/tomato-eggs.png");
const tallArt = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="2400" viewBox="0 0 120 2400"><rect width="120" height="2400" fill="#d8eff0"/><path d="M0 0h120v150H0z" fill="#65a6b5"/><circle cx="60" cy="450" r="45" fill="#edc48a"/><circle cx="60" cy="1150" r="45" fill="#83ba9b"/><circle cx="60" cy="1850" r="45" fill="#e5a9a9"/><path d="M0 2250h120v150H0z" fill="#65a6b5"/></svg>`);

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import ReactDOM from 'react-dom/client';
import HealthReportExplorer from '/src/components/HealthReportExplorer.tsx';
import '/src/styles/global.css'; import '/src/styles/product-ui.css';
const params = new URLSearchParams(location.search), scenario = params.get('scenario'), locale = params.get('locale');
const bundle = { moods:[], sleeps:[], exercises:[], nutritions:[], faces:[], focus:[], focusDistributions:[], healthMetrics:[], rhythms:[], journal:[] };
function row(id,photo,names,time='20:00') { return {id,record_date:'2026-11-20',total_calories:0,ai_feedback:null,lunch_time:time,lunch_photo_url:'fixture-user/'+photo,lunch_items:names.map(name=>({name,amount:'1 bowl',calories:180,protein_grams:8,carbohydrate_grams:20,fat_grams:6}))}; }
if (scenario==='shared') bundle.nutritions = [row('shared','shared.png',['Tomato and eggs','Steamed rice']),row('single','single.png',['Vegetable bowl'],'19:00')];
else if (scenario==='stale') bundle.nutritions = [row('slow','slow.png',['Slow meal']),row('fast','fast.png',['Fast meal'],'19:00')];
else bundle.nutritions = [row(scenario,scenario+'.png',['Vegetable bowl'])];
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('main',{className:'phone-frame',style:{width:'100%',maxWidth:'none',height:'100dvh',minHeight:0,padding:'18px 20px 20px',boxSizing:'border-box',overflow:'hidden',display:'flex',flexDirection:'column'}},React.createElement(HealthReportExplorer,{bundle,date:'2026-11-20',locale,onOpenRecord:()=>{window.fixtureRecordOpened=true;}})));
</script></body></html>`;

const server = await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port, strictPort: true }, plugins: [{ name: "isolated-meal-photo-fixture", configureServer(vite) {
  vite.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/__meal-photo.html")) return next();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(await vite.transformIndexHtml(req.url, html));
  });
} }] });
await server.listen();
assert.equal((await fetch(`http://127.0.0.1:${port}/__meal-photo.html`)).status, 200, 'Local fixture server must be reachable');
const browser = await webkit.launch({ headless: true });
const results = [];
const active = page => page.locator('.health-explorer-card[data-active="true"]');
const figure = page => active(page).locator('.health-explorer-meal-visual');

async function prepare(viewport, locale, scenario) {
  const context = await browser.newContext({ viewport, locale: locale === 'zh' ? 'zh-CN' : 'en-US', isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  const signatures = {}, imageGets = {}, unexpected = [], errors = [];
  let releaseSlow;
  const slow = new Promise(resolve => { releaseSlow = resolve; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1' && Number(url.port) === port) return route.continue();
    if (url.hostname !== 'nava-media-test.invalid') { unexpected.push(request.url()); return route.abort(); }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'cache-control': 'no-store' };
    if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers});
    const prefix = '/storage/v1/object/sign/diet-photos/';
    if (!url.pathname.startsWith(prefix)) { unexpected.push(request.url()); return route.abort(); }
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (request.method() === 'POST') {
      signatures[key] = (signatures[key] || 0) + 1;
      assert.equal(request.postDataJSON().expiresIn, 1800);
      if (key.endsWith('/slow.png')) await slow;
      if (key.endsWith('/sign-failure.png')) return route.fulfill({status:403,headers,json:{statusCode:'403',error:'Forbidden',message:'Synthetic signing failure'}});
      return route.fulfill({status:200,headers,json:{signedURL:'/object/sign/diet-photos/'+key+'?token=fixture'}});
    }
    if (request.method() === 'GET' && url.searchParams.get('token') === 'fixture') {
      imageGets[key] = (imageGets[key] || 0) + 1;
      if (key.endsWith('/image-failure.png')) return route.fulfill({status:404,headers,body:'Synthetic missing image'});
      const tall = key.endsWith('/long.png');
      return route.fulfill({status:200,headers,contentType:tall?'image/svg+xml':'image/png',body:tall?tallArt:knownArt});
    }
    unexpected.push(request.url()); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/__meal-photo.html?scenario=${scenario}&locale=${locale}`);
  await expect(page.locator('[data-health-explorer]')).toBeVisible();
  assert.deepEqual(signatures, {}, 'Inactive diet category must not sign photos');
  await page.locator('[data-health-category="diet"]').click();
  await expect(page.locator('[data-health-explorer]')).toHaveAttribute('data-category','diet');
  return {context,page,signatures,imageGets,unexpected,errors,releaseSlow};
}

async function loaded(page, kind) {
  await expect(figure(page)).toHaveAttribute('data-photo-kind',kind);
  await expect.poll(() => figure(page).locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
}

async function next(page, expected, direction = 'ArrowRight') {
  await page.locator('.health-explorer-track').press(direction);
  await expect(active(page).locator('.health-explorer-front h3')).toHaveText(expected);
  // Wait for the middle-copy recenter, before the next keyboard interaction.
  await page.waitForTimeout(220);
}

async function geometry(page) {
  const result = await active(page).evaluate(card => {
    const rect = element => element.getBoundingClientRect().toJSON();
    const visual = card.querySelector('.health-explorer-meal-visual'), image = visual.querySelector('img'), front = card.querySelector('.health-explorer-front');
    return {card:rect(card),visual:rect(visual),image:rect(image),caption:rect(visual.querySelector('figcaption')),date:rect(card.querySelector('.health-explorer-meal-date')),naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,objectFit:getComputedStyle(image).objectFit,frontOverflow:front.scrollHeight-front.clientHeight,documentOverflow:document.documentElement.scrollWidth-innerWidth,frameOverflow:document.querySelector('.phone-frame').scrollWidth-innerWidth,src:image.currentSrc};
  });
  assert.ok(result.documentOverflow <= 1 && result.frameOverflow <= 1, JSON.stringify(result));
  assert.ok(result.frontOverflow <= 1, 'Meal front content overflow: '+JSON.stringify(result));
  assert.equal(result.objectFit, 'contain');
  assert.ok(result.image.height > 30 && result.image.width > 30);
  assert.ok(result.image.top >= result.visual.top-1 && result.image.bottom <= result.caption.top+1, 'Image must leave caption visible');
  assert.ok(result.caption.bottom <= result.date.top+1 && result.date.bottom <= result.card.bottom+1, 'Caption/date must remain within card');
  assert.ok(result.card.left >= -1 && result.card.right <= await page.evaluate(()=>innerWidth)+1);
  return result;
}

try {
  for (const [viewport,locale] of [[{width:320,height:568},'zh'],[{width:430,height:932},'en']]) {
    for (const scenario of ['shared','long','sign-failure','image-failure','stale']) {
      const fixture = await prepare(viewport,locale,scenario);
      const {context,page,signatures,imageGets,unexpected,errors,releaseSlow} = fixture;
      try {
        if (scenario === 'shared') {
          await loaded(page,'meal');
          await expect(figure(page).locator('figcaption')).toHaveText(locale==='zh'?'这餐的照片':'Photo of this meal');
          assert.deepEqual(signatures, {'fixture-user/shared.png':1}, 'Only the active path is signed');
          for (let loop=0; loop<2; loop++) {
            await next(page,'Steamed rice'); await loaded(page,'meal');
            assert.equal(signatures['fixture-user/shared.png'],1,'Shared meal photo must reuse signing promise');
            await next(page,'Vegetable bowl'); await loaded(page,'dish');
            await expect(figure(page).locator('figcaption')).toHaveText(locale==='zh'?'这道菜的照片':'Photo of this dish');
            await next(page,'Tomato and eggs'); await loaded(page,'meal');
          }
          assert.deepEqual(signatures, {'fixture-user/shared.png':1,'fixture-user/single.png':1}, 'Looped card copies must reuse signed paths');
        } else if (scenario === 'stale') {
          await expect.poll(()=>signatures['fixture-user/slow.png']).toBe(1);
          await next(page,'Fast meal'); await loaded(page,'dish');
          await expect(figure(page).locator('img')).toHaveAttribute('src',/fast\.png/);
          releaseSlow();
          await page.waitForTimeout(300);
          await expect(figure(page).locator('img')).toHaveAttribute('src',/fast\.png/);
          await expect(active(page).locator('.health-explorer-front h3')).toHaveText('Fast meal');
          await next(page,'Slow meal','ArrowLeft'); await loaded(page,'dish');
          await expect(figure(page).locator('img')).toHaveAttribute('src',/slow\.png/);
          assert.deepEqual(signatures, {'fixture-user/slow.png':1,'fixture-user/fast.png':1});
        } else if (scenario.endsWith('failure')) {
          await loaded(page,'illustration');
          await expect(figure(page).locator('figcaption')).toHaveText(locale==='zh'?'照片暂时没加载出来':'Photo is unavailable');
          await expect(figure(page).locator('img')).toHaveAttribute('src',/assets\/health-report\/diet\.webp$/);
          assert.equal(signatures[`fixture-user/${scenario}.png`],1);
          if (scenario==='sign-failure') assert.deepEqual(imageGets, {}, 'Failed signing must not request private image');
          else assert.equal(imageGets['fixture-user/image-failure.png'],1);
        } else {
          await loaded(page,'dish');
          assert.ok(await figure(page).locator('img').evaluate(img=>img.naturalHeight/img.naturalWidth >= 20),'Must exercise a genuine very tall image');
        }
        const measured = await geometry(page);
        const screenshot = path.join(out, `webkit-${viewport.width}-${locale}-${scenario}.png`);
        await page.screenshot({path:screenshot});
        assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
        assert.equal(await page.evaluate(()=>Boolean(window.fixtureRecordOpened)),false,'Media/card navigation must not open record action');
        results.push({viewport,locale,scenario,signatures,imageGets,measured,screenshot,unexpectedExternalRequests:unexpected,pageErrors:errors,status:'passed'});
        console.log(`PASS WebKit ${viewport.width} ${locale} ${scenario}`);
      } catch(error) {
        await page.screenshot({path:path.join(out,`FAIL-${viewport.width}-${scenario}.png`)});
        results.push({viewport,locale,scenario,status:'failed',message:error.message,signatures,imageGets,unexpected,errors});
        throw error;
      } finally { releaseSlow(); await context.close(); }
    }
  }
} finally {
  await writeFile(path.join(out,'results.json'),JSON.stringify({fixtureOnly:true,productBaseline:'785f590',runtime:'WebKit',noUserData:true,noProductionRequests:true,results},null,2));
  await browser.close(); await server.close();
}
console.log(`All ${results.length} isolated real-photo UI scenarios passed. Evidence: ${out}`);
