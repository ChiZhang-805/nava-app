import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

// Local component fixture only: no account, RPC, points or production order writes.
const output = "Q:/NAVA-Workspace/Build/TestRuns/points-shop-checkout-v3/motion";
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: "127.0.0.1", port: 5214 }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch();
const report = [];
async function open(viewport, locale = "zh", multiple = false, reducedMotion = "no-preference") {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  page.on('pageerror', error => console.error(error.message));
  await page.goto(`http://127.0.0.1:5214/scripts/checkout-visual-fixture.html?locale=${locale}${multiple ? "&multiple=1" : ""}`, { waitUntil: "networkidle" });
  await expect(page.locator('.shop-card-picker-list img').first()).toBeVisible();
  await page.getByRole("button", { name: locale === "zh" ? "使用这张卡片" : "Choose Card", exact: true }).click();
  await page.waitForTimeout(700);
  return { page, context };
}

try {
  for (const locale of ["zh", "en"]) for (const viewport of [{width:320,height:568},{width:360,height:740},{width:375,height:812},{width:390,height:844},{width:430,height:932}]) {
    const { page, context } = await open(viewport, locale, true, "reduce");
    const geometry = await page.evaluate(() => {
      const card = document.querySelector('.shop-order-card').getBoundingClientRect();
      const details = document.querySelector('.shop-order-details').getBoundingClientRect();
      const panel = document.querySelector('.shop-order-confirmation');
      const action = document.querySelector('.shop-checkout-primary').getBoundingClientRect();
      return { cardWidth:card.width, detailsWidth:details.width, panelBottom:panel.getBoundingClientRect().bottom, actionTop:action.top,
        horizontalOverflow:panel.scrollWidth-panel.clientWidth, font:parseFloat(getComputedStyle(document.querySelector('.shop-order-details div')).fontSize),
        items:document.querySelectorAll('.shop-order-item').length, time:document.querySelector('.shop-order-details time').dateTime };
    });
    assert.ok(Math.abs(geometry.cardWidth - geometry.detailsWidth) < 1);
    assert.ok(geometry.font >= 16 && geometry.items === 2 && geometry.horizontalOverflow <= 1);
    assert.ok(geometry.panelBottom <= geometry.actionTop - 8);
    await page.locator('.shop-order-details time').scrollIntoViewIfNeeded();
    await page.screenshot({ path:`${output}/confirm-long-${locale}-${viewport.width}.png` });
    await page.getByRole('button', {name:locale === 'zh' ? '继续' : 'Continue',exact:true}).click();
    await expect(page.locator('.shop-checkout-pending')).toBeVisible();
    await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','placed');
    const summaryRows = page.locator('.shop-terminal-summary-row');
    await expect(summaryRows).toHaveCount(2);
    await expect(summaryRows.nth(0)).toContainText(locale === 'zh' ? '商品1' : 'Item 1');
    await expect(summaryRows.nth(0)).toContainText(locale === 'zh' ? '小猫陪伴手账本' : 'Cat journal');
    await expect(summaryRows.nth(0)).toContainText(locale === 'zh' ? '已使用' : 'Used');
    await expect(summaryRows.nth(0)).toContainText('40 XP');
    await expect(summaryRows.nth(1)).toContainText(locale === 'zh' ? '商品2' : 'Item 2');
    await expect(summaryRows.nth(1)).toContainText(locale === 'zh' ? '暖光陪伴陶瓷杯' : 'Cozy mug');
    await expect(summaryRows.nth(1)).toContainText('40 XP');
    const placedFit = await page.evaluate(() => {
      const summary = document.querySelector('.shop-terminal-summary').getBoundingClientRect();
      const action = document.querySelector('.shop-checkout-primary').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.shop-terminal-summary-row')].map(row => {
        const cells = [...row.children].map(cell => cell.getBoundingClientRect());
        const name = row.querySelector('strong');
        const nameStyle = getComputedStyle(name);
        return {
          height: row.getBoundingClientRect().height,
          nameHeight: name.getBoundingClientRect().height,
          nameLineHeight: parseFloat(nameStyle.lineHeight),
          textOverflow: nameStyle.textOverflow,
          horizontalGaps: cells.slice(1).map((cell, index) => cell.left - cells[index].right),
        };
      });
      return { summaryBottom: summary.bottom, actionTop: action.top, rows };
    });
    assert.ok(placedFit.summaryBottom <= placedFit.actionTop - 8
      && placedFit.rows.every(row => row.height >= 50 && row.height <= 60
        && row.nameHeight <= row.nameLineHeight * 1.25
        && row.textOverflow !== 'ellipsis'
        && row.horizontalGaps.every(gap => gap >= 5)), JSON.stringify(placedFit));
    await page.screenshot({ path:`${output}/placed-long-${locale}-${viewport.width}.png` });
    await page.getByRole('button', {name:locale === 'zh' ? '继续' : 'Continue',exact:true}).click();
    await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','receipt');
    await page.locator('.shop-receipt footer').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', {name:locale === 'zh' ? '完成' : 'Done',exact:true})).toBeInViewport();
    assert.equal(await page.locator('.shop-receipt time').getAttribute('datetime'), geometry.time);
    const overlap = await page.evaluate(() => {
      const stamp = document.querySelector('.shop-receipt-stamp').getBoundingClientRect();
      const text = document.querySelector('.shop-receipt footer > div:first-child').getBoundingClientRect();
      return Math.max(0,Math.min(stamp.right,text.right)-Math.max(stamp.left,text.left));
    });
    assert.equal(overlap,0);
    await page.screenshot({ path:`${output}/receipt-long-${locale}-${viewport.width}.png` });
    report.push({locale,viewport,geometry});
    await context.close();
  }

  const {page,context} = await open({width:390,height:844});
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect(page.locator('.shop-checkout-pending')).toBeVisible();
  await page.screenshot({path:`${output}/01-confirming.png`});
  await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','card');
  let previous=0;
  const samples=[];
  for (const milliseconds of [100,900,1400,1700,1850,2000,2075,2150,2200,2400,2700,3100]) {
    await page.waitForTimeout(milliseconds-previous); previous=milliseconds;
    samples.push(await page.evaluate(() => ({
      cardOffset:(() => { const transform = new DOMMatrix(getComputedStyle(document.querySelector('.shop-terminal-card-motion')).transform); return Math.hypot(transform.e, transform.f); })(),
      reading:parseFloat(getComputedStyle(document.querySelector('.shop-terminal-reading')).opacity),
      stem:parseFloat(getComputedStyle(document.querySelector('.shop-terminal-check-stem')).strokeDashoffset),
      arm:parseFloat(getComputedStyle(document.querySelector('.shop-terminal-check-arm')).strokeDashoffset),
    })));
    await page.screenshot({path:`${output}/02-reader-${milliseconds}.png`});
  }
  assert.ok(samples[0].stem > .99 && samples[0].arm > .99,'approval must remain hidden at the beginning of the reader phase');
  const contactProcessing = samples.find(sample => sample.cardOffset < 1 && sample.reading > .2 && sample.stem > .98 && sample.arm > .98);
  assert.ok(contactProcessing,'the reader must show processing after contact and before drawing approval');
  const shortStrokeIndex = samples.findIndex(sample => sample.stem < .98);
  const longStrokeIndex = samples.findIndex(sample => sample.arm < .98);
  assert.ok(shortStrokeIndex >= 0 && longStrokeIndex > shortStrokeIndex
    && samples[shortStrokeIndex].arm > .98,'the short check stroke must draw first');
  assert.ok(samples[longStrokeIndex].stem < .08,'the long check stroke must follow the completed short stroke');
  assert.ok(samples.at(-2).stem < .02 && samples.at(-2).arm < .02,'both check strokes must finish before the placed state');
  await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','placed');
  await page.screenshot({path:`${output}/03-placed.png`});
  await page.waitForTimeout(700);
  await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','placed');
  await page.getByRole('button',{name:'继续',exact:true}).click();
  const paper=[]; previous=0;
  for (const milliseconds of [400,1200,1450,1600,2000,2400,3000,4200]) {
    await page.waitForTimeout(milliseconds-previous); previous=milliseconds;
    paper.push(await page.evaluate(() => ({
      paper:document.querySelector('.shop-receipt').getBoundingClientRect().top,
      text:document.querySelector('.shop-receipt header').getBoundingClientRect().top,
      printer:document.querySelector('.shop-receipt-printer').getBoundingClientRect().top,
      clip:getComputedStyle(document.querySelector('.shop-receipt')).clipPath,
      status:getComputedStyle(document.querySelector('.shop-printer-status')).backgroundColor,
      catFrame:getComputedStyle(document.querySelector('.shop-checkout-cat > span')).backgroundPosition,
      buttonY:new DOMMatrix(getComputedStyle(document.querySelector('.shop-printer-button')).transform).f,
    })));
    await page.screenshot({path:`${output}/04-print-${milliseconds}.png`});
  }
  assert.equal(paper[0].status,'rgb(239, 182, 94)','printer light must begin orange');
  const firstGreenIndex = paper.findIndex(sample => sample.status === 'rgb(79, 208, 150)');
  assert.ok(firstGreenIndex > 0,'printer light must turn green after the orange resting frame');
  assert.ok(paper[firstGreenIndex].buttonY > 2,'the machine button must visibly depress on the paw-contact frame');
  assert.ok(Math.abs(paper[firstGreenIndex - 1].buttonY) < .1,'the machine button must stay raised before paw contact');
  const preGreenPaperDrift = Math.abs((paper[firstGreenIndex - 1].paper-paper[firstGreenIndex - 1].printer)-(paper[0].paper-paper[0].printer));
  assert.ok(preGreenPaperDrift<2,`receipt must stay behind the slot before the light turns green: ${JSON.stringify({preGreenPaperDrift,paper})}`);
  assert.ok(new Set(paper.slice(0,6).map(sample => sample.catFrame)).size >= 5,'the twelve-frame cat action must visibly advance');
  const clipBottom = (value) => Number.parseFloat(value.match(/([\d.]+)%\)?$/)?.[1] ?? 'NaN');
  assert.ok(clipBottom(paper[1].clip) > 99,'the full receipt must remain inside the slot before printing');
  assert.ok(clipBottom(paper[4].clip) < 99 && clipBottom(paper[4].clip) > clipBottom(paper[5].clip),'the receipt must feed from its heading downward after approval');
  assert.ok(clipBottom(paper[5].clip) < 70,'the printed receipt length must visibly grow');
  await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','receipt');
  await page.waitForTimeout(1500);
  await page.screenshot({path:`${output}/05-receipt.png`});
  await context.close();
  report.push({samples,paper});
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log(`Checkout detailed motion and bilingual long-content checks passed: ${output}`);
} finally { await browser.close(); await server.close(); }
