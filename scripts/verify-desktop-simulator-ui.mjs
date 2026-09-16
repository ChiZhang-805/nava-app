import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";
applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/desktop-simulator";
await mkdir(output, { recursive: true });
const receipt = { passed: false, startedAt: new Date().toISOString(), localDemo: true, results: [] };
await writeFile(`${output}/ui.json`, JSON.stringify(receipt));
const server = await createServer({ server: { host: "127.0.0.1", port: 5228, strictPort: true }, logLevel: "silent" });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1365, height: 1000 }, { width: 901, height: 740 }, { width: 700, height: 700 }, { width: 360, height: 740 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const open = async (suffix = "") => { await page.goto(`http://127.0.0.1:5228/${suffix}`, { waitUntil: "networkidle" }); if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click(); };
      await open(); await expect(page.locator(".auth-form--signIn")).toBeVisible();
      const rail = page.locator(".nava-preview-controls:visible");
      if (viewport.width >= 700) {
        const inspect = async (state) => {
          await expect(rail).toHaveCount(1);
          await expect(rail.locator("[data-preview-event]")).toHaveCount(4);
          await expect(rail.locator("[data-reminder-preview] button")).toHaveCount(4);
          const geometry = await rail.evaluate((node) => {
            const box = node.getBoundingClientRect(), phone = document.querySelector(".nava-app-stage > .phone-frame, .nava-app-stage > .auth-screen").getBoundingClientRect();
            const selector = node.querySelector(".nava-device-selector").getBoundingClientRect(), events = node.querySelector(".nava-focus-event-simulator").getBoundingClientRect();
            return { left: box.left, right: box.right, bottom: box.bottom, phoneRight: phone.right, gap: events.top - selector.bottom, overflow: node.scrollWidth - node.clientWidth };
          });
          assert.ok(geometry.left > geometry.phoneRight && geometry.right <= viewport.width && geometry.bottom <= viewport.height && geometry.overflow <= 1, JSON.stringify(geometry));
          assert.ok(geometry.gap >= 12 && geometry.gap <= 16, JSON.stringify(geometry));
          for (const button of await rail.locator("[data-preview-event], [data-reminder-preview] button").all()) {
            await button.scrollIntoViewIfNeeded(); await expect(button.locator("span")).toBeVisible();
            const buttonGeometry = await button.evaluate((node) => { const box = node.getBoundingClientRect(), text = node.querySelector("span").getBoundingClientRect(); return { width: box.width, height: box.height, textFits: text.left >= box.left && text.right <= box.right, labelDisplay: getComputedStyle(node.querySelector("span")).display }; });
            assert.ok(buttonGeometry.width >= 43 && buttonGeometry.height >= 43 && buttonGeometry.textFits && buttonGeometry.labelDisplay !== "none", JSON.stringify(buttonGeometry));
          }
          await rail.evaluate((node) => { node.scrollTop = 0; });
          receipt.results.push({ viewport, state, geometry });
        };
        await expect(rail.locator("[data-preview-event]:enabled")).toHaveCount(3);
        await expect(rail.locator("[data-reminder-preview] button:enabled")).toHaveCount(0);
        await expect(rail).not.toContainText(/系统事件随时可用|只有图标按压反馈|仅网页测试/);
        await inspect("signed-out"); await page.screenshot({ path: `${output}/login-${viewport.width}.png` });
        await rail.locator('[data-preview-event="other"]').click();
        const system = page.locator('.ios-system-layer');
        await expect(system).toHaveAttribute('data-surface', 'home');
        const beforePress = await rail.locator('[data-preview-event-result]').textContent();
        for (const name of ['搜索', '天气', '设置']) await system.getByRole('button', { name, exact: true }).click();
        await expect(system).toHaveAttribute('data-surface', 'home');
        await expect(rail.locator('[data-preview-event-result]')).toHaveText(beforePress);
        await expect(rail).not.toContainText(/系统事件随时可用|只有图标按压反馈|仅网页测试/);
        await system.getByRole('button', { name: '打开 NAVA', exact: true }).click();
        await rail.getByRole("button", { name: "查看机型规格参数" }).click();
        await expect(rail.locator(".nava-device-selector-turn")).toHaveClass(/is-flipped/);
        await expect.poll(() => rail.locator(".nava-device-selector").evaluate((node) => Math.abs(node.getBoundingClientRect().height - node.querySelector(".nava-device-selector-back").scrollHeight - 2))).toBeLessThan(2);
        await inspect("specifications");
        await page.evaluate(() => {
          sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
          localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 2, answers: {}, completedAt: new Date().toISOString() }));
        });
        await open("?demo=1#tab=today"); await expect(page.locator(".bottom-nav")).toBeVisible();
        await expect(rail.locator("[data-preview-event]:enabled")).toHaveCount(3);
        await expect(rail.locator("[data-reminder-preview] button:enabled")).toHaveCount(4);
        await inspect("signed-in-idle");
        await open("?demo=1#tab=record&module=focus");
        await page.locator('.focus-summary-start[aria-label="开始专注"]').click();
        const immersive = page.locator('[data-module-view="focus-immersive"]');
        await expect(immersive).toBeVisible();
        const toolsRight = await page.locator(".focus-immersive-tools").evaluate((node) => node.getBoundingClientRect().right);
        const railLeft = await rail.evaluate((node) => node.getBoundingClientRect().left);
        assert.ok(toolsRight <= railLeft - 10, "Focus tools must not overlap the simulator rail");
        await page.getByRole("button", { name: "进入状态", exact: true }).click();
        await page.getByRole("dialog", { name: "进入专注状态" }).getByRole("button", { name: "关闭", exact: true }).click();
        await immersive.locator('[aria-label="开始"]').click();
        await expect(immersive).toHaveAttribute("data-focus-state", "running");
        await rail.locator('[data-preview-event="call"]').click();
        await expect(immersive).toHaveAttribute("data-focus-state", "paused");
        await expect(page.locator('.focus-interruption')).toHaveCount(0);
        await expect(rail.locator('[data-preview-event-result]')).toContainText("专注已暂停");
        await inspect("simulated-result-outside-phone");
        receipt.results.push({ viewport, state: "immersive-call-clickable", toolsRight, railLeft });
      } else {
        await expect(page.locator(".nava-preview-controls")).toBeHidden();
        await expect(page.locator("[data-preview-only=focus-event-simulator]")).toBeHidden();
        receipt.results.push({ viewport, state: "mobile-hidden" });
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally {
  await browser.close(); await server.close();
  await writeFile(`${output}/ui.json`, JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
}
console.log(JSON.stringify({ passed: receipt.passed, states: receipt.results.length, output }));
