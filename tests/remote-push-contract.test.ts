import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/services/remotePush.ts", root), "utf8");
const dispatch = readFileSync(new URL("supabase/functions/push-dispatch/index.ts", root), "utf8");
const migration = readFileSync(new URL("supabase/migrations/202609070005_remote_push_devices.sql", root), "utf8");
const delegate = readFileSync(new URL("ios/App/App/AppDelegate.swift", root), "utf8");
const entitlements = readFileSync(new URL("ios/App/App/App.entitlements", root), "utf8");
const androidManifest = readFileSync(new URL("android/app/src/main/AndroidManifest.xml", root), "utf8");
const androidBuild = readFileSync(new URL("android/app/build.gradle", root), "utf8");
const androidInstrumentedTest = readFileSync(new URL("android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java", root), "utf8");

test("native shells register revocable account-scoped push devices", () => {
  assert.match(source, /PushNotifications\.register\(\)/);
  assert.match(source, /from\("push_device_tokens"\)\.upsert/);
  assert.match(source, /PushNotifications\.unregister\(\)/);
  assert.match(source, /token_hash: await sha256/);
  assert.doesNotMatch(source, /console\.(?:log|info)\([^\n]*token/i);
  assert.match(delegate, /capacitorDidRegisterForRemoteNotifications/);
  assert.match(entitlements, /aps-environment/);
  assert.match(androidManifest, /android:screenOrientation="portrait"/);
  assert.match(androidManifest, /android:allowBackup="false"/);
  assert.match(androidManifest, /com\.google\.firebase\.messaging\.default_notification_icon/);
  assert.match(androidManifest, /com\.google\.firebase\.messaging\.default_notification_channel_id/);
  assert.match(androidManifest, /@drawable\/nava_launcher/);
  assert.match(androidBuild, /applicationId "health\.nava\.mobile"/);
  assert.match(androidInstrumentedTest, /health\.nava\.mobile/);
  assert.ok(existsSync(new URL("android/app/build.gradle", root)));
  assert.ok(existsSync(new URL("android/app/src/main/res/drawable-nodpi/nava_launcher.png", root)));
  assert.ok(existsSync(new URL("android/app/src/main/res/drawable/ic_stat_nava.xml", root)));
});

test("remote dispatcher supports APNs, FCM, and HMS without exposing provider credentials", () => {
  for (const provider of ["api.push.apple.com", "fcm.googleapis.com", "push-api.cloud.huawei.com"]) assert.match(dispatch, new RegExp(provider.replaceAll(".", "\\.")));
  for (const secret of ["APNS_PRIVATE_KEY", "FIREBASE_SERVICE_ACCOUNT_JSON", "HMS_CLIENT_SECRET", "NAVA_PUSH_DISPATCH_SECRET"]) assert.match(dispatch, new RegExp(secret));
  assert.match(dispatch, /push_delivery_receipts/);
  assert.match(dispatch, /secureEquals/);
  assert.doesNotMatch(dispatch, /console\.(?:log|info)/);
  assert.match(migration, /push_device_tokens[\s\S]*ON DELETE CASCADE/);
  assert.match(migration, /FOREIGN KEY \(user_id, notification_id\)[\s\S]*user_notifications\(user_id, id\)/);
  assert.match(migration, /FOREIGN KEY \(user_id, device_token_id\)[\s\S]*push_device_tokens\(user_id, id\)/);
  assert.match(migration, /push_delivery_receipts[\s\S]*UNIQUE \(user_id, notification_id, device_token_id\)/);
});
