// Post-deployment visual and release-boundary audit for the two Figma-derived skins.
// Local demo mode supplies the authenticated shell only; all journal data requests are
// intercepted and no production record, AI request, or account mutation is allowed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
const output = "Q:/NAVA-Workspace/Build/TestRuns/skin-v220-regression";
await mkdir(output, { recursive: true });
const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const skins = ["violet-dusk", "sky-ripple"];
const modules = ["sleep", "exercise", "mood", "focus", "diet", "face"];
const category = (module) => module === "exercise" ? "sport" : module === "diet" ? "food" : module;
const publicSites = [
  { id: "sites", base: "https://nava-app-preview-cz.chizhang1031.chatgpt.site/", journal: "journal/" },
  { id: "pages", base: "https://chizhang-805.github.io/nava-app-preview/", journal: "journal/" },
];
const forbiddenHardStops = [
  /0 18%,\s*transparent 18\.5%/u,
  /0 20%,\s*transparent 20\.5%/u,
  /0 22%,\s*transparent 22\.5%/u,
  /0 24%,\s*transparent 24\.5%/u,
];
const requiredSkinFragments = [
  "linear-gradient(138.82deg, #f8fbff 8.57%, #f4f9fd 51.66%, #fffdfb 91.43%)",
  "linear-gradient(142.76deg, #787cfe 8.63%, #d670c9 91.37%)",
  ".green-bg i { display: none; }",
];
const requiredHostSkinPatterns = [
  /linear-gradient\(138\.82deg,\s*#f8fbff 8\.57%,\s*#f4f9fd 51\.66%,\s*#fffdfb 91\.43%\)/u,
  /linear-gradient\(142\.76deg,\s*#787cfe 8\.63%,\s*#d670c9 91\.37%\)/u,
  /linear-gradient\(136\.3deg,\s*#787cfe 10\.79%,\s*#172d9d 86\.84%\)/u,
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const receipt = { startedAt: new Date().toISOString(), passed: false, local: [], public: [], errors: [] };
const server = await createServer({ server: { host: "127.0.0.1", port: 5251, strictPort: true }, logLevel: "silent" });
await server.listen();
const localBase = server.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true });

async function prepareLocalContext(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block" });
  await context.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
  await context.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({ json: { settings: Object.fromEntries(modules.map((module) => [`fluffy-first-guide-${category(module)}`, true])) } }));
  await context.route("**/*.supabase.co/functions/v1/**", (route) => route.fulfill({ status: 403, contentType: "application/json", body: '{"error":"AI is outside visual acceptance"}' }));
  await context.addInitScript(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem("nava.onboarding.v3.00000000-0000-4000-8000-000000000001", JSON.stringify({ completed: true, version: 3, answers: {} }));
  });
  return context;
}

async function selectSkin(page, skin) {
  await page.evaluate(() => { location.hash = "tab=profile"; });
  await expect(page.locator(".profile-skin-card")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1200);
  if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(page.locator(".completion-celebration-layer")).toHaveCount(0, { timeout: 10000 });
  }
  await page.locator(`.profile-skin-card .app-skin-option--${skin}`).click({ force: true });
  await expect(page.locator(".phone-frame")).toHaveAttribute("data-app-skin", skin);
}

