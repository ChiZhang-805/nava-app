// Cross-browser accessibility, performance and responsive-layout gate for the
// two Figma-derived skins. It uses an isolated local authenticated shell and
// never allows journal writes or AI requests to reach production.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv(process.cwd());
process.env.PLAYWRIGHT_BROWSERS_PATH ||= "Q:/NAVA-Workspace/NAVA-App/Caches/ms-playwright";
const { chromium, firefox, webkit } = await import("@playwright/test");

const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const output = outputArgument?.slice("--output=".length) || "Q:/NAVA-Workspace/NAVA-App/Build/TestRuns/skin-cross-browser-quality";
await mkdir(output, { recursive: true });

const sizes = [[360, 740], [375, 812], [390, 844], [430, 932]];
const skins = ["violet-dusk", "sky-ripple"];
const modules = ["sleep", "exercise", "mood", "focus", "diet", "face"];
const category = (module) => module === "exercise" ? "sport" : module === "diet" ? "food" : module;
const engines = { chromium, firefox, webkit };
const publicSites = [
  { id: "sites", base: "https://nava-app-preview-cz.chizhang1031.chatgpt.site/" },
  { id: "pages", base: "https://chizhang-805.github.io/nava-app-preview/" },
];
const messageFor = (error) => error instanceof Error ? error.message : String(error);
const isIsolatedFirefoxRealtimeDiagnostic = (entry, engine) => engine === "firefox"
  && entry.type === "console"
  && /wxteapvwagvhhtrjrbim\.supabase\.co\/realtime\/v1\/websocket/u.test(entry.message)
  && (/Cookie .__cf_bm. has been rejected for invalid domain/u.test(entry.message)
    || /connection to wss:\/\/.* was interrupted while the page was loading/u.test(entry.message));
const report = {
  schemaVersion: 1,
  audit: "skin-cross-browser-quality",
  startedAt: new Date().toISOString(),
  passed: false,
  configuration: {
    output,
    browserCache: process.env.PLAYWRIGHT_BROWSERS_PATH,
    engines: Object.keys(engines),
    sizes: sizes.map(([width, height]) => `${width}x${height}`),
    skins,
    modules,
    performanceBudgetsMs: { localRouteReady: 8000, iframeNavigation: 5000, publicLoginReady: 10000 },
    minimumTouchTargetPx: 24,
  },
  engineAvailability: [],
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

function fail(result, error) {
  result.error = messageFor(error);
  report.errors.push(`${result.scope} ${result.target}: ${result.error}`);
}

function finish(result) {
  result.passed = !result.error && result.checks.length > 0 && result.checks.every((check) => check.passed);
  return result;
}

async function prepareContext(browser, width, height) {
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
  await page.evaluate(() => { location.hash = "tab=profile&view=skin"; });
  await page.locator(".profile-skin-card").waitFor({ state: "visible", timeout: 30000 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.waitForTimeout(350);
    if (await page.locator(".completion-celebration-layer").isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await page.locator(".completion-celebration-layer").waitFor({ state: "detached", timeout: 10000 });
    }
  }
  await page.locator(`.profile-skin-card .app-skin-option--${skin}`).click({ force: true });
  await page.waitForFunction((expected) => document.querySelector(".phone-frame")?.getAttribute("data-app-skin") === expected, skin, { timeout: 10000 });
}

async function accessibilitySnapshot(frame) {
  return frame.locator("html").evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    };
    const accessibleName = (element) => {
      const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/u)
        .map((id) => document.getElementById(id)?.textContent?.trim() || "").filter(Boolean).join(" ");
      const labels = "labels" in element && element.labels ? [...element.labels].map((label) => label.textContent?.trim() || "").filter(Boolean).join(" ") : "";
      return element.getAttribute("aria-label")?.trim() || labelledBy || labels || element.getAttribute("title")?.trim()
        || ((element.tagName === "BUTTON" || element.tagName === "A") ? element.textContent?.trim() : "") || "";
    };
    const selector = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])';
    const elements = [...document.querySelectorAll(selector)].filter((element) => visible(element) && !element.hasAttribute("disabled"));
    const controls = elements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      return {
        index,
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        className: typeof element.className === "string" ? element.className : "",
        name: accessibleName(element),
        tabIndex: element.tabIndex,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        inlineTargetException: element.matches(".estimate-time") && Boolean(element.closest("label")),
      };
    });

    const parseColor = (value) => {
      const match = value.match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+(\d+(?:\.\d+)?))?\)/u);
      return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
    };
    const composite = (foreground, background) => foreground.slice(0, 3).map((value, index) => value * foreground[3] + background[index] * (1 - foreground[3]));
    const luminance = (rgb) => {
      const channels = rgb.map((value) => {
        const channel = value / 255;
        return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const contrast = (one, two) => {
      const first = luminance(one);
      const second = luminance(two);
      return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
    };
    const backgroundFor = (element) => {
      let current = element.parentElement;
      while (current) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > .05) return composite(color, [255, 255, 255]);
        current = current.parentElement;
      }
      return [255, 255, 255];
    };
    const textElements = [...document.querySelectorAll('#screen[data-scene="entry"] :is(h1,h2,h3,label,.eyebrow,.field-label,.section-label)')]
      .filter((element) => visible(element) && element.textContent?.trim());
    const contrastSamples = textElements.map((element) => {
      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      const background = backgroundFor(element);
      const ratio = foreground ? contrast(composite(foreground, background), background) : 0;
      const fontSize = Number.parseFloat(style.fontSize);
      const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
      const threshold = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700) ? 3 : 4.5;
      return {
        text: element.textContent.trim().replace(/\s+/gu, " ").slice(0, 80),
        color: style.color,
        fontSize,
        fontWeight,
        ratio: Math.round(ratio * 100) / 100,
        threshold,
        passed: ratio >= threshold,
      };
    });
    return {
      controls,
      unnamed: controls.filter((control) => !control.name),
      untabbable: controls.filter((control) => control.tabIndex < 0),
      undersized: controls.filter((control) => !control.inlineTargetException && (control.width < 24 || control.height < 24)),
      inlineTargetExceptions: controls.filter((control) => control.inlineTargetException),
      contrastSamples,
      contrastFailures: contrastSamples.filter((sample) => !sample.passed),
      domNodes: document.querySelectorAll("*").length,
    };
  });
}

