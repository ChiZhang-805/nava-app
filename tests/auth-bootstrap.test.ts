import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const bootstrap = readFileSync(new URL("../src/AppBootstrap.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("sign-in keeps the login visible until the new account can render its saved skin", () => {
  assert.match(bootstrap, /\{\(!appUser \|\| preparingApp\) && \(/);
  assert.match(bootstrap, /<AuthScreen transitionPending=\{preparingApp\}/);
  assert.match(bootstrap, /<Suspense fallback=\{null\}>/);
  assert.match(bootstrap, /key=\{appUser.id\}/);
  assert.match(app, /useState<AppSkin>\(\(\) => readAppSkin\(/);
  assert.doesNotMatch(bootstrap, /LoadingScreen|LoadingShell|auth-skeleton/);
});

test("iOS retains the mounted session across backgrounding and system pickers", () => {
  const bridge = readFileSync(new URL("../ios/App/App/NavaBridgeViewController.swift", import.meta.url), "utf8");
  assert.doesNotMatch(bootstrap, /appStateChange|addListener\("pause"|nava:native-lock/);
  assert.doesNotMatch(bridge, /lockNativeExperience|nava:native-lock/);
  assert.match(bootstrap, /!loading && sessionUnlocked \? user : null/);
});
