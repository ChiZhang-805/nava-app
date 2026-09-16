import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
import { IPHONE_PREVIEW_DEVICES } from "../src/constants/iphonePreviewDevices.ts";
applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/phone-system-preview";
await mkdir(output, { recursive: true });
async function sourceFingerprint() {
  const files = (await readdir("src", { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update(await readFile(file));
  return hash.digest("hex");
}
const result = { passed: false, sourceFingerprint: await sourceFingerprint(), localDemo: true, nativeOs: false, startedAt: new Date().toISOString(), states: [], errors: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5232, strictPort: true }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, reducedMotion: "reduce", deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.route("**/*.supabase.co/**", (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => sessionStorage.setItem("nava.launch.sequence.v1", "seen"));
  await page.goto("http://127.0.0.1:5232/", { waitUntil: "networkidle" });
  const phone = page.locator(".ios-system-layer"), rail = page.locator(".nava-preview-controls");
  const command = (name) => rail.locator(`[data-phone-action="${name}"]`).click();
  const event = (name) => rail.locator(`[data-preview-event="${name}"]`).click();
  const shot = async (model, state) => {
    await expect(phone).toBeVisible();
    const errors = await phone.evaluate((root) => {
      const bounds = root.getBoundingClientRect();
      return [...root.querySelectorAll("button")].filter((node) => {
        const b = node.getBoundingClientRect();
        return b.width && b.height && getComputedStyle(node).visibility !== "hidden" && (b.left < bounds.left - 1 || b.right > bounds.right + 1 || b.top < bounds.top - 1 || b.bottom > bounds.bottom + 1);
      }).map((node) => node.ariaLabel || node.textContent);
    });
    assert.deepEqual(errors, [], `${model}/${state} overflow`);
    await page.screenshot({ path: `${output}/${model}-${state}.png` });
    result.states.push({ model, state });
  };
  const swipe = async (locator, direction) => {
    const box = await locator.boundingBox(); assert.ok(box);
    const x = box.x + box.width * .5, y = box.y + box.height * .6;
    const track = direction === "right" ? await locator.locator("..").boundingBox() : null;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(track ? track.x + track.width - 20 : x, y - (direction === "up" ? 80 : 0), { steps: 10 }); await page.mouse.up();
  };
  // Signed-out calls are deliberately available; no Auth identity is required.
  await event("call"); await expect(phone).toHaveAttribute("data-call", "banner"); await shot("signed-out", "call");
  await phone.getByRole("button", { name: "拒接", exact: true }).click();
  await page.locator('.auth-form--signIn input').first().fill("draft@example.com");
  for (const device of IPHONE_PREVIEW_DEVICES) {
    console.log(`Checking ${device.id}`);
    await page.getByTestId("nava-preview-device-select").selectOption(device.id);
    await event("other"); await expect(phone).toHaveAttribute("data-surface", "home");
    await phone.getByRole("button", { name: "天气", exact: true }).click();
    await expect(phone).toHaveAttribute("data-surface", "home"); await shot(device.id, "home");
    await event("call"); await shot(device.id, "home-call");
    await phone.getByRole("button", { name: "展开 NAVA 来电" }).click(); await shot(device.id, "expanded-call");
    await phone.getByRole("button", { name: "接听", exact: true }).click();
    await expect(phone).toHaveAttribute("data-call", "active"); await shot(device.id, "active-call");
    await phone.getByRole("button", { name: "挂断", exact: true }).click();
    await command("lock"); await expect(phone).toHaveAttribute("data-surface", "off"); await shot(device.id, "off");
    await event("call"); await expect(phone).toHaveAttribute("data-surface", "locked");
    await expect(phone.locator(".ios-answer-slider")).toBeVisible(); await shot(device.id, "locked-call");
    await swipe(phone.getByRole("button", { name: "滑动来接听", exact: true }), "right");
    await expect(phone).toHaveAttribute("data-call", "active");
    await phone.getByRole("button", { name: "挂断", exact: true }).click();
    await event("message"); await expect(phone.locator(".ios-lock-notices .ios-notice").first()).toBeVisible(); await shot(device.id, "lock-notification");
    await swipe(phone.locator(".ios-home-gesture"), "up"); await expect(phone).toHaveAttribute("data-surface", "home");
    await phone.getByRole("button", { name: "打开 NAVA", exact: true }).click();
    await expect(phone).toHaveAttribute("data-surface", "app");
    await expect(page.locator('.auth-form--signIn input').first()).toHaveValue("draft@example.com");
    await swipe(phone.locator(".ios-home-gesture"), "up"); await expect(phone).toHaveAttribute("data-surface", "home");
    await command("app");
  }
  // Draft preservation, notification deep-link after explicit unlock, and call resource interruption.
  await page.evaluate(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 2, answers: {}, completedAt: new Date().toISOString() }));
  });
  await page.goto("http://127.0.0.1:5232/?demo=1#tab=ai", { waitUntil: "networkidle" });
  await page.locator(".chat-input-shell input").fill("保留这条尚未发送的草稿");
  await event("other"); await phone.getByRole("button", { name: "打开 NAVA" }).click();
  await expect(page.locator(".chat-input-shell input")).toHaveValue("保留这条尚未发送的草稿");
  await command("lock"); await event("message"); await phone.locator(".ios-lock-notices .ios-notice").click();
  await expect(phone).toHaveAttribute("data-surface", "locked");
  await swipe(phone.locator(".ios-home-gesture"), "up"); await expect(phone).toHaveAttribute("data-surface", "app");
  await expect(page).toHaveURL(/view=notifications/);
  await shot("signed-in", "notification-open");
  for (const viewport of [{ width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await expect(phone).toHaveCount(0);
    await expect(rail).toBeHidden();
    result.states.push({ viewport, state: "mobile-excluded" });
  }
  assert.deepEqual(result.errors, []); assert.equal(await sourceFingerprint(), result.sourceFingerprint, "APP source changed during matrix"); result.passed = true;
  await context.close();
} catch (error) { result.errors.push(String(error)); throw error; }
finally { await browser.close(); await server.close(); await writeFile(`${output}/report.json`, JSON.stringify(result, null, 2)); }
console.log(JSON.stringify({ passed: result.passed, states: result.states.length, output }));
