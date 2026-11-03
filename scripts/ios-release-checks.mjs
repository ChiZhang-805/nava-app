import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import plist from "plist";
import xcode from "xcode";

export const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const unquote = (value) => String(value ?? "").replace(/^"|"$/g, "");
export function loadProject() {
  const project = xcode.project(path.join(root, "ios/App/App.xcodeproj/project.pbxproj"));
  project.parseSync();
  return project.hash.project.objects;
}

export function checkReleaseInputs(env) {
  assert.match(env.NAVA_APPLE_TEAM_ID ?? "", /^[A-Z0-9]{10}$/, "Set the real 10-character Apple Team ID");
  assert.match(env.NAVA_IOS_BUNDLE_ID ?? "", /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/, "Set the approved Bundle ID");
  assert.match(env.NAVA_IOS_VERSION ?? "", /^\d+\.\d+\.\d+$/, "NAVA_IOS_VERSION must be numeric major.minor.patch");
  assert.match(env.NAVA_IOS_BUILD_NUMBER ?? "", /^[1-9]\d{0,3}$/, "NAVA_IOS_BUILD_NUMBER must be a new integer from 1 to 9999");
}

export function checkManifest(manifest) {
  assert.equal(manifest.NSPrivacyTracking, false);
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);
  const defaults = manifest.NSPrivacyAccessedAPITypes.find((api) => api.NSPrivacyAccessedAPIType === "NSPrivacyAccessedAPICategoryUserDefaults");
  assert.deepEqual(defaults?.NSPrivacyAccessedAPITypeReasons, ["CA92.1"], "App-local UserDefaults must be declared");
  assert.ok(manifest.NSPrivacyCollectedDataTypes.length > 0, "NAVA must not claim no data collection");
  const seen = new Set();
  for (const entry of manifest.NSPrivacyCollectedDataTypes) {
    assert.ok(!seen.has(entry.NSPrivacyCollectedDataType), "Duplicate collected data type");
    seen.add(entry.NSPrivacyCollectedDataType);
    assert.equal(entry.NSPrivacyCollectedDataTypeLinked, true);
    assert.equal(entry.NSPrivacyCollectedDataTypeTracking, false);
    assert.ok(entry.NSPrivacyCollectedDataTypePurposes.length > 0);
  }
}

export function checkProject(objects) {
  const configs = objects.XCBuildConfiguration;
  const projectConfigs = [configs["504EC3141FED79650016851F"], configs["504EC3151FED79650016851F"]];
  const roots = projectConfigs.map((config) => unquote(config.buildSettings.NAVA_APP_BUNDLE_ID));
  assert.equal(roots[0], roots[1], "Debug/Release root Bundle IDs differ");
  assert.equal(unquote(projectConfigs[1].buildSettings.CODE_SIGN_IDENTITY), "Apple Distribution", "Release must use Apple Distribution signing");
  const capacitorId = read("capacitor.config.ts").match(/appId:\s*"([^"]+)"/)?.[1];
  assert.equal(roots[0], capacitorId, "Capacitor and Xcode identities differ");
  const targetIds = ["504EC3031FED79650016851F", "B2C3D4E50000000000000031"];
  const versions = new Set();
  for (const [index, id] of targetIds.entries()) {
    const target = objects.PBXNativeTarget[id];
    assert.ok(target, "Missing iPhone/Watch target");
    assert.equal(unquote(target.productType), "com.apple.product-type.application", "iPhone and single-target Watch apps must use the application product type");
    const list = objects.XCConfigurationList[target.buildConfigurationList];
    for (const ref of list.buildConfigurations) {
      const config = configs[ref.value];
      const settings = config.buildSettings;
      const bundle = index === 0 ? "$(NAVA_APP_BUNDLE_ID)" : "$(NAVA_APP_BUNDLE_ID).watchkitapp";
      assert.equal(unquote(settings.PRODUCT_BUNDLE_IDENTIFIER), bundle);
      versions.add(`${settings.MARKETING_VERSION}:${settings.CURRENT_PROJECT_VERSION}`);
      if (unquote(config.name) === "Release") {
        const profile = index === 0 ? "NAVA iOS App Store" : "NAVA Watch App Store";
        assert.equal(unquote(settings.CODE_SIGN_STYLE), "Manual", "Release App targets must use explicit App Store profiles");
        assert.equal(unquote(settings.PROVISIONING_PROFILE_SPECIFIER), profile, `Unexpected Release profile for ${unquote(target.name)}`);
      }
      if (index === 0) {
        assert.ok(Number(settings.IPHONEOS_DEPLOYMENT_TARGET) >= 16.4, "NAVA requires iOS 16.4 WebKit layout support");
        assert.equal(Number(settings.TARGETED_DEVICE_FAMILY), 1);
        const entitlementPath = unquote(settings.CODE_SIGN_ENTITLEMENTS);
        const entitlements = plist.parse(read(`ios/App/${entitlementPath}`));
        assert.equal(entitlements["aps-environment"], unquote(config.name) === "Release" ? "production" : "development");
        assert.equal(entitlements["com.apple.developer.healthkit"], true);
        assert.equal(entitlements["com.apple.developer.healthkit.background-delivery"], true);
      } else {
        assert.equal(settings.GENERATE_INFOPLIST_FILE, "NO", "Watch must use its reviewed explicit Info.plist");
        assert.equal(unquote(settings.INFOPLIST_FILE), "../../native/watch/Info.plist");
      }
    }
    const resources = target.buildPhases.flatMap((ref) => objects.PBXResourcesBuildPhase[ref.value]?.files ?? []);
    const privacyRef = index === 0 ? "C3D4E5F60000000000000011" : "C3D4E5F60000000000000012";
    assert.ok(resources.some((ref) => objects.PBXBuildFile[ref.value]?.fileRef === privacyRef), "Privacy manifest must be in target Copy Bundle Resources");
  }
  assert.equal(versions.size, 1, "iPhone and Watch version/build numbers must match");
  const dependencies = objects.PBXNativeTarget[targetIds[0]].dependencies;
  assert.ok(dependencies.some((ref) => objects.PBXTargetDependency[ref.value]?.target === targetIds[1]));
}

