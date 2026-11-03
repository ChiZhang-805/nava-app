import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = process.env.MODULE_OVERVIEW_OUTPUT_DIR
  ? path.resolve(process.env.MODULE_OVERVIEW_OUTPUT_DIR)
  : "Q:\\NAVA-Workspace\\Build\\TestRuns\\App-Checks\\nava-module-overviews-current";
const port = Number(process.env.PORT || 5217);
const modules = [
  { route: "mood", category: "mood" },
  { route: "sleep", category: "sleep" },
  { route: "exercise", category: "sport" },
  { route: "diet", category: "food" },
  { route: "focus", category: "focus" },
  { route: "face", category: "face" },
];
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];

async function main() {
  applyProjectPublicEnv(root);
  await mkdir(outputDir, { recursive: true });
  const server = await createServer({ root, server: { host: "127.0.0.1", port }, logLevel: "silent" });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });
  const report = [];
  const browserErrors = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        locale: "zh-CN",
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        timezoneId: "Asia/Shanghai",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      });
      await context.addInitScript(() => {
        const userId = "00000000-0000-4000-8000-000000000001";
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.locale", "zh");
        localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({
          completed: true,
          completedAt: new Date().toISOString(),
          version: 3,
          answers: {},
          source: "local",
        }));
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => browserErrors.push(`${viewport.name}: ${error.message}`));
      page.on("console", (message) => { if (message.type() === "error") browserErrors.push(`${viewport.name}: ${message.text()}`); });

      for (const module of modules) {
        await page.goto(`${baseUrl}?demo=1#tab=record&module=${module.route}`, { waitUntil: "networkidle" });
        await expect(page.locator(".journal-experience iframe")).toBeVisible({ timeout: 10_000 });
        await expect(page.locator(".journal-loading")).toBeHidden({ timeout: 10_000 });
        await expect(page.locator('.journal-loading[role="alert"]')).toHaveCount(0);
        const journal = page.frameLocator(".journal-experience iframe");
        await expect(journal.locator('#screen[data-scene="entry"]')).toBeVisible({ timeout: 10_000 });
        await expect(journal.locator("#entry-form")).toHaveAttribute("data-category", module.category);
        await expect(journal.locator("#entry-heading h1")).not.toHaveText("");
        await expect(journal.locator("#actor-canvas")).toBeVisible();
        await expect(journal.locator("#confirm-entry")).toBeVisible();

        const outer = await page.evaluate(() => {
          const frame = document.querySelector(".phone-frame");
          const content = document.querySelector(".app-content");
          const journal = document.querySelector(".journal-experience");
          const iframe = document.querySelector(".journal-experience iframe");
          const box = (node) => node ? ({ top: node.getBoundingClientRect().top, right: node.getBoundingClientRect().right, bottom: node.getBoundingClientRect().bottom, left: node.getBoundingClientRect().left, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }) : null;
          return {
            documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            frameOverflowX: frame ? frame.scrollWidth - frame.clientWidth : null,
            content: box(content), journal: box(journal), iframe: box(iframe),
          };
        });
        const inner = await journal.locator("#screen").evaluate((screen) => {
          const box = (node) => node ? ({ top: node.getBoundingClientRect().top, right: node.getBoundingClientRect().right, bottom: node.getBoundingClientRect().bottom, left: node.getBoundingClientRect().left, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }) : null;
          const controls = [...document.querySelectorAll("#entry-form input, #entry-form textarea, #entry-form select, #entry-form button")]
            .filter((node) => { const style = getComputedStyle(node); const r = node.getBoundingClientRect(); return style.visibility !== "hidden" && style.display !== "none" && r.width > 0 && r.height > 0; });
          const loading = document.querySelector("#loading");
          return {
            viewport: { width: innerWidth, height: innerHeight },
            screen: box(screen),
            heading: box(document.querySelector("#entry-heading")),
            form: box(document.querySelector("#entry-form")),
            action: box(document.querySelector("#confirm-entry")),
            canvas: box(document.querySelector("#actor-canvas")),
            controlCount: controls.length,
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            loadingVisible: Boolean(loading && !loading.hidden && getComputedStyle(loading).display !== "none"),
          };
        });
        const fail = (message) => { throw new Error(`${viewport.name}/${module.route}: ${message} ${JSON.stringify({ outer, inner })}`); };
        if ((outer.documentOverflowX ?? 0) > 1 || (outer.frameOverflowX ?? 0) > 1 || inner.horizontalOverflow > 1) fail("horizontal overflow");
        if (!outer.content || !outer.journal || !outer.iframe || !inner.screen || !inner.heading || !inner.form || !inner.action || !inner.canvas) fail("missing required current journal region");
        if (outer.iframe.width < outer.content.width - 2 || outer.iframe.height < outer.content.height - 2) fail("journal iframe does not fill its host");
        if (inner.controlCount < 1) fail("record form has no usable controls");
        if (inner.action.left < -1 || inner.action.right > inner.viewport.width + 1 || inner.action.bottom > inner.viewport.height + 1) fail("primary action escapes the viewport");
        if (inner.loadingVisible) fail("journal loading layer remained visible");

        const viewportDir = path.join(outputDir, viewport.name);
        await mkdir(viewportDir, { recursive: true });
        await page.screenshot({ path: path.join(viewportDir, `${module.route}.png`) });
        report.push({ viewport: viewport.name, module: module.route, category: module.category, outer, inner });
      }
      await context.close();
      console.log(`${viewport.name}: six current journal modules passed`);
    }
    if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
    await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log(`Verified ${modules.length} current journal modules across ${viewports.length} iPhone viewports.`);
    console.log(`Evidence: ${outputDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
