import assert from "node:assert/strict";
import test from "node:test";
import {
  fallbackShellRoute,
  hasPreviousShellRoute,
  nextShellHistoryState,
  normalizeShellRoute,
  shellHistoryDepth,
  shellRoutesEqual,
} from "../src/services/shellHistory.ts";

test("normalizes shell routes and preserves profile subpages", () => {
  assert.deepEqual(normalizeShellRoute("profile", "diet", "skin"), { tab: "profile", module: null, view: "skin" });
  assert.deepEqual(normalizeShellRoute("record", "diet", "overview"), { tab: "record", module: "diet", view: null });
  assert.deepEqual(normalizeShellRoute("today", null, "calendar"), { tab: "today", module: null, view: "calendar" });
});

test("fallbacks only cover direct entry without overwriting real history", () => {
  const historyView = normalizeShellRoute("record", "diet", "history");
  const moduleView = fallbackShellRoute(historyView);
  const recordHub = fallbackShellRoute(moduleView);
  assert.deepEqual(moduleView, { tab: "record", module: "diet", view: null });
  assert.deepEqual(recordHub, { tab: "record", module: null, view: null });
  assert.deepEqual(fallbackShellRoute(normalizeShellRoute("profile")), { tab: "today", module: null, view: null });
  assert.deepEqual(fallbackShellRoute(normalizeShellRoute("profile", null, "privacy")), { tab: "profile", module: null, view: null });
  assert.deepEqual(fallbackShellRoute(normalizeShellRoute("today", null, "day-2026-08-30")), { tab: "today", module: null, view: "calendar" });
  assert.deepEqual(fallbackShellRoute(normalizeShellRoute("today", null, "calendar")), { tab: "today", module: null, view: null });
});

test("accepts only a positive NAVA history depth as a previous page", () => {
  assert.equal(shellHistoryDepth(null), 0);
  assert.equal(shellHistoryDepth({ navaShell: true, depth: -1 }), 0);
  assert.equal(hasPreviousShellRoute({ navaShell: true, depth: 0 }), false);
  assert.equal(hasPreviousShellRoute({ navaShell: true, depth: 3 }), true);
});

test("builds a multi-entry history depth and preserves it on replacement", () => {
  const root = { navaShell: true as const, depth: 0, route: normalizeShellRoute("today") };
  const report = nextShellHistoryState(root, normalizeShellRoute("record"));
  const diet = nextShellHistoryState(report, normalizeShellRoute("record", "diet"));
  const editor = nextShellHistoryState(diet, normalizeShellRoute("record", "diet", "editor"));
  const replacedEditor = nextShellHistoryState(editor, normalizeShellRoute("record", "diet"), true);
  assert.equal(report.depth, 1);
  assert.equal(diet.depth, 2);
  assert.equal(editor.depth, 3);
  assert.equal(replacedEditor.depth, 3);
});

test("same-route detection prevents duplicate bottom-navigation entries", () => {
  const first = normalizeShellRoute("record", "sleep", "history");
  const same = normalizeShellRoute("record", "sleep", "history");
  const different = normalizeShellRoute("record", "sleep", "editor");
  assert.equal(shellRoutesEqual(first, same), true);
  assert.equal(shellRoutesEqual(first, different), false);
});