try {
  for (const [width, height] of sizes) {
    const context = await prepareLocalContext(width, height);
    const page = await context.newPage();
    page.on("pageerror", (error) => receipt.errors.push(`local ${width}x${height}: ${error.message}`));
    await page.goto(`${localBase}?demo=1#tab=profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (await page.locator(".launch-sequence").isVisible().catch(() => false)) await page.locator(".launch-sequence").click();
    for (const skin of skins) {
      await selectSkin(page, skin);
      for (const module of modules) {
        await page.evaluate((nextModule) => { location.hash = `tab=record&module=${nextModule}&view=editor`; }, module);
        await expect(page.locator(".journal-experience iframe")).toBeVisible({ timeout: 30000 });
        await expect(page.locator(".journal-loading")).toHaveCount(0, { timeout: 30000 });
        const frame = page.frameLocator(".journal-experience iframe");
        await expect(frame.locator("html")).toHaveAttribute("data-app-skin", skin);
        await expect(frame.locator("html")).toHaveAttribute("data-record-module", category(module));
        await expect(frame.locator('#screen[data-scene="entry"]')).toBeVisible();
        const hostGeometry = await page.locator(".phone-frame").evaluate((node) => ({ overflow: node.scrollWidth - node.clientWidth, width: node.clientWidth, height: node.clientHeight }));
        const frameState = await frame.locator("html").evaluate(() => {
          const root = document.documentElement;
          const body = getComputedStyle(document.body);
          const green = document.querySelector(".green-bg");
          const disc = green?.querySelector("i");
          const card = document.querySelector(".record-card");
          const primary = document.querySelector(".primary");
          return {
            overflow: Math.max(root.scrollWidth - root.clientWidth, document.body.scrollWidth - document.body.clientWidth),
            bodyBackground: body.backgroundImage || body.backgroundColor,
            greenOpacity: green ? getComputedStyle(green).opacity : null,
            discDisplay: disc ? getComputedStyle(disc).display : null,
            cardBackground: card ? getComputedStyle(card).backgroundImage : null,
            primaryBackground: primary ? getComputedStyle(primary).backgroundImage : null,
          };
        });
        assert.ok(hostGeometry.overflow <= 1, `${skin} ${module} ${width} host overflow ${hostGeometry.overflow}`);
        assert.ok(frameState.overflow <= 1, `${skin} ${module} ${width} iframe overflow ${frameState.overflow}`);
        assert.equal(frameState.greenOpacity, "0", `${skin} ${module} legacy green layer is visible`);
        assert.equal(frameState.discDisplay, "none", `${skin} ${module} legacy background discs are visible`);
        assert.match(frameState.cardBackground || "", /gradient/u, `${skin} ${module} card gradient missing`);
        assert.match(frameState.primaryBackground || "", /gradient/u, `${skin} ${module} action gradient missing`);
        await page.screenshot({ path: `${output}/local-${skin}-${module}-${width}x${height}.png` });
        receipt.local.push({ skin, module, viewport: `${width}x${height}`, hostGeometry, frameState });
      }
    }
    assert.equal(await page.locator(".completion-celebration-layer").count(), 0, "completion overlay leaked into record audit");
    await context.close();
  }

  const sourceSkinCss = await readFile(new URL("../public/journal/css/app-skins.css", import.meta.url));
  const builtAssets = await readdir(new URL("../dist/assets/", import.meta.url));
  const hostCssName = builtAssets.find((name) => /^index-[\w-]+\.css$/u.test(name));
  assert.ok(hostCssName, "local production build is missing its active host stylesheet");
  const builtHostCss = await readFile(new URL(`../dist/assets/${hostCssName}`, import.meta.url));
  const builtHostCssText = builtHostCss.toString("utf8");
  for (const site of publicSites) {
    const rootResponse = await fetch(site.base, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    assert.ok(rootResponse.ok, `${site.id} root returned ${rootResponse.status}`);
    const rootHtml = await rootResponse.text();
    let deployedHostCss = rootHtml;
    const hostCssHref = rootHtml.match(/<link[^>]+href="([^"]*index-[^"]+\.css[^"]*)"/u)?.[1];
    if (hostCssHref) {
      const hostCssResponse = await fetch(new URL(hostCssHref, site.base), { cache: "no-store", signal: AbortSignal.timeout(30000) });
      assert.ok(hostCssResponse.ok, `${site.id} active host stylesheet missing`);
      deployedHostCss = await hostCssResponse.text();
    }
    assert.ok(site.id === "sites" ? rootHtml.includes(builtHostCssText) : sha256(Buffer.from(deployedHostCss)) === sha256(builtHostCss), `${site.id} active host stylesheet does not match the local production build`);
    for (const pattern of requiredHostSkinPatterns) assert.match(deployedHostCss, pattern, `${site.id} active host stylesheet is missing a calibrated gradient`);
    const journalCssResponse = await fetch(new URL(`${site.journal}css/app-skins.css?v=20261006-skins-v2`, site.base), { cache: "no-store", signal: AbortSignal.timeout(30000) });
    assert.ok(journalCssResponse.ok, `${site.id} journal skin CSS missing`);
    const journalCss = await journalCssResponse.text();
    assert.equal(sha256(Buffer.from(journalCss)), sha256(sourceSkinCss), `${site.id} journal skin CSS hash mismatch`);
    for (const fragment of requiredSkinFragments) assert.ok(journalCss.includes(fragment), `${site.id} missing ${fragment}`);
    for (const pattern of forbiddenHardStops) {
      assert.doesNotMatch(journalCss, pattern, `${site.id} journal CSS still contains a hard-edge skin disc`);
      assert.doesNotMatch(deployedHostCss, pattern, `${site.id} host CSS still contains a hard-edge skin disc`);
    }
    assert.doesNotMatch(rootHtml, /skins-v1/u, `${site.id} still references the v1 skin bundle`);
    if (site.id === "pages") {
      const source = await (await fetch(new URL("source.json", site.base), { cache: "no-store", signal: AbortSignal.timeout(30000) })).json();
      assert.equal(source.release, "v220");
      assert.equal(source.sourceCommit, "0e62db98843af9c6f4f0dd219d5e2b568dc987a3");
    }
    for (const [width, height] of sizes) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block" });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${site.base}?demo=1#tab=record&module=mood&view=editor`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await expect(page.locator('input[autocomplete="username"]')).toBeVisible({ timeout: 40000 });
        assert.equal(await page.locator(".phone-frame").count(), 0, `${site.id} public demo bypassed login`);
        assert.deepEqual(errors, [], `${site.id} unauthenticated page error`);
        await page.screenshot({ path: `${output}/public-${site.id}-auth-${width}x${height}.png` });
        receipt.public.push({ site: site.id, viewport: `${width}x${height}`, loginRequired: true, hostCssSha256: sha256(builtHostCss), journalSkinCssSha256: sha256(sourceSkinCss) });
      } finally {
        await context.close();
      }
    }
  }
  assert.equal(receipt.local.length, 48);
  assert.equal(receipt.public.length, 8);
  assert.deepEqual(receipt.errors, []);
  receipt.passed = true;
  console.log("Skin deployment regression passed: 48 authenticated local states and 8 public login-boundary states.");
} finally {
  receipt.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "report.json"), JSON.stringify(receipt, null, 2));
  await browser.close();
  await server.close();
}
