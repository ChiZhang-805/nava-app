// Compiled production player, real authentication, read-only account context.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
const email = process.env.NAVA_ACCOUNT_EMAIL, password = process.env.NAVA_ACCOUNT_PASSWORD;
if (!email || !password) throw new Error("Use the secure launcher.");
const output = "Q:/NAVA-Workspace/Build/TestRuns/mascot-continuity";
await mkdir(output, { recursive: true });
const receipt = { passed: false, aiTested: false, results: [] };
const browser = await chromium.launch({ headless: true });
try {
  for (const base of ["https://nava-app-preview-cz.chizhang1031.chatgpt.site/", "https://chizhang-805.github.io/nava-app-preview/"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      const loadedAssets = new Set();
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin === new URL(base).origin && !url.pathname.startsWith("/cdn-cgi/") && /\.(js|css)$/.test(url.pathname)) loadedAssets.add(url.href);
      });
      let healthWrites = 0;
      await page.route("**/rest/v1/**", (route) => {
        const request = route.request(), table = new URL(request.url()).pathname.split("/").pop();
        if (["active_user_sessions", "record_drafts"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: request.method() === "GET" ? "null" : "[]" });
        if (["ai_conversations", "ai_conversation_archives"].includes(table)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
          if (/^(mood|sleep|exercise|nutrition|focus|face)_records$/.test(table)) healthWrites++;
          return route.fulfill({ status: 403, contentType: "application/json", body: '{"message":"Read-only visual acceptance"}' });
        }
        return route.continue();
      });
      await page.route("**/functions/v1/**", (route) => {
        const target = new URL(route.request().url());
        if (target.hostname === "wxteapvwagvhhtrjrbim.supabase.co" && target.pathname === "/functions/v1/auth-account-status") return route.continue();
        return route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"AI outside visual acceptance"}' });
      });
      await page.goto(`${base}?demo=1`, { waitUntil: "domcontentloaded" });
      if (await page.locator(".launch-sequence").isVisible()) await page.locator(".launch-sequence").click();
      const form = page.locator(".auth-form--signIn"); await expect(form).toBeVisible();
      const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/v1/token" && response.status() === 200);
      await form.locator('input[autocomplete="username"]').fill(email);
      await form.locator('input[autocomplete="current-password"]').fill(password).catch(() => { throw new Error("Secure password field unavailable"); });
      await form.locator('button[type="submit"]').click();
      const response = await responsePromise, authenticated = await response.json();
      assert.equal(new URL(response.url()).hostname, "wxteapvwagvhhtrjrbim.supabase.co");
      assert.equal(authenticated.user?.email?.toLowerCase(), email.toLowerCase());
      const cat = page.locator(".option-two-life-stage .nava-mascot"), canvas = cat.locator("canvas");
      await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 45000 });
      await expect(cat).toHaveAttribute("data-motion-visual", "persistent-mascot-player");
      await expect(cat).toHaveAttribute("data-time-phase", /morning|day|night/);
      await expect(cat).toHaveAttribute("data-interaction", "tap");
      await canvas.evaluate((node) => {
        window.originalCat = node;
        const probe = document.createElement("canvas"); probe.width = 80; probe.height = 60;
        const ctx = probe.getContext("2d", { willReadFrequently: true });
        window.catSamples = { total: 0, blank: 0, replaced: 0 };
        window.catSampler = setInterval(() => {
          ctx.clearRect(0,0,80,60); ctx.drawImage(node,0,0,80,60);
          const p = ctx.getImageData(0,0,80,60).data;
          let count = 0; for (let i = 3; i < p.length; i += 4) if (p[i] > 64) count++;
          window.catSamples.total++; if (count < 250) window.catSamples.blank++;
          if (!node.isConnected || document.querySelector(".nava-mascot canvas") !== node) window.catSamples.replaced++;
        }, 80);
      });
      await page.route(/(?:home-(?!idle)|module-exercise).*\.webp/, async (route) => {
        if (route.request().resourceType() === "fetch") await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      });
      await cat.click(); await page.waitForTimeout(400);
      await expect(cat).toHaveAttribute("data-player-phase", "loading");
      await page.screenshot({ path: `${output}/public-loading-${new URL(base).hostname}.png` });
      await expect(cat).toHaveAttribute("data-player-phase", "playing");
      await cat.click(); await cat.click();
      await expect(cat).toHaveAttribute("data-motion-run", "2");
      await expect(cat).toHaveAttribute("data-action-queued", "true");
      await page.waitForTimeout(12000);
      const samples = await page.evaluate(() => { clearInterval(window.catSampler); return window.catSamples; });
      assert.ok(samples.total > 80); assert.equal(samples.blank, 0); assert.equal(samples.replaced, 0);
      await page.screenshot({ path: `${output}/public-action-${new URL(base).hostname}.png` });
      assert.equal(healthWrites, 0);
      assert.ok(loadedAssets.size > 5);
      for (const url of loadedAssets) {
        const response = await page.request.get(url); assert.ok(response.ok());
        const expected = await readFile(path.join("dist/assets", decodeURIComponent(new URL(url).pathname.split("/").pop())));
        const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
        assert.equal(hash(await response.body()), hash(expected), `Stale asset: ${url}`);
      }
      receipt.results.push({ base, realLogin: true, canonicalProject: true, demoBypassRejected: true, samples, queuedClickLimit: true, healthWrites, matchingAssets: loadedAssets.size });
      console.log(`PASS public mascot: ${new URL(base).hostname}`);
    } finally { await context.close(); }
  }
  receipt.passed = true;
} finally { await browser.close(); await writeFile(`${output}/public.json`, JSON.stringify(receipt, null, 2)); }
