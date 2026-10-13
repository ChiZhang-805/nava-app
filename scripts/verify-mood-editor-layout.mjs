import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const outputDir = process.env.RECORD_EDITOR_LAYOUT_OUTPUT_DIR
  ? path.resolve(process.env.RECORD_EDITOR_LAYOUT_OUTPUT_DIR)
  : "Q:\\NAVA-Workspace\\Build\\TestRuns\\nava-record-editor-current";
const port = Number(process.env.PORT || 5209);
const viewports = [
  { name: "360x740", width: 360, height: 740 },
  { name: "375x812", width: 375, height: 812 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
];
const editors = [
  { route: "mood", category: "mood", required: { mood: "平静" } },
  { route: "sleep", category: "sleep", required: { bedtime: "23:00", wakeTime: "07:00", quality: "精神还好" } },
  { route: "exercise", category: "sport", required: { activity: "快走", durationMinutes: "30", notes: "公园两圈" } },
  { route: "diet", category: "food", required: { meal: "早餐", foods: "豆浆和包子" } },
  { route: "focus", category: "focus", required: { task: "整理报告", durationMinutes: "25" } },
  { route: "face", category: "face", required: { feeling: "精神还好" } },
];

async function openEditor(page, baseUrl, route, category) {
  await page.goto(`${baseUrl}?demo=1#tab=record&module=${route}`, { waitUntil: "networkidle" });
  await expect(page.locator(".journal-loading")).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.journal-loading[role="alert"]')).toHaveCount(0);
  const journal = page.frameLocator(".journal-experience iframe");
  await expect(journal.locator('#screen[data-scene="entry"]')).toBeVisible({ timeout: 10_000 });
  await expect(journal.locator("#entry-form")).toHaveAttribute("data-category", category);
  return journal;
}

async function fillRequired(journal, required) {
  for (const [key, value] of Object.entries(required)) {
    if (key === "meal") {
      await journal.locator(`.choice-pill[data-value="${value}"]`).click();
    } else if (["bedtime", "wakeTime"].includes(key)) {
      await journal.locator(`#field-${key}`).evaluate((input, nextValue) => {
        input.value = nextValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value);
    } else {
      await journal.locator(`#field-${key}`).fill(value);
    }
  }
}

async function geometry(journal) {
  return journal.locator("#screen").evaluate((screen) => {
    const box = (node) => node ? ({
      top: node.getBoundingClientRect().top, right: node.getBoundingClientRect().right,
      bottom: node.getBoundingClientRect().bottom, left: node.getBoundingClientRect().left,
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
    }) : null;
    const visibleControls = [...document.querySelectorAll("#entry-form input, #entry-form textarea, #entry-form select, #entry-form button")]
      .filter((node) => { const style = getComputedStyle(node); const r = node.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && r.width > 0 && r.height > 0; });
    const action = document.querySelector("#confirm-entry");
    const panel = document.querySelector("#entry-panel");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      screen: box(screen),
      panel: box(panel),
      form: box(document.querySelector("#entry-form")),
      action: box(action),
      actor: box(document.querySelector("#actor-canvas")),
      controlCount: visibleControls.length,
      documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      formOverflowX: document.querySelector("#entry-form")?.scrollWidth - document.querySelector("#entry-form")?.clientWidth,
      actionHit: action ? (() => { const r = action.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit === action || action.contains(hit); })() : false,
    };
  });
}

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
        locale: "zh-CN", viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, timezoneId: "Asia/Shanghai",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
      });
      await context.addInitScript(() => {
        const userId = "00000000-0000-4000-8000-000000000001";
        sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
        localStorage.setItem("nava.locale", "zh");
        localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => browserErrors.push(`${viewport.name}: ${error.message}`));
      page.on("console", (message) => { if (message.type() === "error") browserErrors.push(`${viewport.name}: ${message.text()}`); });
      const journal = await openEditor(page, baseUrl, "mood", "mood");
      const before = await geometry(journal);
      if (!before.panel || !before.form || !before.action || !before.actor || before.controlCount < 3) throw new Error(`${viewport.name}/mood: editor regions are incomplete ${JSON.stringify(before)}`);
      if (before.documentOverflowX > 1 || (before.formOverflowX ?? 0) > 1) throw new Error(`${viewport.name}/mood: horizontal overflow ${JSON.stringify(before)}`);
      if (before.action.left < -1 || before.action.right > before.viewport.width + 1 || before.action.bottom > before.viewport.height + 1 || !before.actionHit) throw new Error(`${viewport.name}/mood: primary action is clipped or covered ${JSON.stringify(before)}`);
      await journal.locator("#confirm-entry").click();
      await expect(journal.locator('#field-mood[aria-invalid="true"]')).toBeFocused();
      await fillRequired(journal, { mood: "平静" });
      await expect(journal.locator('#field-mood[aria-invalid="false"]')).toHaveValue("平静");
      const viewportDir = path.join(outputDir, viewport.name);
      await mkdir(viewportDir, { recursive: true });
      await page.screenshot({ path: path.join(viewportDir, "mood-filled.png") });
      report.push({ viewport: viewport.name, module: "mood", before });
      await context.close();
      console.log(`${viewport.name}: mood editor layout and validation passed`);
    }

    const context = await browser.newContext({ locale: "zh-CN", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      const userId = "00000000-0000-4000-8000-000000000001";
      sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
      localStorage.setItem(`nava.onboarding.v3.${userId}`, JSON.stringify({ completed: true, completedAt: new Date().toISOString(), version: 3, answers: {}, source: "local" }));
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => browserErrors.push(`390x844: ${error.message}`));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(`390x844: ${message.text()}`); });
    for (const editor of editors) {
      const journal = await openEditor(page, baseUrl, editor.route, editor.category);
      await fillRequired(journal, editor.required);
      for (const [key, value] of Object.entries(editor.required)) {
        if (key !== "meal") await expect(journal.locator(`#field-${key}`)).toHaveValue(value);
      }
      const current = await geometry(journal);
      if (current.documentOverflowX > 1 || (current.formOverflowX ?? 0) > 1 || !current.actionHit) throw new Error(`390x844/${editor.route}: filled editor is not usable ${JSON.stringify(current)}`);
      report.push({ viewport: "390x844", module: editor.route, filled: true, geometry: current });
    }
    await context.close();
    if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join(" | ")}`);
    await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
    console.log("Current journal editor layout, validation, and required-field editing passed.");
    console.log(`Evidence: ${outputDir}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
