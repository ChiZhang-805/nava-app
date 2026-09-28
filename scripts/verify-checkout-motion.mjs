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
  for (const milliseconds of [100,600,1400,2150,2800]) {
    await page.waitForTimeout(milliseconds-previous); previous=milliseconds;
    samples.push(await page.evaluate(() => ({card:getComputedStyle(document.querySelector('.shop-terminal-card-motion')).transform,check:parseFloat(getComputedStyle(document.querySelector('.shop-terminal-check')).strokeDashoffset)})));
    await page.screenshot({path:`${output}/02-reader-${milliseconds}.png`});
  }
  assert.ok(samples[0].check > .99 && samples[1].check > .99,'approval must not precede the contactless approach');
  await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','placed');
  await page.screenshot({path:`${output}/03-placed.png`});
  await page.waitForTimeout(700);
  await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','placed');
  await page.getByRole('button',{name:'继续',exact:true}).click();
  const paper=[]; previous=0;
  for (const milliseconds of [400,1200,2000,3000,4200]) {
    await page.waitForTimeout(milliseconds-previous); previous=milliseconds;
    paper.push(await page.evaluate(() => ({paper:document.querySelector('.shop-receipt').getBoundingClientRect().top,text:document.querySelector('.shop-receipt header').getBoundingClientRect().top})));
    await page.screenshot({path:`${output}/04-print-${milliseconds}.png`});
  }
  assert.ok(paper[3].paper > paper[1].paper + 30,'paper must physically advance');
  assert.ok(Math.abs((paper[3].text-paper[1].text)-(paper[3].paper-paper[1].paper))<1,'ink must move with the paper, not be revealed in place');
  await expect(page.locator('.shop-checkout-experience')).toHaveAttribute('data-checkout-phase','receipt');
  await page.waitForTimeout(1500);
  await page.screenshot({path:`${output}/05-receipt.png`});
  await context.close();
  report.push({samples,paper});
  await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
  console.log(`Checkout detailed motion and bilingual long-content checks passed: ${output}`);
} finally { await browser.close(); await server.close(); }
