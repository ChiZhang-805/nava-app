import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const bootstrap = readFileSync(new URL("../src/AppBootstrap.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("authenticated startup has one visible application path without a blank readiness gate", () => {
  assert.doesNotMatch(bootstrap, /authenticated-app-gate|readyUserId|preserveSubmittedAuthScreen/);
  assert.match(bootstrap, /<Suspense fallback=\{<div className="nava-app-stage"><LoadingScreen \/>/);
  assert.doesNotMatch(app, /checkingOnboarding\)[\s\S]{0,100}<AuthScreen transitionPending/);
  assert.match(app, /else if \(checkingOnboarding\) \{\s*screen = <DelayedLoadingScreen \/>/);
});
