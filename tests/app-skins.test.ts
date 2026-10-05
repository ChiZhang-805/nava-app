import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_SKINS, appSkinStorageKey, defaultAppSkin, normalizeAppSkin, readAppSkin, writeAppSkin } from "../src/services/appSkin.ts";

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
  for (const css of [hostStyles, journalStyles]) {
    assert.match(css, /linear-gradient\(138\.82deg, #f8fbff 8\.57%, #f4f9fd 51\.66%, #fffdfb 91\.43%\)/);
    assert.match(css, /rgba\(124,180,235,\.30\).*rgba\(124,180,235,0\) 27%/s);
    assert.match(css, /linear-gradient\(142\.76deg, #787cfe 8\.63%, #d670c9 91\.37%\)/);
    assert.doesNotMatch(css, /0 20%, transparent 20\.5%|0 18%, transparent 18\.5%|0 24%, transparent 24\.5%/);
  }
});
