import test from "node:test";
import assert from "node:assert/strict";
import { deviceLocale, localePreference } from "../src/services/localePreference.ts";

test("initial language follows the ordered supported device languages", () => {
  assert.equal(deviceLocale(["en-US", "zh-CN"]), "en");
  assert.equal(deviceLocale(["zh-Hans-CN", "en-US"]), "zh");
  assert.equal(deviceLocale(["zh-TW"]), "zh");
  assert.equal(deviceLocale(["fr-FR", "en-GB", "zh"]), "en");
  assert.equal(deviceLocale(["ja", "zh"]), "zh");
  assert.equal(deviceLocale(["de"]), "en");
  assert.equal(deviceLocale([]), "en");
});
test("manual legacy selections survive; absent or damaged preferences follow device", () => {
  assert.equal(localePreference("zh"), "zh");
  assert.equal(localePreference("en"), "en");
  for (const value of [null, "", "broken", "system"]) assert.equal(localePreference(value), "system");
});
