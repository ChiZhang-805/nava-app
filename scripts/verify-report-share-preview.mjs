import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const output = "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/report-share-preview";
await mkdir(output, { recursive: true });
applyProjectPublicEnv(process.cwd());
const server = await createServer({ server: { host: "127.0.0.1", port: 5223 }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });
const base = server.resolvedUrls.local[0];
const results = [];
try {
  for (const [width, height] of [[360, 740], [375, 812], [390, 844], [430, 932], [1280, 900]]) {
    const context = await browser.newContext({ locale: "zh-CN", viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
    context.setDefaultTimeout(15000);
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__shared = [];
      window.__shareMode = "cancel";
      window.__nativeShare = true;
      const original = CanvasRenderingContext2D.prototype.fillText;
      window.__drawn = [];
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { window.__drawn.push(text); (this.canvas.__texts ??= []).push(text); return original.call(this, text, ...args); };
      const encode = HTMLCanvasElement.prototype.toBlob;
      const urls = URL.createObjectURL;
      window.__drawnByUrl = {};
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) { const texts = this.__texts ?? []; return encode.call(this, (blob) => { if (blob) blob.__texts = texts; callback(blob); }, ...args); };
      URL.createObjectURL = function (blob) { const url = urls.call(URL, blob); window.__drawnByUrl[url] = blob.__texts ?? []; return url; };
      Object.defineProperty(navigator, "canShare", { value: () => window.__nativeShare });
      Object.defineProperty(navigator, "share", { value: async ({ files }) => {
        if (window.__shareMode === "cancel") throw new DOMException("Test cancelled", "AbortError");
        if (window.__shareMode === "error") throw new DOMException("Test rejected", "NotAllowedError");
        window.__shared.push({ name: files[0].name, bytes: Array.from(new Uint8Array(await files[0].arrayBuffer())) });
      } });
    });
    await page.goto(`${base}?demo=1`, { waitUntil: "domcontentloaded" });
    if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
    await page.locator('input[autocomplete="username"]').fill("13800138000");
    await page.locator('input[autocomplete="current-password"]').fill("12345678");
    await page.locator(".auth-submit").click();
    await page.locator(".onboarding-screen, .phone-frame").first().waitFor();
    if (await page.locator(".onboarding-screen").isVisible()) {
      if (await page.locator(".onboarding-welcome").isVisible()) await page.locator(".onboarding-welcome").waitFor({ state: "hidden" });
      for (const step of ["gender", "occupation", "ageGroup", "hobbies", "sleepDuration", "exerciseDuration", "dietPreferences"]) {
        await expect(page.locator(".onboarding-screen")).toHaveAttribute("data-onboarding-step", step);
        await page.locator(".onboarding-option-grid button").first().click();
        if (["hobbies", "dietPreferences"].includes(step)) await page.locator(".onboarding-next").click();
      }
      await page.locator(".onboarding-consent-row input").first().check({ force: true });
      await page.locator(".onboarding-next").click();
    }
    await page.locator(".bottom-nav").waitFor();
    await page.goto(`${base}?demo=1#tab=record&module=face&view=history`, { waitUntil: "domcontentloaded" });
    const share = page.locator(".module-history-share");
    await share.click();
    const modal = page.getByRole("dialog", { name: "分享前确认" });
    await expect(modal.locator("img")).toBeVisible();
    await expect(modal.locator("input").first()).not.toBeChecked();
    await expect(modal.locator("input").nth(1)).not.toBeChecked();
    if (await page.evaluate(() => window.__shared.length)) throw new Error("Opening preview shared without consent");
    await expect(modal.getByRole("button", { name: "关闭分享预览" })).toBeFocused();
    const confirm = modal.getByRole("button", { name: "确认并分享 / 保存" });
    await modal.screenshot({ path: `${output}/${width}-preview.png` });
    const geometry = await modal.evaluate((node) => {
      const phone = document.querySelector(".phone-frame");
      const frame = phone.getBoundingClientRect();
      const scale = frame.width / phone.offsetWidth;
      return [...node.querySelectorAll("button, label")].every((element) => {
        const r = element.getBoundingClientRect();
        return r.height >= 43.9 * scale && r.left >= frame.left && r.right <= frame.right && r.top >= frame.top + 58 * scale && r.bottom <= frame.bottom - 20 * scale;
      });
    });
    if (!geometry) throw new Error(`Share controls overlap safe areas at ${width}`);
    await confirm.click();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("alert")).toHaveCount(0);
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    await page.keyboard.press("Tab");
    await expect(modal.getByRole("button", { name: "关闭分享预览" })).toBeFocused();
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await page.evaluate(() => { window.__shareMode = "error"; });
    await confirm.click();
    await expect(modal.getByRole("alert")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(share).toBeFocused();
    await expect(share).toHaveText("预览并分享");
    await share.click();
    await expect(modal.locator("img")).toBeVisible();
    await page.evaluate(() => { window.__drawn = []; });
    await modal.getByLabel("包含具体日期").check();
    await modal.getByLabel("包含洞察摘要").check();
    await expect(confirm).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.__drawn.includes("演示洞察"))).toBe(true);
    const oldImage = await modal.locator("img").getAttribute("src");
    await page.evaluate(() => { window.__drawn = []; });
    await modal.getByLabel("包含具体日期").uncheck();
    await expect(modal.getByLabel("包含洞察摘要")).not.toBeChecked();
    await expect(modal.locator("img")).not.toHaveAttribute("src", oldImage);
    await expect(confirm).toBeEnabled();
    const privacy = await page.evaluate(async () => {
      const image = document.querySelector(".report-share-content img");
      const bytes = Array.from(new Uint8Array(await (await fetch(image.src)).arrayBuffer()));
      window.__previewBytes = bytes;
      window.__shareMode = "success";
      const drawn = window.__drawnByUrl[image.src];
      return !drawn.includes("AI 状态洞察") && !drawn.includes("演示洞察") && !drawn.some((text) => /^\d{1,2}\/\d{1,2}/.test(text));
    });
    if (!privacy) throw new Error("Excluded insight/date still drawn");
    await confirm.click();
    await expect(modal).toHaveCount(0);
    const bytesMatch = await page.evaluate(() => window.__shared.length === 1 && window.__shared[0].name === "NAVA-face.png" && JSON.stringify(window.__shared[0].bytes) === JSON.stringify(window.__previewBytes));
    if (!bytesMatch) throw new Error("Export differs from preview");
    // Test the actual canvas service against a historical end date and an empty period.
    const service = await page.evaluate(async () => {
      const { createReportShareImage } = await import("/src/services/reportShareCard.ts");
      const options = { module: "mood", moduleLabel: "情绪", locale: "zh", entries: [{ date: "2026-01-03", value: 70 }], insights: [], includeDates: true, endDate: "2026-01-05", valueFormatter: (value) => String(value) };
      window.__drawn = [];
      await createReportShareImage(options);
      const fixedRange = window.__drawn.includes("12/30 — 1/5") && window.__drawn.includes("1/3");
      let rejected = false;
      try { await createReportShareImage({ ...options, endDate: "2026-02-05" }); } catch { rejected = true; }
      window.__drawn = [];
      await createReportShareImage({ ...options, includeDates: false, includeInsights: true, insights: ["9月13日的私密摘要"] });
      const datePrivacy = !window.__drawn.includes("9月13日的私密摘要");
      const long = await createReportShareImage({ ...options, includeInsights: true, insights: Array(4).fill("A long but bounded test insight about recorded patterns and uncertainty. ".repeat(3)) });
      const bitmap = await createImageBitmap(long);
      const grows = bitmap.height > 1280;
      bitmap.close();
      let bounded = false;
      try { await createReportShareImage({ ...options, includeInsights: true, insights: ["长".repeat(5000)] }); } catch { bounded = true; }
      return fixedRange && rejected && datePrivacy && grows && bounded;
    });
    if (!service) throw new Error("Historical range silently changed or old data reused");
    if (width === 390) {
      const downloadEvent = page.waitForEvent("download");
      await page.evaluate(async () => {
        window.__nativeShare = false;
        const { sharePreparedReportImage } = await import("/src/services/reportShareCard.ts");
        await sharePreparedReportImage(new Blob([new Uint8Array(window.__previewBytes)], { type: "image/png" }), { module: "face", moduleLabel: "面部", locale: "zh", endDate: "2026-01-05", includeDates: false });
      });
      const download = await downloadEvent;
      const bytes = await readFile(await download.path());
      const expected = await page.evaluate(() => window.__previewBytes);
      if (download.suggestedFilename() !== "NAVA-face.png" || !bytes.equals(Buffer.from(expected))) throw new Error("Download fallback changed preview bytes or exposed date");
    }
    results.push({ width, height, previewOnlyUntilConfirmed: true, privacyAndExactBytes: true, cancelAndErrorRemainOpen: true, fixedHistoricalRange: true, localMockShare: true });
    console.log(`PASS ${width}: preview, privacy, exact PNG, cancellation/error, date boundary`);
    await context.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); await server.close(); }
