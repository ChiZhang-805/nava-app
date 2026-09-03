import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import { applyProjectPublicEnv } from "./project-env.mjs";

const root = process.cwd();
const port = Number(process.env.PORT || 5196);

applyProjectPublicEnv(root);

function attachRuntimeAudit(page, errors) {
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
}

async function dismissLaunch(page) {
  const launch = page.locator(".launch-sequence");
  if (await launch.isVisible().catch(() => false)) await launch.click({ force: true });
  await expect(page.locator(".auth-screen")).toBeVisible();
}

async function simulatePageTranslation(page) {
  await page.evaluate(() => {
    document.documentElement.classList.add("translated-ltr");
    document.documentElement.lang = "x-pseudo";

    const rootNode = document.querySelector("#root");
    if (!rootNode) throw new Error("React root is missing");
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node = walker.nextNode();
    while (node) {
      if (/\S/.test(node.nodeValue ?? "") && !node.parentElement?.closest("font")) textNodes.push(node);
      node = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const parent = textNode.parentNode;
      if (!parent) continue;
      const outer = document.createElement("font");
      outer.style.verticalAlign = "inherit";
      const inner = document.createElement("font");
      inner.style.verticalAlign = "inherit";
      inner.textContent = `[${textNode.nodeValue ?? ""}]`;
      outer.appendChild(inner);
      parent.insertBefore(outer, textNode);
      parent.removeChild(textNode);
    }
  });
}

async function exerciseReactTranslationCanary(page, { markDocument = true } = {}) {
  await page.evaluate(async () => {
    const ReactModule = await import("/node_modules/.vite/deps/react.js");
    const React = ReactModule.default ?? ReactModule;
    const ReactDomModule = await import("/node_modules/.vite/deps/react-dom_client.js");
    const createRoot = ReactDomModule.createRoot ?? ReactDomModule.default?.createRoot;
    if (!createRoot) throw new Error("React createRoot export is missing");
    const host = document.createElement("div");
    host.id = "translation-resilience-canary";
    document.body.appendChild(host);

    function Canary({ checked }) {
      return React.createElement("div", null, checked && "选中", !checked && "未选中");
    }

    const canaryRoot = createRoot(host);
    const renderCanary = (checked) => canaryRoot.render(React.createElement(Canary, { checked }));
    window.__setTranslationCanary = renderCanary;
    renderCanary(false);
  });
  await expect(page.locator("#translation-resilience-canary")).toHaveText("未选中");
  await page.evaluate((shouldMarkDocument) => {
    const host = document.querySelector("#translation-resilience-canary > div");
    const textNode = host?.firstChild;
    if (!host || !textNode || textNode.nodeType !== Node.TEXT_NODE) throw new Error("Canary text node is missing");
    if (shouldMarkDocument) {
      document.documentElement.classList.add("translated-ltr");
      document.documentElement.lang = "x-pseudo";
    }
    const outer = document.createElement("font");
    outer.style.verticalAlign = "inherit";
    const inner = document.createElement("font");
    inner.style.verticalAlign = "inherit";
    inner.textContent = `[${textNode.nodeValue ?? ""}]`;
    outer.appendChild(inner);
    host.insertBefore(outer, textNode);
    host.removeChild(textNode);
    window.__setTranslationCanary?.(true);
  }, markDocument);
  await expect(page.locator("#translation-resilience-canary")).toContainText("选中");
}

const server = await createServer({
  root,
  mode: "review",
  logLevel: "error",
  server: { host: "127.0.0.1", port, strictPort: true },
});
const browser = await chromium.launch();
const errors = [];

try {
  await server.listen();
  const authPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  attachRuntimeAudit(authPage, errors);
  await authPage.goto(`http://127.0.0.1:${port}/?demo=1`, { waitUntil: "domcontentloaded" });
  await dismissLaunch(authPage);

  await simulatePageTranslation(authPage);
  await exerciseReactTranslationCanary(authPage);
  await authPage.locator(".auth-mode-icon").click();
  await expect(authPage.locator(".auth-form--signUp")).toBeVisible();
  await expect(authPage.locator(".centered-screen h1")).toHaveCount(0);

  const extensionPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  attachRuntimeAudit(extensionPage, errors);
  await extensionPage.goto(`http://127.0.0.1:${port}/?demo=1`, { waitUntil: "domcontentloaded" });
  await dismissLaunch(extensionPage);
  await exerciseReactTranslationCanary(extensionPage, { markDocument: false });

  const todayContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await todayContext.addInitScript(() => {
    const nativeAllSettled = Promise.allSettled.bind(Promise);
    Promise.allSettled = async (values) => {
      const result = await nativeAllSettled(values);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return result;
    };
    window.sessionStorage.setItem("nava.review.demo.auth.v1", "signed-in");
    window.localStorage.setItem("nava.onboarding.v2.00000000-0000-4000-8000-000000000001", JSON.stringify({
      completed: true,
      completedAt: new Date().toISOString(),
      version: 2,
      answers: {},
    }));

    const translateInitialScores = () => {
      const scores = document.querySelector(".option-two-scores");
      const pendingValues = scores ? [...scores.querySelectorAll("strong")].filter((node) => node.textContent === "--") : [];
      if (pendingValues.length === 0) return false;
      document.documentElement.classList.add("translated-ltr");
      document.documentElement.lang = "x-pseudo";
      for (const value of pendingValues) {
        const textNode = [...value.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
        if (!textNode) continue;
        const outer = document.createElement("font");
        outer.style.verticalAlign = "inherit";
        const inner = document.createElement("font");
        inner.style.verticalAlign = "inherit";
        inner.textContent = `[${textNode.nodeValue ?? ""}]`;
        outer.appendChild(inner);
        value.insertBefore(outer, textNode);
        value.removeChild(textNode);
      }
      return true;
    };

    const observer = new MutationObserver(() => {
      if (translateInitialScores()) observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const todayPage = await todayContext.newPage();
  attachRuntimeAudit(todayPage, errors);
  await todayPage.goto(`http://127.0.0.1:${port}/?demo=1#tab=today`, { waitUntil: "domcontentloaded" });
  const todayLaunch = todayPage.locator(".launch-sequence");
  if (await todayLaunch.isVisible().catch(() => false)) await todayLaunch.click({ force: true });
  await expect(todayPage.locator(".phone-frame")).toBeVisible();
  await expect(todayPage.locator(".option-two-scores strong").first()).not.toHaveText("--");
  await expect(todayPage.locator(".centered-screen h1")).toHaveCount(0);
  await todayContext.close();

  const reconciliationErrors = errors.filter((message) => /removeChild|insertBefore|NAVA runtime error/i.test(message));
  if (reconciliationErrors.length > 0) {
    throw new Error(`Translation mutation caused React reconciliation errors:\n${reconciliationErrors.join("\n")}`);
  }

  console.log("Translation-mutation resilience: passed");
} finally {
  await browser.close();
  await server.close();
}