export function checkNativeConfig(config) {
  assert.equal(config.appId, read("capacitor.config.ts").match(/appId:\s*"([^"]+)"/)?.[1]);
  assert.equal(config.webDir, "dist");
  assert.ok(!config.server?.url, "Native release must use packaged web assets, not live reload");
  assert.ok(!config.server?.cleartext, "Native release cannot enable cleartext transport");
  assert.ok(!config.server?.allowNavigation?.length, "Native bridge cannot allow arbitrary navigation");
  assert.ok(!config.ios?.webContentsDebuggingEnabled, "Native release cannot enable WebView debugging");
  for (const plugin of ["CAPCameraPlugin", "LocalNotificationsPlugin", "PushNotificationsPlugin", "AppPlugin", "FilesystemPlugin", "SharePlugin"]) {
    assert.ok(config.packageClassList?.includes(plugin), `Missing generated plugin registration: ${plugin}`);
  }
}

export function checkCopiedAssets() {
  checkNativeConfig(JSON.parse(read("ios/App/App/capacitor.config.json")));
  let checked = 0;
  function walk(relative = "") {
    for (const entry of readdirSync(path.join(root, "dist", relative), { withFileTypes: true })) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) walk(file);
      else {
        const source = readFileSync(path.join(root, "dist", file));
        const destination = readFileSync(path.join(root, "ios/App/App/public", file));
        assert.ok(source.equals(destination), `Stale native resource: ${file}`);
        checked++;
      }
    }
  }
  walk();
  assert.ok(checked > 0);
  console.log(`Native copied assets match dist byte-for-byte (${checked} files).`);
}

export function checkBuildSettings(settings, env) {
  checkReleaseInputs(env);
  for (const [target, bundle] of [["App", env.NAVA_IOS_BUNDLE_ID], ["NAVA Watch", `${env.NAVA_IOS_BUNDLE_ID}.watchkitapp`]]) {
    const item = settings.find((item) => item.target === target)?.buildSettings;
    assert.ok(item, `Missing build settings for ${target}`);
    assert.equal(item.PRODUCT_BUNDLE_IDENTIFIER, bundle, `Unapproved Bundle ID for ${target}`);
    assert.equal(item.MARKETING_VERSION, env.NAVA_IOS_VERSION);
    assert.equal(item.CURRENT_PROJECT_VERSION, env.NAVA_IOS_BUILD_NUMBER);
    assert.equal(item.DEVELOPMENT_TEAM, env.NAVA_APPLE_TEAM_ID);
    assert.match(item.CODE_SIGN_IDENTITY ?? "", /Apple Distribution/, `Release signing identity is not distributable for ${target}`);
    assert.equal(item.CODE_SIGN_STYLE, "Manual", `Release signing must be manual for ${target}`);
    assert.equal(item.PROVISIONING_PROFILE_SPECIFIER, target === "App" ? "NAVA iOS App Store" : "NAVA Watch App Store");
  }
}

export function checkArchiveMetadata(app, watch, env) {
  checkReleaseInputs(env);
  assert.equal(app.CFBundleIdentifier, env.NAVA_IOS_BUNDLE_ID);
  assert.equal(watch.CFBundleIdentifier, `${env.NAVA_IOS_BUNDLE_ID}.watchkitapp`);
  assert.equal(watch.WKCompanionAppBundleIdentifier, env.NAVA_IOS_BUNDLE_ID);
  assert.equal(watch.CFBundleIconName, "AppIcon", "Watch archive must identify its asset-catalog app icon");
  assert.ok(Array.isArray(watch.CFBundleIconFiles) && watch.CFBundleIconFiles.includes("AppIcon"), "Watch archive must declare its icon files");
  for (const info of [app, watch]) {
    assert.equal(info.CFBundleShortVersionString, env.NAVA_IOS_VERSION);
    assert.equal(info.CFBundleVersion, env.NAVA_IOS_BUILD_NUMBER);
    assert.ok(Number(String(info.DTSDKName).match(/^(?:iphoneos|watchos)(\d+)/)?.[1]) >= 26, "Archive must use device SDK 26+");
  }
}

