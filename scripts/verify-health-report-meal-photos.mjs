// Real component + real storage resolver, with synthetic records and intercepted media only.
// No user account, user media, production endpoint, or model is accessed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { webkit, expect } from "@playwright/test";
import { createServer } from "vite";

process.env.VITE_SUPABASE_URL = "https://nava-media-test.invalid";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "fixture-public-key";
const port = Number(process.env.MEAL_PHOTO_TEST_PORT || 5347);
const out = process.env.MEAL_PHOTO_TEST_OUTPUT || "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/App-Checks/health-report-meal-photos";
const availableScenarios = ['shared','long','sign-failure','image-failure','stale','generated','pending'];
const scenarios = process.env.MEAL_PHOTO_TEST_SCENARIOS?.split(',').map(value=>value.trim()).filter(Boolean) || availableScenarios;
assert.ok(scenarios.length && scenarios.every(value=>availableScenarios.includes(value)), 'Unknown meal-photo scenario filter');
const productBaseline = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
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
else if (scenario==='generated') {
  bundle.nutritions = [row('generated','original.png',['Tomato and eggs'])];
  bundle.foodRenders = [{id:'ready-job',source_kind:'nutrition_records',source_id:'generated',item_key:'lunch:item',record_date:'2026-11-20',source_revision:'1',state:'ready',input:{name:'Tomato and eggs',amount:'1 bowl',photoPath:'fixture-user/original.png',sourceItemId:null,meal:'lunch'},asset_path:'fixture-user/ready-job/generated.png',evidence_kind:'photo',updated_at:'2026-11-20T20:00:00Z'}];
} else if (scenario==='pending') {
  bundle.nutritions = [row('processing','processing.png',['Photo meal']),{...row('queued','unused.png',['Text meal'],'19:00'),lunch_photo_url:null}];
  bundle.foodRenders = bundle.nutritions.map((record,index)=>({id:record.id+'-job',source_kind:'nutrition_records',source_id:record.id,item_key:'lunch:item',record_date:record.record_date,source_revision:'1',state:index?'queued':'processing',input:{name:record.lunch_items[0].name,amount:'1 bowl',photoPath:record.lunch_photo_url,sourceItemId:null,meal:'lunch'},asset_path:null,evidence_kind:null,updated_at:'2026-11-20T20:00:00Z'}));
}
else bundle.nutritions = [row(scenario,scenario+'.png',['Vegetable bowl'])];
const root = ReactDOM.createRoot(document.getElementById('root'));
function render(value) { root.render(React.createElement('main',{className:'phone-frame',style:{width:'100%',maxWidth:'none',height:'100dvh',minHeight:0,padding:'18px 20px 20px',boxSizing:'border-box',overflow:'hidden',display:'flex',flexDirection:'column'}},React.createElement(HealthReportExplorer,{bundle:value,date:'2026-11-20',locale,onOpenRecord:()=>{window.fixtureRecordOpened=true;}}))); }
window.renameFixtureMeal = () => render({...bundle,nutritions:bundle.nutritions.map(record=>({...record,lunch_items:record.lunch_items.map(item=>({...item,name:'Changed saved meal'}))}))});
render(bundle);
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
  const signatures = {}, imageGets = {}, signedBuckets = [], unexpected = [], errors = [];
  let releaseSlow;
  const slow = new Promise(resolve => { releaseSlow = resolve; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1' && Number(url.port) === port) return route.continue();
    if (url.hostname !== 'nava-media-test.invalid') { unexpected.push(request.url()); return route.abort(); }
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'cache-control': 'no-store' };
    if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers});
    const bucket = /^\/storage\/v1\/object\/sign\/(diet-photos|diet-renders)\//.exec(url.pathname)?.[1];
    if (!bucket) { unexpected.push(request.url()); return route.abort(); }
    const prefix = '/storage/v1/object/sign/'+bucket+'/';
    const key = decodeURIComponent(url.pathname.slice(prefix.length));
    if (request.method() === 'POST') {
      signatures[key] = (signatures[key] || 0) + 1;
      signedBuckets.push({bucket,key});
      assert.equal(request.postDataJSON().expiresIn, 1800);
      if (key.endsWith('/slow.png')) await slow;
      if (key.endsWith('/sign-failure.png')) return route.fulfill({status:403,headers,json:{statusCode:'403',error:'Forbidden',message:'Synthetic signing failure'}});
      return route.fulfill({status:200,headers,json:{signedURL:'/object/sign/'+bucket+'/'+key+'?token=fixture'}});
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
  return {context,page,signatures,imageGets,signedBuckets,unexpected,errors,releaseSlow};
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
    const caption = visual.querySelector('figcaption'), empty = visual.querySelector('.health-explorer-photo-empty');
    return {card:rect(card),visual:rect(visual),image:image?rect(image):null,empty:empty?rect(empty):null,caption:caption?rect(caption):null,date:rect(card.querySelector('.health-explorer-meal-date')),naturalWidth:image?.naturalWidth,naturalHeight:image?.naturalHeight,objectFit:image?getComputedStyle(image).objectFit:null,frontOverflow:front.scrollHeight-front.clientHeight,documentOverflow:document.documentElement.scrollWidth-innerWidth,frameOverflow:document.querySelector('.phone-frame').scrollWidth-innerWidth,src:image?.currentSrc};
  });
  assert.ok(result.documentOverflow <= 1 && result.frameOverflow <= 1, JSON.stringify(result));
  assert.ok(result.frontOverflow <= 1, 'Meal front content overflow: '+JSON.stringify(result));
  if (result.image) {
    assert.equal(result.objectFit, 'contain');
    assert.ok(result.image.height > 30 && result.image.width > 30);
    assert.ok(result.image.top >= result.visual.top-1 && result.image.bottom <= result.caption.top+1, 'Image must leave caption visible');
    assert.ok(result.caption.bottom <= result.date.top+1, 'Caption must not overlap date');
  } else assert.ok(result.empty && result.empty.bottom <= result.date.top+1, 'Small empty-photo state must remain above date');
  assert.ok(result.date.bottom <= result.card.bottom+1, 'Date must remain within card');
  assert.ok(result.card.left >= -1 && result.card.right <= await page.evaluate(()=>innerWidth)+1);
  return result;
}

