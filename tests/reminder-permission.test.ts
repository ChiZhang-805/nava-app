import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { ensureReminderPermission, reminderPermissionGranted } from "../src/services/reminderPermission.ts";

test("notification authorization is explicit, denied never re-prompts, and granted stays quiet", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Notification");
  let permission = "default", answer = "default", requests = 0;
  Object.defineProperty(globalThis, "Notification", { configurable: true, value: {
    get permission() { return permission; },
    async requestPermission() { requests++; permission = answer; return answer; },
  } });
  try {
    assert.equal(await reminderPermissionGranted(), false);
    assert.equal(requests, 0);
    assert.equal(await ensureReminderPermission("en"), "cancelled");
    assert.equal(requests, 1);
    answer = "denied";
    assert.equal(await ensureReminderPermission("zh"), "denied");
    assert.equal(await ensureReminderPermission("zh"), "denied");
    assert.equal(requests, 2);
    permission = "granted";
    assert.equal(await ensureReminderPermission("en"), "granted");
    assert.equal(await reminderPermissionGranted(), true);
    assert.equal(requests, 2);
    Object.defineProperty(globalThis, "Notification", { configurable: true, value: undefined });
    assert.equal(await ensureReminderPermission("en"), "unsupported");
    assert.equal(await reminderPermissionGranted(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "Notification", original);
    else Reflect.deleteProperty(globalThis, "Notification");
  }
});

test("native permission bridge uses Apple's real authorization and settings APIs", () => {
  const source = readFileSync(new URL("../ios/App/App/NavaBridgeViewController.swift", import.meta.url), "utf8");
  for (const contract of ["NavaNotificationPermissionPlugin()", "getNotificationSettings", "case .authorized:", "case .notDetermined:", "requestAuthorization(options: [.alert, .sound, .badge])", "UIAlertController", "openNotificationSettingsURLString", "openSettingsURLString", "UIApplication.shared.open"])
    assert.ok(source.includes(contract), `missing ${contract}`);
});
