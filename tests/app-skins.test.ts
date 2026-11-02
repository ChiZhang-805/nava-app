import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_SKINS, appSkinStorageKey, defaultAppSkin, normalizeAppSkin, readAppSkin, writeAppSkin } from "../src/services/appSkin.ts";

function relativeLuminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/giu)?.map((value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  assert.ok(channels && channels.length === 3);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + .05) / (Math.min(foregroundLuminance, backgroundLuminance) + .05);
}

test("the application exposes exactly three uniquely named skins", () => {
  assert.deepEqual(APP_SKINS.map((skin) => skin.id), ["glacier-mist", "violet-dusk", "sky-ripple"]);
  assert.equal(new Set(APP_SKINS.map((skin) => skin.name)).size, 3);
  assert.ok(APP_SKINS.every((skin) => [...skin.name].length === 4));
});

test("unknown or damaged skin preferences safely fall back to the original skin", () => {
  assert.equal(normalizeAppSkin(null), defaultAppSkin);
  assert.equal(normalizeAppSkin("unknown"), defaultAppSkin);
  assert.equal(normalizeAppSkin("violet-dusk"), "violet-dusk");
});

test("skin storage is scoped to the authenticated user", () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
  writeAppSkin("sky-ripple", "user-a");
  writeAppSkin("violet-dusk", "user-b");
  assert.equal(readAppSkin("user-a"), "sky-ripple");
  assert.equal(readAppSkin("user-b"), "violet-dusk");
  assert.notEqual(appSkinStorageKey("user-a"), appSkinStorageKey("user-b"));
});

