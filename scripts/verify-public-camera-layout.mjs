// Real public login and compiled camera UI; fake camera, no analysis/save/health writes.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
const email = process.env.NAVA_ACCOUNT_EMAIL, password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Use the secure launcher.");
const desktop = process.env.NAVA_CAMERA_QA_DESKTOP === "1";
const output = `Q:/NAVA-Workspace/Build/TestRuns/${desktop ? "desktop-simulator" : "camera-layout"}`;
await mkdir(output, { recursive: true });
const receipt = { startedAt: new Date().toISOString(), passed: false, syntheticCamera: true, aiTested: false, results: [] };
await writeFile(`${output}/public.json`, JSON.stringify(receipt));
const browser = await chromium.launch({ headless: true, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  for (const base of ["https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/"]) {
    const context = await browser.newContext({ viewport: desktop ? { width: 1365, height: 1000 } : { width: 390, height: 844 }, permissions: ["camera"], reducedMotion: "reduce" });
    try {
      await context.addInitScript(() => { window.FaceDetector = undefined; });
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      let unexpectedWrites = 0;
      // This visual acceptance must not overwrite active sessions/drafts or archive chats.
      await page.route("**/rest/v1/**", (route) => {
        const request = route.request(), table = new URL(request.url()).pathname.split("/").pop();
        if (["active_user_sessions", "record_drafts"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
        if (["ai_conversations", "ai_conversation_archives"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table)) unexpectedWrites++;
          return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Visual acceptance is read-only"}' });
        }
        return route.continue();
      });
      await page.route("**/functions/v1/**", (route) => {
        const target = new URL(route.request().url());
        if (target.hostname === "wxteapvwagvhhtrjrbim.supabase.co" && target.pathname === "/functions/v1/auth-account-status") return route.continue();
        return route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"AI is outside camera layout acceptance"}' });
      });
      await page.goto(`${base}?demo=1`, { waitUntil: "domcontentloaded" });
      if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
      const form = page.locator(".auth-form--signIn"); await expect(form).toBeVisible();
      if (desktop) {
        const rail = page.locator(".nava-preview-controls:visible");
        await expect(rail).toHaveCount(1);
        await expect(rail.locator("[data-preview-event]")).toHaveCount(4);
        await expect(rail.locator("[data-reminder-preview] button")).toHaveCount(4);
        await expect(rail.locator("[data-preview-event]:enabled, [data-reminder-preview] button:enabled")).toHaveCount(0);
        await expect(rail).toContainText("登录并开始一项活动后可用");
        await page.screenshot({ path: `${output}/public-login-${new URL(base).hostname}.png` });
        await rail.screenshot({ path: `${output}/public-controls-${new URL(base).hostname}.png` });
      }
      const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/v1/token" && new URL(response.url()).searchParams.get("grant_type") === "password" && response.status() === 200);
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password).catch(() => { throw new Error("Secure password field unavailable."); });
      await form.locator('button[type="submit"]').click();
      const response = await responsePromise, authenticated = await response.json();
      assert.equal(new URL(response.url()).hostname, "wxteapvwagvhhtrjrbim.supabase.co");
      assert.equal(authenticated.user?.email?.toLowerCase(), email.toLowerCase());
      await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 45000 });
      if (desktop) await expect(page.locator(".nava-preview-controls:visible")).toHaveCount(1);
      await page.goto(`${base}#tab=record&module=face`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^(使用前置摄像头拍照|前置拍摄|重新拍摄)$/ }).click();
      const modal = page.locator(".camera-capture-overlay"); await expect(modal).toHaveAttribute("data-camera-phase", "live");
      await expect(modal).toContainText("请手动对齐面部");
      if (desktop) {
        const rail = page.locator(".nava-preview-controls:visible");
        await page.evaluate(() => { window.__publicCameraTracks = document.querySelector(".camera-viewfinder video").srcObject.getTracks(); });
        await expect(rail.locator("[data-preview-event=distraction]")).toBeDisabled();
        await rail.locator("[data-preview-event=call]").click();
        await expect(modal).toHaveAttribute("data-camera-phase", "paused");
        assert.equal(await page.evaluate(() => window.__publicCameraTracks.every((track) => track.readyState === "ended")), true);
        await expect(rail.locator("[data-preview-event]:enabled")).toHaveCount(0);
        await modal.getByRole("button", { name: "重新开启", exact: true }).click();
        await expect(modal).toHaveAttribute("data-camera-phase", "live");
        await expect(rail.locator("[data-preview-event=call]")).toBeEnabled();
      }
      await modal.getByRole("button", { name: "拍摄", exact: true }).click(); await expect(modal).toHaveAttribute("data-camera-phase", "review");
      await expect.poll(() => modal.locator("img").evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
      const geometry = await modal.evaluate((node) => {
        const image = node.querySelector("img"), box = image.getBoundingClientRect();
        const footer = node.querySelector("footer"), sheet = node.querySelector(".camera-capture-sheet").getBoundingClientRect();
        return { aspectError: Math.abs(box.width / box.height - image.naturalWidth / image.naturalHeight),
          footerGap: footer.getBoundingClientRect().top + parseFloat(getComputedStyle(footer).paddingTop) - box.bottom,
          sheetHeight: sheet.height, closeBackground: getComputedStyle(node.querySelector(".camera-close")).backgroundColor,
          closeIcon: node.querySelector(".camera-close svg").getBoundingClientRect().width };
      });
      assert.ok(geometry.aspectError < .005 && geometry.footerGap >= 14 && geometry.footerGap <= 18 && geometry.sheetHeight < 500);
      assert.equal(geometry.closeIcon, 18); assert.equal(geometry.closeBackground, "rgba(0, 0, 0, 0)");
      await expect(modal.locator("p")).toHaveCount(0);
      // Close only: synthetic picture is deliberately never submitted for analysis.
      await modal.getByRole("button", { name: "关闭相机" }).click(); await expect(modal).toHaveCount(0);
      assert.equal(unexpectedWrites, 0);
      receipt.results.push({ base, realLogin: true, canonicalProject: true, bypassRejected: true, photoSubmitted: false, healthWrites: unexpectedWrites, desktopRailVisible: desktop, callInterruptionAndTrackRelease: desktop, geometry });
      console.log(`PASS public camera layout: ${new URL(base).hostname}`);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally {
  await browser.close();
  await writeFile(`${output}/public.json`, JSON.stringify({ ...receipt, finishedAt: new Date().toISOString() }, null, 2));
}