function checkArchive(archivePath) {
  assert.equal(process.platform, "darwin", "Archive validation requires macOS plutil and codesign");
  const appPath = path.join(archivePath, "Products/Applications/App.app");
  const watchPath = path.join(appPath, "Watch/NAVA Watch.app");
  const readBuiltPlist = (file) => JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", file], { encoding: "utf8" }));
  checkArchiveMetadata(readBuiltPlist(path.join(appPath, "Info.plist")), readBuiltPlist(path.join(watchPath, "Info.plist")), process.env);
  assert.ok(readFileSync(path.join(watchPath, "Assets.car")).length > 0, "Archive is missing the compiled Watch asset catalog");
  for (const folder of [appPath, watchPath]) checkManifest(readBuiltPlist(path.join(folder, "PrivacyInfo.xcprivacy")));
  checkNativeConfig(JSON.parse(readFileSync(path.join(appPath, "capacitor.config.json"), "utf8")));
  assert.ok(readFileSync(path.join(appPath, "public/index.html")).equals(readFileSync(path.join(root, "dist/index.html"))), "Archive contains a stale web entry");
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "pipe" });
  console.log("Archive identity, versions, SDKs, privacy resources and code signature verified. Organizer validation, distribution profile and device acceptance remain required.");
}

export function verifySource() {
  checkProject(loadProject());
  for (const file of ["ios/App/App/PrivacyInfo.xcprivacy", "native/watch/PrivacyInfo.xcprivacy"]) checkManifest(plist.parse(read(file)));
  const info = plist.parse(read("ios/App/App/Info.plist"));
  assert.deepEqual(info.UIRequiredDeviceCapabilities, ["arm64"]);
  assert.ok(!info.NSAppTransportSecurity?.NSAllowsArbitraryLoads);
  assert.ok(info.NSHealthUpdateUsageDescription?.trim(), "HealthKit write access requires NSHealthUpdateUsageDescription");
  const watchInfo = plist.parse(read("native/watch/Info.plist"));
  assert.equal(watchInfo.CFBundleIconName, "AppIcon");
  assert.deepEqual(watchInfo.CFBundleIconFiles, ["AppIcon"]);
  assert.equal(watchInfo.WKCompanionAppBundleIdentifier, "$(NAVA_APP_BUNDLE_ID)");
  const watchIcon = JSON.parse(read("native/watch/Assets.xcassets/AppIcon.appiconset/Contents.json"));
  assert.deepEqual(watchIcon.images, [{ filename: "AppIcon-1024.png", idiom: "universal", platform: "watchos", size: "1024x1024" }], "Watch icon must use Xcode's lowercase watchos platform slot");
  assert.match(read("ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme"), /BlueprintIdentifier="504EC3031FED79650016851F"/);
  assert.match(read("ios/App/App.xcworkspace/contents.xcworkspacedata"), /group:Pods\/Pods.xcodeproj/);
  for (const file of ["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", "native/watch/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"]) {
    const png = readFileSync(path.join(root, file));
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], 2, "App Store icon must be RGB with no alpha channel");
  }
  const nativeEnv = read(".env.native");
  assert.match(nativeEnv, /^VITE_ENABLE_REVIEW_DEMO=false$/m);
  assert.match(nativeEnv, /^VITE_APP_ENV=production$/m);
  assert.match(nativeEnv, /^VITE_SUPABASE_URL=https:\/\/wxteapvwagvhhtrjrbim.supabase.co$/m);
  for (const file of ["node_modules/@capacitor/ios/Capacitor/Capacitor/PrivacyInfo.xcprivacy", "node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/PrivacyInfo.xcprivacy"]) {
    assert.ok(existsSync(path.join(root, file)), "Install pinned SDKs with npm ci before checking privacy resources");
    plist.parse(read(file));
  }
  console.log("iOS release source preflight passed. Not proof of Xcode compilation, signing, device acceptance or upload.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, file] = process.argv.slice(2);
  if (command === "--inputs") checkReleaseInputs(process.env);
  else if (command === "--build-settings") checkBuildSettings(JSON.parse(readFileSync(file, "utf8")), process.env);
  else if (command === "--copied") checkCopiedAssets();
  else if (command === "--archive") checkArchive(file);
  else if (!command) verifySource();
  else throw new Error(`Unknown command: ${command}`);
}
