// Post-deployment release gate for the two Figma-derived skins.
// Local demo mode supplies only the authenticated shell. Every journal write and
// AI request is intercepted, so this audit cannot mutate production user data.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());

const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const output = outputArgument?.slice("--output=".length) || "Q:/NAVA-Workspace/Build/TestRuns/skin-v223-regression";
await mkdir(output, { recursive: true });

const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const skins = ["violet-dusk", "sky-ripple"];
const modules = ["sleep", "exercise", "mood", "focus", "diet", "face"];
const category = (module) => module === "exercise" ? "sport" : module === "diet" ? "food" : module;
const publicSites = [
  { id: "sites", base: "https://nava-app-preview-cz.chizhang1031.chatgpt.site/", journal: "journal/" },
  { id: "pages", base: "https://chizhang-805.github.io/nava-app-preview/", journal: "journal/" },
];
const skinAssetVersion = "20261006-skins-a11y-v3";
const forbiddenHardStops = [
  /0 18%,\s*transparent 18\.5%/u,
  /0 20%,\s*transparent 20\.5%/u,
  /0 22%,\s*transparent 22\.5%/u,
  /0 24%,\s*transparent 24\.5%/u,
];
const requiredJournalFragments = [
  "linear-gradient(138.82deg, #f8fbff 8.57%, #f4f9fd 51.66%, #fffdfb 91.43%)",
  "linear-gradient(142.76deg, #787cfe 8.63%, #d670c9 91.37%)",
  ".green-bg i { display: none; }",
  "--muted: #53617d;",
  "--muted: #52657a;",
];
const requiredHostSkinPatterns = [
  /linear-gradient\(138\.82deg,\s*#f8fbff 8\.57%,\s*#f4f9fd 51\.66%,\s*#fffdfb 91\.43%\)/u,
  /linear-gradient\(142\.76deg,\s*#787cfe 8\.63%,\s*#d670c9 91\.37%\)/u,
  /linear-gradient\(136\.3deg,\s*#787cfe 10\.79%,\s*#172d9d 86\.84%\)/u,
];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const messageFor = (error) => error instanceof Error ? error.message : String(error);
const receipt = {
  schemaVersion: 2,
  audit: "skin-deployment-regression",
  startedAt: new Date().toISOString(),
  passed: false,
  configuration: { output, sizes: sizes.map(([width, height]) => `${width}x${height}`), skins, modules, publicSites },
  assets: [],
  local: [],
  public: [],
  errors: [],
};

function newResult(identity) {
  return { ...identity, passed: false, checks: [], error: null, screenshot: null };
}

async function step(result, name, operation) {
  try {
    const details = await operation();
    result.checks.push({ name, passed: true, details: details ?? null });
    return details;
  } catch (error) {
    const message = messageFor(error);
    result.checks.push({ name, passed: false, error: message });
    throw new Error(`${name}: ${message}`, { cause: error });
  }
}

function markFailure(result, error) {
  result.error = messageFor(error);
  result.passed = false;
  receipt.errors.push(`${result.scope} ${result.target}: ${result.error}`);
}

function finishResult(result) {
  result.passed = !result.error && result.checks.length > 0 && result.checks.every((check) => check.passed);
  return result;
}

async function prepareLocalContext(browser, width, height) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route("**/*.supabase.co/rest/v1/journal_entries**", (route) => route.fulfill({ json: [] }));
  await context.route("**/*.supabase.co/rest/v1/journal_preferences**", (route) => route.fulfill({
    json: { settings: Object.fromEntries(modules.map((module) => [`fluffy-first-guide-${category(module)}`, true])) },
  }));
  await context.route("**/*.supabase.co/functions/v1/**", (route) => route.fulfill({
    status: 403,
    contentType: "application/json",
    body: '{"error":"AI is outside visual acceptance"}',
  }));
  await context.addInitScript(() => {
    sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    localStorage.setItem(
      "nava.onboarding.v3.00000000-0000-4000-8000-000000000001",
      JSON.stringify({ completed: true, version: 3, answers: {} }),
    );
  });
  return context;
}

async function selectSkin(page, skin) {
  await page.evaluate(() => { location.hash = "tab=profile"; });
  await page.locator('.profile-overview[data-profile-view="overview"]').waitFor({ state: "visible", timeout: 30000 });
  // The one-time completion scene can mount after route readiness. Dismiss it at
  // stable intervals before interacting with the skin selector.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.waitForTimeout(350);
    if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.locator(".completion-celebration-layer").waitFor({ state: "detached", timeout: 10000 });
    }
  }
  await page.locator('.profile-nav-row[data-profile-target="skin"]').click();
  await page.locator(".profile-skin-card").waitFor({ state: "visible", timeout: 30000 });
  await page.locator(`.profile-skin-card .app-skin-option--${skin}`).click({ force: true });
  await page.waitForFunction((expected) => document.querySelector(".phone-frame")?.getAttribute("data-app-skin") === expected, skin, { timeout: 10000 });
  return { selected: await page.locator(".phone-frame").getAttribute("data-app-skin") };
}

