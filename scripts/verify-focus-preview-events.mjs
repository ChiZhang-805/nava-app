import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const outputDir = `Q:/NAVA-Workspace/Build/TestRuns/App-Checks/focus-layout/${engine}`;
const userId = "00000000-0000-4000-8000-000000000001";
const selectedCase = process.argv.find(arg=>arg.startsWith("--case="))?.slice(7);
const viewports = [
  { name: "desktop", width: 1365, height: 1000 },
  { name: "compact", width: 320, height: 568, top: 20, bottom: 0 },
  { name: "small-phone", width: 375, height: 667, top: 20, bottom: 0 },
  { name: "360x740", width: 360, height: 740, top: 48, bottom: 34 },
  { name: "375x812", width: 375, height: 812, top: 50, bottom: 34 },
  { name: "390x844", width: 390, height: 844, top: 59, bottom: 34 },
  { name: "414x896", width: 414, height: 896, top: 48, bottom: 34 },
  { name: "430x932", width: 430, height: 932, top: 62, bottom: 34 },
  { name: "english", width: 390, height: 844, top: 59, bottom: 34, locale: "en" },
].filter(viewport=>!selectedCase||viewport.name===selectedCase);

applyProjectPublicEnv(root);
await mkdir(outputDir, { recursive: true });
const server = await createServer({ root, server: { host: "127.0.0.1", port: 5218, strictPort: true }, logLevel: "silent" });
await server.listen();
const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "http://127.0.0.1:5218";
const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
const report = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      locale: "zh-CN", viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.width === 430 ? 3 : 1,
      isMobile: viewport.width <= 430, hasTouch: viewport.width <= 430,
    });
    await context.addInitScript(({ userId, locale }) => {
      localStorage.setItem("nava.locale",locale||"zh");
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
      localStorage.setItem("nava.review.demo.journal-settings.v1", JSON.stringify({
        "fluffy-first-guide-focus": true,
      }));
      window.__wakeMock = { requests: 0, releases: 0 };
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request: async () => {
        window.__wakeMock.requests += 1;
        const sentinel = new EventTarget();
        sentinel.released = false;
        sentinel.release = async () => { if (!sentinel.released) { sentinel.released = true; window.__wakeMock.releases += 1; sentinel.dispatchEvent(new Event("release")); } };
        return sentinel;
      } } });
    }, { userId, locale:viewport.locale });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(`${baseUrl}?demo=1#tab=record&module=focus`, { waitUntil: "networkidle" });
    await expect(page.locator(".journal-loading")).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('.journal-loading[role="alert"]')).toHaveCount(0);
    const journal = page.frameLocator(".journal-experience iframe");
    await expect(journal.locator('#entry-form[data-category="focus"]')).toBeVisible();
    if (viewport.top !== undefined) {
      await page.locator(".journal-experience").evaluate((root, v) => {
        root.style.setProperty("--journal-safe-top",`${v.top}px`);
        root.style.setProperty("--journal-safe-bottom",`${v.bottom}px`);
        window.dispatchEvent(new Event("resize"));
      }, viewport);
      await expect.poll(()=>journal.locator("html").evaluate(root=>getComputedStyle(root).getPropertyValue("--journal-safe-bottom").trim())).toBe(`${viewport.bottom}px`);
    }
    const task = viewport.locale ? "Prepare the presentation and review the final notes" : "完成游戏 PPT";
    await journal.locator("#field-task").fill(task);
    await journal.locator("#field-durationMinutes").fill(viewport.locale ? "90" : "40");
    await journal.locator("#confirm-entry").click();
    await expect(journal.locator("#focus-page")).toBeVisible();
    await expect(journal.locator("#timer-pause")).toHaveAttribute("aria-label", viewport.locale ? "Pause" : "暂停");
    await journal.locator(".journal-awake").click();
    await expect(journal.locator(".journal-awake")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => page.evaluate(() => window.__wakeMock.requests)).toBe(1);
    const background = await journal.locator('#screen[data-scene="focus"]').evaluate((screen) => ({
      image: getComputedStyle(screen).backgroundImage,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      screenWidth: screen.getBoundingClientRect().width,
      viewportWidth: innerWidth,
    }));
    assert.match(background.image, /focus-ambient-gradient-v1\.png/, `${viewport.name}: dedicated focus background was not loaded`);
    assert.ok(background.overflowX <= 1 && background.screenWidth <= background.viewportWidth + 1, `${viewport.name}: focus screen overflows ${JSON.stringify(background)}`);

    const geometry = await journal.locator("#focus-page").evaluate((root) => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right}; };
      const canvas = document.querySelector("#focus-companion");
      const pixels = canvas.getContext("2d").getImageData(0,0,canvas.width,canvas.height).data;
      let opaquePixels = 0; for(let i=3;i<pixels.length;i+=4) if(pixels[i]>128) opaquePixels++;
      return { back:rect("#back"),awake:rect(".journal-awake"),heading:rect(".focus-heading"),ring:rect(".timer-ring"),companion:rect(".focus-companion"),primary:rect("#timer-pause"),secondary:rect(".timer-secondary"),
        buttons:[...root.querySelectorAll("button")].map(b=>({text:b.textContent,...(()=>{const r=b.getBoundingClientRect();return {w:r.width,h:r.height};})()})),
        timeFits:document.querySelector(".timer-time").getBoundingClientRect().width < document.querySelector(".timer-ring").getBoundingClientRect().width - 32,
        opaquePixels,stageScroll:document.querySelector(".stage").scrollHeight-document.querySelector(".stage").clientHeight };
    });
    assert.ok(Math.abs(geometry.back.y+geometry.back.h/2-geometry.awake.y-geometry.awake.h/2)<1, `${viewport.name}: toolbar alignment`);
    assert.ok(geometry.back.y >= (viewport.top || 0), `${viewport.name}: safe top`);
    assert.ok(geometry.heading.bottom+10<=geometry.ring.y && geometry.ring.bottom+10<=geometry.companion.y && geometry.companion.bottom+10<=geometry.primary.y, `${viewport.name}: content overlaps ${JSON.stringify(geometry)}`);
    assert.ok(geometry.buttons.every(b=>b.w>=44&&b.h>=44),`${viewport.name}: touch targets`);
    assert.ok(geometry.timeFits && geometry.opaquePixels>2000,`${viewport.name}: timer or companion clipped`);
    if (viewport.height>=667 && viewport.name!=="desktop") {
      assert.ok(geometry.stageScroll<=1,`${viewport.name}: unnecessary page scrolling`);
      assert.ok(geometry.secondary.bottom<=viewport.height-viewport.bottom-16,`${viewport.name}: safe bottom ${JSON.stringify(geometry)}`);
    }
    await page.screenshot({path:path.join(outputDir,`${viewport.name}-running.png`)});
    await journal.locator("#timer-pause").click();
    await expect(journal.locator("#focus-page")).toHaveAttribute("data-state","paused");
    const pausedTime=await journal.locator("#timer-time").textContent();
    await page.waitForTimeout(1100);
    assert.equal(await journal.locator("#timer-time").textContent(),pausedTime);
    await page.screenshot({path:path.join(outputDir,`${viewport.name}-paused.png`)});
    await journal.locator("#timer-pause").click();
    await journal.locator("#timer-rest").click();
    await expect(journal.locator("#focus-page")).toHaveAttribute("data-state","resting");
    await expect(journal.locator("#timer-rest")).toBeDisabled();
    await page.screenshot({path:path.join(outputDir,`${viewport.name}-break.png`)});
    await journal.locator("#timer-pause").click();
    await journal.locator("#timer-reset").click();
    await expect(journal.locator("#sheet-layer")).toBeVisible();
    await journal.locator(".sheet-buttons button").first().click();
    await expect(journal.locator("#focus-page")).toHaveAttribute("data-state","running");
    await journal.locator("#timer-reset").click();
    await journal.locator(".sheet-buttons button").last().click();
    await expect(journal.locator("#focus-page")).toHaveAttribute("data-state","running");

    const simulator = page.locator('[data-preview-only="focus-event-simulator"]');
    if (viewport.name === "desktop") {
      await expect(simulator).toBeVisible();
      await expect(simulator.locator("[data-preview-event]:enabled")).toHaveCount(3);
      await simulator.locator('[data-preview-event="call"]').click();
      await expect(journal.locator("#timer-pause")).toHaveAttribute("aria-label", "继续");
      const paused = await journal.locator("#timer-time").textContent();
      await page.waitForTimeout(1_100);
      assert.equal(await journal.locator("#timer-time").textContent(), paused, "desktop call must freeze the focus timer");
      await page.locator('[data-phone-action="end-call"]').click();
      await page.locator('[data-phone-action="app"]').click();
      await journal.locator("#timer-pause").click();
      await expect(journal.locator("#timer-pause")).toHaveAttribute("aria-label", "暂停");
    } else {
      await expect(simulator).toBeHidden();
    }
    await journal.locator(".journal-awake").click();
    await expect(journal.locator(".journal-awake")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => page.evaluate(() => window.__wakeMock.releases)).toBe(1);
    await journal.locator("#timer-stop").click();
    await expect(journal.locator("#sheet-layer")).toBeVisible();
    await page.waitForTimeout(350);
    assert.deepEqual(errors, [], `${viewport.name}: browser errors`);
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
    report.push({ source:"Browser rendering of application code; not an iOS simulator or physical-device screenshot",engine,viewport,deviceScaleFactor:viewport.width===430?3:1,background,geometry,desktopSimulator:viewport.name === "desktop",wakeLock:await page.evaluate(() => window.__wakeMock) });
    await context.close();
    console.log(`${viewport.name}: current focus timer, background, wake lock, and preview isolation passed`);
  }
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Current focus preview verification passed in ${engine} across ${report.length} viewport/language cases.`);
} finally {
  await browser.close();
  await server.close();
}