test("journal iframe receives and applies the selected skin without receiving credentials", async () => {
  const [host, bridge, html, journalApp] = await Promise.all([
    readFile(new URL("../src/features/JournalExperience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/journal/js/nava-bridge.js", import.meta.url), "utf8"),
    readFile(new URL("../public/journal/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/journal/js/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(host, /skin=\$\{encodeURIComponent\(skin\)\}/);
  assert.match(host, /category=\$\{encodeURIComponent\(categoryMap\[module\]\)\}/);
  assert.match(host, /locale,skin,forceGuide/);
  assert.match(bridge, /document\.documentElement\.dataset\.appSkin/);
  assert.match(bridge, /document\.documentElement\.dataset\.recordModule/);
  assert.match(html, /css\/app-skins\.css/);
  assert.match(journalApp, /document\.documentElement\.dataset\.recordModule = state\.category/);
  assert.doesNotMatch(host, /access_token|service_role/);
});

test("alternate skins preserve the Figma gradient distributions without hard-edged decoration discs", async () => {
  const [hostStyles, journalStyles] = await Promise.all([
    readFile(new URL("../src/styles/app-skins.css", import.meta.url), "utf8"),
    readFile(new URL("../public/journal/css/app-skins.css", import.meta.url), "utf8"),
  ]);
  assert.match(hostStyles, /rgba\(109,178,238,\.34\).*rgba\(109,178,238,0\) 36%/s);
  assert.match(hostStyles, /rgba\(83,210,202,\.23\).*rgba\(83,210,202,0\) 42%/s);
  assert.match(hostStyles, /linear-gradient\(154deg, #f6efff 0%, #ddd8ff 42%, #d0f2f1 100%\)/);
  assert.match(journalStyles, /linear-gradient\(138\.82deg, #f8fbff 8\.57%, #f4f9fd 51\.66%, #fffdfb 91\.43%\)/);
  assert.match(journalStyles, /rgba\(124,180,235,\.30\).*rgba\(124,180,235,0\) 27%/s);
  for (const css of [hostStyles, journalStyles]) {
    assert.match(css, /linear-gradient\(142\.76deg, #787cfe 8\.63%, #d670c9 91\.37%\)/);
    assert.doesNotMatch(css, /0 20%, transparent 20\.5%|0 18%, transparent 18\.5%|0 24%, transparent 24\.5%/);
  }
});

test("alternate skin field labels retain WCAG AA contrast on their lightest and darkest surfaces", async () => {
  const [hostStyles, journalStyles, journalHtml] = await Promise.all([
    readFile(new URL("../src/styles/app-skins.css", import.meta.url), "utf8"),
    readFile(new URL("../public/journal/css/app-skins.css", import.meta.url), "utf8"),
    readFile(new URL("../public/journal/index.html", import.meta.url), "utf8"),
  ]);
  assert.match(hostStyles, /--skin-muted: #53617d/);
  assert.match(hostStyles, /--skin-muted: #52657a/);
  assert.match(journalStyles, /--muted: #53617d/);
  assert.match(journalStyles, /--muted: #52657a/);
  assert.ok(contrastRatio("53617d", "ecdffa") >= 4.5);
  assert.ok(contrastRatio("53617d", "e2f3fc") >= 4.5);
  assert.ok(contrastRatio("52657a", "dcedff") >= 4.5);
  assert.ok(contrastRatio("52657a", "f7f4ff") >= 4.5);
  assert.match(journalHtml, /css\/app-skins\.css\?v=20261009-skins-figma-layers-v5/);
});

test("alternate skins recolor the full chrome and module hierarchy with light navigation orbs", async () => {
  const [hostStyles, picker] = await Promise.all([
    readFile(new URL("../src/styles/app-skins.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/AppSkinPicker.tsx", import.meta.url), "utf8"),
  ]);
  for (const token of [
    "--skin-header:",
    "--skin-surface-alt:",
    "--skin-row:",
    "--skin-divider:",
    "--skin-module-mood:",
    "--skin-module-sleep:",
    "--skin-module-exercise:",
    "--skin-module-focus:",
    "--skin-module-diet:",
    "--skin-module-face:",
    "--skin-heat-4:",
  ]) assert.match(hostStyles, new RegExp(token));
  assert.match(hostStyles, /\.safe-top,\s*\n\.phone-frame\[data-app-skin\].*\.figma-app-header/s);
  assert.match(hostStyles, /:is\(\.section-card, \.figma-module-card, \.module-history-report-card/);
  assert.match(hostStyles, /:not\(\.phone-frame--option2\) \.bottom-nav/);
  assert.match(hostStyles, /\.ai-nav-orb \{ color: var\(--skin-nav-ink\); background: var\(--skin-dock-orb\)/);
  assert.doesNotMatch(hostStyles, /--skin-dock-orb:\s*linear-gradient\([^;]*#172d9d/);
  assert.doesNotMatch(hostStyles, /--skin-dock-orb:\s*linear-gradient\([^;]*#426f9e/);
  assert.match(picker, /className="app-skin-palette"/);
  assert.match(hostStyles, /\.app-skin-option--violet-dusk\s*\{[^}]*--choice-card:/s);
  assert.match(hostStyles, /\.app-skin-option--sky-ripple\s*\{[^}]*--choice-card:/s);
  assert.match(hostStyles, /data-app-skin="violet-dusk"\]:has\(\.profile-subpage\[data-profile-view="skin"\]\).*\.figma-app-header/s);
});

test("each Figma skin keeps distinct record-module surfaces in the embedded journal", async () => {
  const journalStyles = await readFile(new URL("../public/journal/css/app-skins.css", import.meta.url), "utf8");
  for (const skin of ["violet-dusk", "sky-ripple"]) {
    for (const module of ["sleep", "sport", "mood", "focus", "food", "face"]) {
      assert.match(journalStyles, new RegExp(`data-app-skin="${skin}"\\]\\[data-record-module="${module}"\\][^{]*\\{[^}]*--module-surface:`, "s"));
    }
  }
  assert.doesNotMatch(journalStyles, /--module-nav-orb:\s*linear-gradient\([^;]*#172d9d/);
  assert.doesNotMatch(journalStyles, /--module-nav-orb:\s*linear-gradient\([^;]*#426f9e/);
});

test("admin routes inherit every skin layer and the centre navigation uses one circle", async () => {
  const [skinStyles, adminStyles, adminView] = await Promise.all([
    readFile(new URL("../src/styles/app-skins.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/admin-console.css", import.meta.url), "utf8"),
    readFile(new URL("../src/features/AdminConsole.tsx", import.meta.url), "utf8"),
  ]);
  for (const token of [
    "--skin-page-background",
    "--skin-surface",
    "--skin-surface-alt",
    "--skin-surface-strong",
    "--skin-field",
    "--skin-button",
    "--skin-module-face",
    "--skin-module-sleep",
    "--skin-module-focus",
  ]) assert.match(adminStyles, new RegExp(`var\\(${token}`));
  assert.match(skinStyles, /\.points-shop-screen\s*\{[\s\S]*?background: transparent;/);
  assert.match(skinStyles, /:is\(\.points-shop-product-row, \.points-shop-detail, \.points-shop-cart-list article, \.points-shop-checkout, \.points-card-manager-summary\)[\s\S]*?background: var\(--skin-surface\);/);
  assert.match(skinStyles, /\.shop-checkout-experience[\s\S]*?background: var\(--skin-page-background\);/);
  for (const action of ["products", "notices", "roles"]) {
    assert.match(adminView, new RegExp(`data-admin-action="${action}"`));
    assert.match(adminStyles, new RegExp(`data-admin-action="${action}"`));
  }
  assert.match(skinStyles, /> \.bottom-nav \.ai-nav-button::after\s*\{[\s\S]*?content: none;/);
  assert.match(skinStyles, /> \.bottom-nav \.ai-nav-glow \{ display: none; \}/);
  assert.match(skinStyles, /> \.bottom-nav \.ai-nav-button\.selected\s*\{[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
});