async function fourNutrients(page, locale) {
  const rows = active(page).locator('[data-front-nutrient]');
  assert.deepEqual(await rows.evaluateAll(elements=>elements.map(element=>({id:element.dataset.frontNutrient,value:element.dataset.frontNutrientValue,unit:element.querySelector('dd span')?.textContent}))),[
    {id:'calories',value:'180',unit:'kcal'},{id:'protein',value:'8',unit:'g'},{id:'carbs',value:'20',unit:'g'},{id:'fat',value:'6',unit:'g'},
  ]);
  await expect(rows.locator('dt')).toHaveText(locale==='zh'?['热量','蛋白质','碳水','脂肪']:['Energy','Protein','Carbohydrate','Fat']);
}

try {
  for (const [viewport,locale] of [[{width:320,height:568},'zh'],[{width:430,height:932},'en']]) {
    for (const scenario of scenarios) {
      const fixture = await prepare(viewport,locale,scenario);
      const {context,page,signatures,imageGets,signedBuckets,unexpected,errors,releaseSlow} = fixture;
      const transitions = [];
      try {
        if (scenario === 'generated') {
          await loaded(page,'generated');
          await expect(figure(page).locator('figcaption')).toHaveText(locale==='zh'?'AI 餐食示意图':'AI meal illustration');
          await fourNutrients(page,locale);
          assert.deepEqual(signedBuckets,[{bucket:'diet-renders',key:'fixture-user/ready-job/generated.png'}], 'Ready render signs only the private generated asset, never the original photo');
          transitions.push({state:'ready',measured:await geometry(page)});
          await page.screenshot({path:path.join(out,`webkit-${viewport.width}-${locale}-generated-ready.png`)});
          await page.evaluate(()=>window.renameFixtureMeal());
          await expect(active(page).locator('.health-explorer-front h3')).toHaveText('Changed saved meal');
          await loaded(page,'dish');
          await expect(figure(page).locator('img')).toHaveAttribute('src',/diet-photos\/fixture-user\/original\.png/);
          await expect(figure(page).locator('figcaption')).not.toContainText('AI');
          await fourNutrients(page,locale);
          assert.deepEqual(signedBuckets,[{bucket:'diet-renders',key:'fixture-user/ready-job/generated.png'},{bucket:'diet-photos',key:'fixture-user/original.png'}], 'A renamed source must reject the old render and show its original photo');
        } else if (scenario === 'pending') {
          await loaded(page,'dish');
          await expect(figure(page).locator('img')).toHaveAttribute('src',/diet-photos\/fixture-user\/processing\.png/);
          await expect(figure(page).locator('figcaption')).not.toContainText('AI');
          await fourNutrients(page,locale);
          transitions.push({state:'processing-with-photo',measured:await geometry(page)});
          await page.screenshot({path:path.join(out,`webkit-${viewport.width}-${locale}-pending-original.png`)});
          await next(page,'Text meal');
          await expect(figure(page)).toHaveAttribute('data-photo-kind','empty');
          await expect(figure(page).locator('img')).toHaveCount(0);
          await expect(figure(page).locator('.health-explorer-photo-empty')).toContainText(locale==='zh'?'餐食已记好，配图准备中':'Meal saved · image is on its way');
          await fourNutrients(page,locale);
          assert.deepEqual(signedBuckets,[{bucket:'diet-photos',key:'fixture-user/processing.png'}], 'Pending jobs never sign generated assets; no-photo state must not request a fallback food picture');
        } else if (scenario === 'shared') {
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
        results.push({viewport,locale,scenario,signatures,imageGets,signedBuckets,transitions,measured,screenshot,unexpectedExternalRequests:unexpected,pageErrors:errors,status:'passed'});
        console.log(`PASS WebKit ${viewport.width} ${locale} ${scenario}`);
      } catch(error) {
        await page.screenshot({path:path.join(out,`FAIL-${viewport.width}-${scenario}.png`)});
        results.push({viewport,locale,scenario,status:'failed',message:error.message,signatures,imageGets,unexpected,errors});
        throw error;
      } finally { releaseSlow(); await context.close(); }
    }
  }
} finally {
  await writeFile(path.join(out,'results.json'),JSON.stringify({fixtureOnly:true,productBaseline,scenarios,runtime:'WebKit',noUserData:true,noProductionRequests:true,results},null,2));
  await browser.close(); await server.close();
}
console.log(`All ${results.length} isolated real-photo UI scenarios passed. Evidence: ${out}`);