let server;
try {
  server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "silent" });
  await server.listen();
  const localBase = server.resolvedUrls.local[0];
  await fetch(localBase, { signal: AbortSignal.timeout(30000) });

  for (const [engineName, browserType] of Object.entries(engines)) {
    let browser;
    try {
      browser = await browserType.launch({ headless: true });
      report.engineAvailability.push({ engine: engineName, available: true });
    } catch (error) {
      report.engineAvailability.push({ engine: engineName, available: false, error: messageFor(error) });
      report.errors.push(`engine ${engineName}: ${messageFor(error)}`);
      continue;
    }
    try {
      for (const [width, height] of sizes) {
        const context = await prepareContext(browser, width, height);
        try {
          const page = await context.newPage();
          const runtimeErrors = [];
          page.on("pageerror", (error) => runtimeErrors.push({ type: "pageerror", message: error.message }));
          page.on("console", (message) => {
            if (message.type() === "error") runtimeErrors.push({ type: "console", message: message.text() });
          });
          await page.goto(`${localBase}?demo=1#tab=profile`, { waitUntil: "domcontentloaded", timeout: 60000 });
          if (await page.locator(".launch-sequence").isVisible().catch(() => false)) await page.locator(".launch-sequence").click();

          for (const skin of skins) {
            let selectionError = null;
            try {
              await selectSkin(page, skin);
            } catch (error) {
              selectionError = error;
            }
            for (const module of modules) {
              const target = `${engineName}/${skin}/${module}/${width}x${height}`;
              const result = newResult({ scope: "cross-browser-local", target, engine: engineName, skin, module, viewport: `${width}x${height}` });
              const screenshot = path.join(output, `${engineName}-${skin}-${module}-${width}x${height}.png`);
              result.screenshot = screenshot;
              const runtimeOffset = runtimeErrors.length;
              try {
                await step(result, "skin-selection", async () => {
                  if (selectionError) throw selectionError;
                  const selected = await page.locator(".phone-frame").getAttribute("data-app-skin");
                  if (selected !== skin) throw new Error(`expected ${skin}, received ${selected}`);
                  return { selected };
                });
                let routeReadyMs = 0;
                await step(result, "first-screen-performance", async () => {
                  const started = performance.now();
                  await page.evaluate((nextModule) => { location.hash = `tab=record&module=${nextModule}&view=editor`; }, module);
                  await page.locator(".journal-experience iframe").waitFor({ state: "visible", timeout: 30000 });
                  await page.waitForFunction(() => !document.querySelector(".journal-loading"), undefined, { timeout: 30000 });
                  const frame = page.frameLocator(".journal-experience iframe");
                  await frame.locator('#screen[data-scene="entry"]').waitFor({ state: "visible", timeout: 30000 });
                  routeReadyMs = Math.round((performance.now() - started) * 10) / 10;
                  const navigation = await frame.locator("html").evaluate(() => {
                    const entry = performance.getEntriesByType("navigation")[0];
                    return entry ? {
                      duration: Math.round(entry.duration * 10) / 10,
                      domContentLoaded: Math.round(entry.domContentLoadedEventEnd * 10) / 10,
                      loadEventEnd: Math.round(entry.loadEventEnd * 10) / 10,
                      resources: performance.getEntriesByType("resource").length,
                    } : null;
                  });
                  if (routeReadyMs > 8000) throw new Error(`route ready ${routeReadyMs}ms > 8000ms`);
                  if (navigation?.duration > 5000) throw new Error(`iframe navigation ${navigation.duration}ms > 5000ms`);
                  return { routeReadyMs, iframeNavigation: navigation };
                });
                const frame = page.frameLocator(".journal-experience iframe");
                await step(result, "route-and-responsive-contract", async () => {
                  const attributes = {
                    skin: await frame.locator("html").getAttribute("data-app-skin"),
                    category: await frame.locator("html").getAttribute("data-record-module"),
                  };
                  const overflow = await frame.locator("html").evaluate(() => Math.max(
                    document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    document.body.scrollWidth - document.body.clientWidth,
                  ));
                  if (attributes.skin !== skin || attributes.category !== category(module)) throw new Error(JSON.stringify(attributes));
                  if (overflow > 1) throw new Error(`horizontal overflow=${overflow}px`);
                  return { ...attributes, horizontalOverflow: overflow };
                });
                const accessibility = await accessibilitySnapshot(frame);
                await step(result, "accessible-names-and-targets", async () => {
                  if (accessibility.controls.length === 0) throw new Error("no visible interactive controls");
                  if (accessibility.unnamed.length) throw new Error(`unnamed=${JSON.stringify(accessibility.unnamed)}`);
                  if (accessibility.untabbable.length) throw new Error(`untabbable=${JSON.stringify(accessibility.untabbable)}`);
                  if (accessibility.undersized.length) throw new Error(`undersized=${JSON.stringify(accessibility.undersized)}`);
                  return {
                    controls: accessibility.controls.length,
                    minimumWidth: Math.min(...accessibility.controls.map((control) => control.width)),
                    minimumHeight: Math.min(...accessibility.controls.map((control) => control.height)),
                    inlineTargetExceptions: accessibility.inlineTargetExceptions,
                  };
                });
                await step(result, "keyboard-focus", async () => {
                  const first = frame.locator('button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])').filter({ visible: true }).first();
                  await first.focus();
                  const before = await frame.locator("html").evaluate(() => {
                    const selector = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])';
                    return {
                      index: [...document.querySelectorAll(selector)].indexOf(document.activeElement),
                      tag: document.activeElement?.tagName,
                      className: typeof document.activeElement?.className === "string" ? document.activeElement.className : "",
                    };
                  });
                  await page.keyboard.press("Tab");
                  const after = await frame.locator("html").evaluate(() => {
                    const active = document.activeElement;
                    const style = active ? getComputedStyle(active) : null;
                    const selector = 'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [tabindex]:not([tabindex="-1"])';
                    return {
                      index: [...document.querySelectorAll(selector)].indexOf(active),
                      tag: active?.tagName,
                      className: typeof active?.className === "string" ? active.className : "",
                      tabIndex: active instanceof HTMLElement ? active.tabIndex : -1,
                      outlineStyle: style?.outlineStyle,
                      outlineWidth: style?.outlineWidth,
                      boxShadow: style?.boxShadow,
                    };
                  });
                  const moved = before.index !== after.index;
                  const visibleIndicator = after.outlineStyle !== "none" && after.outlineWidth !== "0px" || after.boxShadow !== "none";
                  if (!moved || ["BODY", "HTML", undefined].includes(after.tag)) throw new Error(`focus did not advance: ${JSON.stringify({ before, after })}`);
                  if (!visibleIndicator) throw new Error(`no visible focus indicator: ${JSON.stringify(after)}`);
                  return { before, after, visibleIndicator };
                });
                await step(result, "console-and-page-errors", async () => {
                  const diagnostics = runtimeErrors.slice(runtimeOffset);
                  const ignoredExternalDiagnostics = diagnostics.filter((entry) => isIsolatedFirefoxRealtimeDiagnostic(entry, engineName));
                  const errors = diagnostics.filter((entry) => !isIsolatedFirefoxRealtimeDiagnostic(entry, engineName));
                  if (errors.length) throw new Error(JSON.stringify(errors));
                  return { count: 0, ignoredExternalDiagnostics };
                });
                await step(result, "text-contrast", async () => {
                  if (accessibility.contrastSamples.length === 0) throw new Error("no essential text contrast samples");
                  if (accessibility.contrastFailures.length) throw new Error(JSON.stringify(accessibility.contrastFailures));
                  return {
                    samples: accessibility.contrastSamples.length,
                    minimumRatio: Math.min(...accessibility.contrastSamples.map((sample) => sample.ratio)),
                    domNodes: accessibility.domNodes,
                  };
                });
              } catch (error) {
                fail(result, error);
              } finally {
                try {
                  await page.screenshot({ path: screenshot });
                  result.screenshotCaptured = true;
                } catch {
                  result.screenshotCaptured = false;
                }
                report.local.push(finish(result));
              }
            }
          }
        } finally {
          await context.close();
        }
      }

      for (const site of publicSites) {
        for (const [width, height] of sizes) {
          const target = `${engineName}/${site.id}/${width}x${height}`;
          const result = newResult({ scope: "cross-browser-public", target, engine: engineName, site: site.id, viewport: `${width}x${height}` });
          const screenshot = path.join(output, `${engineName}-public-${site.id}-${width}x${height}.png`);
          result.screenshot = screenshot;
          const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, locale: "zh-CN", reducedMotion: "reduce", serviceWorkers: "block" });
          try {
            const page = await context.newPage();
            const runtimeErrors = [];
            page.on("pageerror", (error) => runtimeErrors.push({ type: "pageerror", message: error.message }));
            page.on("console", (message) => {
              if (message.type() === "error") runtimeErrors.push({ type: "console", message: message.text() });
            });
            await step(result, "public-login-performance", async () => {
              const started = performance.now();
              const response = await page.goto(`${site.base}?demo=1#tab=record&module=mood&view=editor`, { waitUntil: "domcontentloaded", timeout: 60000 });
              await page.locator('input[autocomplete="username"]').waitFor({ state: "visible", timeout: 40000 });
              const readyMs = Math.round((performance.now() - started) * 10) / 10;
              if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? "none"}`);
              if (readyMs > 10000) throw new Error(`login ready ${readyMs}ms > 10000ms`);
              return { status: response.status(), readyMs };
            });
            await step(result, "public-login-boundary", async () => {
              const phoneFrames = await page.locator(".phone-frame").count();
              const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
              if (phoneFrames) throw new Error(`phone frame count=${phoneFrames}`);
              if (overflow > 1) throw new Error(`horizontal overflow=${overflow}px`);
              return { demoBypassDenied: true, horizontalOverflow: overflow };
            });
            await step(result, "public-console-and-page-errors", async () => {
              if (runtimeErrors.length) throw new Error(JSON.stringify(runtimeErrors));
              return { count: 0 };
            });
            await page.screenshot({ path: screenshot });
            result.screenshotCaptured = true;
          } catch (error) {
            fail(result, error);
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
            report.public.push(finish(result));
            await context.close();
          }
        }
      }
      console.log(`${engineName}: completed ${sizes.length * skins.length * modules.length} local and ${publicSites.length * sizes.length} public states.`);
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  report.errors.push(`fatal: ${messageFor(error)}`);
} finally {
  await server?.close().catch((error) => report.errors.push(`server-close: ${messageFor(error)}`));
  const results = [...report.local, ...report.public];
  const checks = results.flatMap((result) => result.checks);
  report.summary = {
    results: results.length,
    passedResults: results.filter((result) => result.passed).length,
    failedResults: results.filter((result) => !result.passed).length,
    checks: checks.length,
    passedChecks: checks.filter((check) => check.passed).length,
    failedChecks: checks.filter((check) => !check.passed).length,
    localResults: report.local.length,
    publicResults: report.public.length,
    screenshots: results.filter((result) => result.screenshotCaptured).length,
  };
  report.passed = report.engineAvailability.length === 3 && report.engineAvailability.every((entry) => entry.available)
    && report.local.length === 144 && report.public.length === 24
    && report.summary.failedResults === 0 && report.errors.length === 0;
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
}

if (report.passed) {
  console.log(`Cross-browser skin quality gate passed: ${report.summary.passedResults} results, ${report.summary.passedChecks} checks, ${report.summary.screenshots} screenshots.`);
} else {
  console.error(`Cross-browser skin quality gate failed: ${report.summary.failedResults} results and ${report.summary.failedChecks} checks failed.`);
  console.error(`See ${path.join(output, "report.json")}`);
  process.exitCode = 1;
}
