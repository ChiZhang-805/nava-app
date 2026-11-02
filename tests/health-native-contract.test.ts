import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

test("browser auth remains tab-scoped while native auth uses Keychain", () => {
  const storage = read("src/services/authStorage.ts");
  const securePlugin = read("native/ios/NavaSecureStoragePlugin.swift");
  assert.match(storage, /window\.sessionStorage/);
  assert.match(storage, /Capacitor\.isNativePlatform\(\)/);
  assert.match(storage, /NavaSecureStorage/);
  assert.match(securePlugin, /kSecClassGenericPassword/);
  assert.match(securePlugin, /kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.doesNotMatch(securePlugin, /kSecAttrSynchronizable/);
});

test("native health sync uses authenticated ingest without client shared secrets or direct-write fallback", () => {
  const health = read("src/services/health.ts");
  const ingest = read("supabase/functions/health-sync-ingest/index.ts");
  assert.match(health, /"health-sync-ingest"/);
  assert.doesNotMatch(health, /HEALTH_EXPORT_API_KEY|VITE_HEALTH_EXPORT|x-api-key/);
  assert.doesNotMatch(health, /\.from\("health_metric_snapshots"\)/);
  assert.match(ingest, /requireUser\(req\)/);
  assert.match(ingest, /user_id: user\.id/);
});

test("missing HealthKit samples are omitted instead of becoming fabricated zeros", () => {
  const plugin = read("native/ios/NavaHealthPlugin.swift");
  const ingest = read("supabase/functions/health-sync-ingest/index.ts");
  assert.match(plugin, /completion\(statistics\?\.sumQuantity\(\)\?\.doubleValue/);
  assert.doesNotMatch(plugin, /sumQuantity\(\)\?\.doubleValue\(for: unit\) \?\? 0/);
  assert.match(plugin, /guard steps\[binStart\] != nil \|\| energy\[binStart\] != nil/);
  assert.match(plugin, /if !bins\.isEmpty/);
  assert.match(plugin, /sleep\.sampleCount > 0, sleep\.totalMinutes > 0/);
  assert.match(plugin, /"availableMetrics"/);
  assert.doesNotMatch(ingest, /Math\.round\(summary\.(steps|activeEnergyKcal|exerciseMinutes) \?\? 0\)/);
  assert.match(ingest, /Partial[\s\S]*must[\s\S]*not be represented here with invented zero values/);
});

test("HealthKit background changes are durable and wired into the app lifecycle", () => {
  const observer = read("native/ios/NavaHealthBackgroundObserver.swift");
  const appDelegate = read("ios/App/App/AppDelegate.swift");
  const entitlement = read("ios/App/App/App.entitlements");
  const hook = read("src/hooks/useNativeHealthAutoSync.ts");
  assert.match(observer, /HKObserverQuery/);
  assert.match(observer, /enableBackgroundDelivery/);
  assert.match(observer, /UserDefaults\.standard/);
  assert.match(observer, /defer \{ finish\(\) \}/);
  assert.match(observer, /private func recordPendingChange[\s\S]*stateQueue\.sync/);
  assert.match(appDelegate, /NavaHealthBackgroundObserver\.shared\.start\(\)/);
  assert.match(entitlement, /com\.apple\.developer\.healthkit\.background-delivery/);
  assert.match(hook, /appStateChange/);
  assert.match(hook, /readPendingNativeHealthUpdate/);
  const health = read("src/services/health.ts");
  assert.match(health, /acknowledgePendingBackgroundUpdate/);
});

test("web clients refresh from account-scoped successful sync jobs", () => {
  const health = read("src/services/health.ts");
  const migration = read("supabase/migrations/202609020002_health_sync_realtime.sql");
  assert.match(health, /filter: `user_id=eq\.\$\{userId\}`/);
  assert.match(health, /next\.status === "success"/);
  assert.match(health, /Number\(next\.sample_count \?\? 0\) > 0/);
  assert.match(health, /\.gt\("sample_count", 0\)/);
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE public\.health_sync_jobs/);
});

test("Watch actions survive inactive web runtime and the watchOS target is embedded", () => {
  const bridge = read("native/ios/NavaWatchBridgePlugin.swift");
  const watchService = read("src/services/watch.ts");
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  assert.match(bridge, /pending-watch-actions\.json/);
  assert.match(bridge, /completeFileProtectionUntilFirstUserAuthentication/);
  assert.match(bridge, /drainPendingActions/);
  assert.match(bridge, /acknowledgePendingActions/);
  assert.match(watchService, /enqueueWatchAction\(userId, action\)/);
  assert.match(watchService, /acknowledgeNativeWatchActions/);
  assert.ok(
    watchService.indexOf("await flushPendingWatchActions(userId)") < watchService.indexOf("await acknowledgeNativeWatchActions([resolved.actionId])"),
    "native Watch actions must be acknowledged only after the durable Supabase flush",
  );
  assert.match(project, /NAVA Watch\.app in Embed Watch Content/);
  assert.doesNotMatch(project, /com\.apple\.product-type\.application\.watchapp2/);
  assert.equal((project.match(/productType = "com\.apple\.product-type\.application";/g) ?? []).length, 2);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = "\$\(NAVA_APP_BUNDLE_ID\)\.watchkitapp"/);
  assert.match(project, /INFOPLIST_KEY_WKCompanionAppBundleIdentifier = "\$\(NAVA_APP_BUNDLE_ID\)"/);
});