function sameOriginAssetReferences(html, base) {
  const origin = new URL(base).origin;
  return [...html.matchAll(/(?:src|href)="([^"]+)"/gu)]
    .map((match) => new URL(match[1], base))
    .filter((url) => url.origin === origin && /\.(?:css|js|svg|png|webp|jpe?g)(?:$|\?)/u.test(url.href))
    .map((url) => url.href)
    .filter((url, index, values) => values.indexOf(url) === index);
}

let server;
let browser;
try {
  server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "silent" });
  await server.listen();
  const localBase = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });

  for (const [width, height] of sizes) {
    const context = await prepareLocalContext(browser, width, height);
    try {
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${localBase}?demo=1#tab=profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
      if (await page.locator(".launch-sequence").isVisible().catch(() => false)) await page.locator(".launch-sequence").click();

      for (const skin of skins) {
        let selection;
        let selectionError = null;
        try {
          selection = await selectSkin(page, skin);
        } catch (error) {
          selectionError = error;
        }

        for (const module of modules) {
          const target = `${skin}/${module}/${width}x${height}`;
          const result = newResult({ scope: "local-authenticated-shell", target, skin, module, viewport: `${width}x${height}` });
          const screenshot = path.join(output, `local-${skin}-${module}-${width}x${height}.png`);
          result.screenshot = screenshot;
          const pageErrorOffset = pageErrors.length;
          try {
            await step(result, "skin-selection", async () => {
              if (selectionError) throw selectionError;
              if (selection?.selected !== skin) throw new Error(`expected ${skin}, received ${selection?.selected ?? "none"}`);
              return selection;
            });
            await step(result, "module-route", async () => {
              await page.evaluate((nextModule) => { location.hash = `tab=record&module=${nextModule}&view=editor`; }, module);
              await page.locator(".journal-experience iframe").waitFor({ state: "visible", timeout: 30000 });
              await page.waitForFunction(() => !document.querySelector(".journal-loading"), undefined, { timeout: 30000 });
              return { hash: await page.evaluate(() => location.hash) };
            });
            const frame = page.frameLocator(".journal-experience iframe");
            const attributes = await step(result, "iframe-contract", async () => {
              await frame.locator("html").waitFor({ state: "attached", timeout: 30000 });
              const values = {
                skin: await frame.locator("html").getAttribute("data-app-skin"),
                category: await frame.locator("html").getAttribute("data-record-module"),
                entryVisible: await frame.locator('#screen[data-scene="entry"]').isVisible(),
              };
              if (values.skin !== skin) throw new Error(`skin=${values.skin}`);
              if (values.category !== category(module)) throw new Error(`category=${values.category}`);
              if (!values.entryVisible) throw new Error("entry scene is not visible");
              return values;
            });
            result.attributes = attributes;
            const hostGeometry = await page.locator(".phone-frame").evaluate((node) => ({
              overflow: node.scrollWidth - node.clientWidth,
              width: node.clientWidth,
              height: node.clientHeight,
            }));
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
            await step(result, "responsive-layout", async () => {
              if (hostGeometry.overflow > 1) throw new Error(`host overflow=${hostGeometry.overflow}px`);
              if (frameState.overflow > 1) throw new Error(`iframe overflow=${frameState.overflow}px`);
              return { hostGeometry, iframeOverflow: frameState.overflow };
            });
            await step(result, "calibrated-gradients", async () => {
              if (!/gradient/u.test(frameState.cardBackground || "")) throw new Error("card gradient missing");
              if (!/gradient/u.test(frameState.primaryBackground || "")) throw new Error("action gradient missing");
              return { body: frameState.bodyBackground, card: frameState.cardBackground, action: frameState.primaryBackground };
            });
            await step(result, "legacy-disc-hidden", async () => {
              if (frameState.greenOpacity !== "0") throw new Error(`green opacity=${frameState.greenOpacity}`);
              if (frameState.discDisplay !== "none") throw new Error(`disc display=${frameState.discDisplay}`);
              return { greenOpacity: frameState.greenOpacity, discDisplay: frameState.discDisplay };
            });
            await step(result, "runtime-errors", async () => {
              const errors = pageErrors.slice(pageErrorOffset);
              if (errors.length) throw new Error(errors.join(" | "));
              return { count: 0 };
            });
          } catch (error) {
            markFailure(result, error);
          } finally {
            try {
              await page.screenshot({ path: screenshot });
              result.screenshotCaptured = true;
            } catch (error) {
              result.screenshotCaptured = false;
              if (!result.error) markFailure(result, new Error(`screenshot: ${messageFor(error)}`));
            }
            receipt.local.push(finishResult(result));
          }
        }
      }
    } finally {
      await context.close();
    }
  }

  const sourceJournalCss = await readFile(new URL("../public/journal/css/app-skins.css", import.meta.url));
  const builtAssets = await readdir(new URL("../dist/assets/", import.meta.url));
  const hostCssName = builtAssets.find((name) => /^index-[\w-]+\.css$/u.test(name));
  if (!hostCssName) throw new Error("local production build is missing its active host stylesheet");
  const builtHostCss = await readFile(new URL(`../dist/assets/${hostCssName}`, import.meta.url));
  const builtHostCssText = builtHostCss.toString("utf8");

  for (const site of publicSites) {
    const assets = newResult({ scope: "deployed-assets", target: site.id, site: site.id, base: site.base });
    try {
      let rootHtml = "";
      await step(assets, "root-http", async () => {
        const response = await fetch(site.base, { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        rootHtml = await response.text();
        return { status: response.status, bytes: Buffer.byteLength(rootHtml) };
      });
      let deployedHostCss = rootHtml;
      await step(assets, "host-css-build-parity", async () => {
        const hostCssHref = rootHtml.match(/<link[^>]+href="([^"]*index-[^"]+\.css[^"]*)"/u)?.[1];
        if (hostCssHref) {
          const response = await fetch(new URL(hostCssHref, site.base), { cache: "no-store", signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error(`active stylesheet HTTP ${response.status}`);
          deployedHostCss = await response.text();
        }
        const matches = site.id === "sites"
          ? rootHtml.includes(builtHostCssText)
          : sha256(Buffer.from(deployedHostCss)) === sha256(builtHostCss);
        if (!matches) throw new Error("active host stylesheet differs from local production build");
        return { localFile: hostCssName, sha256: sha256(builtHostCss), delivery: hostCssHref ? "linked" : "inline" };
      });
      await step(assets, "host-gradient-contract", async () => {
        const missing = requiredHostSkinPatterns.filter((pattern) => !pattern.test(deployedHostCss)).map(String);
        if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
        for (const pattern of forbiddenHardStops) {
          if (pattern.test(deployedHostCss)) throw new Error(`legacy hard stop ${pattern}`);
        }
        return { required: requiredHostSkinPatterns.length, forbidden: forbiddenHardStops.length };
      });
      await step(assets, "journal-entry-version", async () => {
        const response = await fetch(new URL(`${site.journal}index.html?v=${skinAssetVersion}`, site.base), { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const journalHtml = await response.text();
        if (!journalHtml.includes(`css/app-skins.css?v=${skinAssetVersion}`)) throw new Error("journal does not reference the current skin stylesheet");
        if (/skins-v1/u.test(journalHtml)) throw new Error("journal still references skins-v1");
        return { status: response.status, v2Reference: true };
      });
      await step(assets, "journal-css-hash", async () => {
        const response = await fetch(new URL(`${site.journal}css/app-skins.css?v=${skinAssetVersion}`, site.base), { cache: "no-store", signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const deployed = await response.text();
        const deployedHash = sha256(Buffer.from(deployed));
        const sourceHash = sha256(sourceJournalCss);
        if (deployedHash !== sourceHash) throw new Error(`deployed=${deployedHash} source=${sourceHash}`);
        const missing = requiredJournalFragments.filter((fragment) => !deployed.includes(fragment));
        if (missing.length) throw new Error(`missing ${missing.join(", ")}`);
        for (const pattern of forbiddenHardStops) {
          if (pattern.test(deployed)) throw new Error(`legacy hard stop ${pattern}`);
        }
        return { sha256: sourceHash, requiredFragments: requiredJournalFragments.length };
      });
      await step(assets, "active-resource-references", async () => {
        if (/skins-v1/u.test(rootHtml)) throw new Error("root still references skins-v1");
        const references = sameOriginAssetReferences(rootHtml, site.base);
        const statuses = await Promise.all(references.map(async (url) => {
          const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30000) });
          return { url, status: response.status, ok: response.ok };
        }));
        const failed = statuses.filter((entry) => !entry.ok);
        if (failed.length) throw new Error(failed.map((entry) => `${entry.status} ${entry.url}`).join(" | "));
        return { count: statuses.length, resources: statuses };
      });
      if (site.id === "pages") {
        await step(assets, "pages-release-receipt", async () => {
          const response = await fetch(new URL("source.json", site.base), { cache: "no-store", signal: AbortSignal.timeout(30000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const source = await response.json();
          if (source.release !== "v223") throw new Error(`release=${source.release}`);
          if (source.sourceCommit !== "adecb7867448d1f93677f98c590ad340da343e7c") throw new Error(`sourceCommit=${source.sourceCommit}`);
          return { release: source.release, sourceCommit: source.sourceCommit };
        });
      }
    } catch (error) {
      markFailure(assets, error);
    } finally {
      receipt.assets.push(finishResult(assets));
    }

    for (const [width, height] of sizes) {
      const target = `${site.id}/${width}x${height}`;
      const result = newResult({ scope: "public-unauthenticated", target, site: site.id, viewport: `${width}x${height}` });
      const screenshot = path.join(output, `public-${site.id}-auth-${width}x${height}.png`);
      result.screenshot = screenshot;
      const context = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
        locale: "zh-CN",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      try {
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await step(result, "public-route", async () => {
          const response = await page.goto(`${site.base}?demo=1#tab=record&module=mood&view=editor`, { waitUntil: "domcontentloaded", timeout: 60000 });
          if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "none"}`);
          return { status: response.status(), url: page.url() };
        });
        await step(result, "real-login-boundary", async () => {
          await page.locator('input[autocomplete="username"]').waitFor({ state: "visible", timeout: 40000 });
          const phoneFrames = await page.locator(".phone-frame").count();
          if (phoneFrames !== 0) throw new Error(`phone frame count=${phoneFrames}`);
          return { loginVisible: true, demoBypassDenied: true };
        });
        await step(result, "responsive-login", async () => {
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 1) throw new Error(`horizontal overflow=${overflow}px`);
          return { horizontalOverflow: overflow };
        });
        await step(result, "runtime-errors", async () => {
          if (pageErrors.length) throw new Error(pageErrors.join(" | "));
          return { count: 0 };
        });
        await page.screenshot({ path: screenshot });
        result.screenshotCaptured = true;
      } catch (error) {
        markFailure(result, error);
        try {
          const pages = context.pages();
          if (pages[0]) {
            await pages[0].screenshot({ path: screenshot });
            result.screenshotCaptured = true;
          }
        } catch {
          result.screenshotCaptured = false;
        }
      } finally {
        receipt.public.push(finishResult(result));
        await context.close();
      }
    }
  }
} catch (error) {
  receipt.errors.push(`fatal: ${messageFor(error)}`);
} finally {
  await browser?.close().catch((error) => receipt.errors.push(`browser-close: ${messageFor(error)}`));
  await server?.close().catch((error) => receipt.errors.push(`server-close: ${messageFor(error)}`));
  const allResults = [...receipt.assets, ...receipt.local, ...receipt.public];
  const checks = allResults.flatMap((result) => result.checks);
  receipt.summary = {
    results: allResults.length,
    passedResults: allResults.filter((result) => result.passed).length,
    failedResults: allResults.filter((result) => !result.passed).length,
    checks: checks.length,
    passedChecks: checks.filter((check) => check.passed).length,
    failedChecks: checks.filter((check) => !check.passed).length,
    localResults: receipt.local.length,
    assetResults: receipt.assets.length,
    publicResults: receipt.public.length,
    screenshots: [...receipt.local, ...receipt.public].filter((result) => result.screenshotCaptured).length,
  };
  receipt.passed = receipt.summary.failedResults === 0 && receipt.errors.length === 0
    && receipt.local.length === 48 && receipt.assets.length === 2 && receipt.public.length === 8;
  receipt.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "report.json"), JSON.stringify(receipt, null, 2));
}

if (receipt.passed) {
  console.log(`Skin deployment gate passed: ${receipt.summary.passedResults} results, ${receipt.summary.passedChecks} checks, ${receipt.summary.screenshots} screenshots.`);
} else {
  console.error(`Skin deployment gate failed: ${receipt.summary.failedResults} results and ${receipt.summary.failedChecks} checks failed.`);
  console.error(`See ${path.join(output, "report.json")}`);
  process.exitCode = 1;
}
