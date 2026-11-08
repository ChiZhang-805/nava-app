import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import plist from "plist";
import { root, loadProject, checkProject, checkManifest, checkNativeConfig, checkReleaseInputs, checkBuildSettings, checkArchiveMetadata } from "../scripts/ios-release-checks.mjs";

const inputs = { NAVA_APPLE_TEAM_ID: "AB12CD34EF", NAVA_IOS_BUNDLE_ID: "health.nava.mobile", NAVA_IOS_VERSION: "1.0.0", NAVA_IOS_BUILD_NUMBER: "12" };
const config = { appId: "health.nava.mobile", webDir: "dist", packageClassList: ["CAPCameraPlugin", "LocalNotificationsPlugin", "PushNotificationsPlugin", "AppPlugin", "FilesystemPlugin", "SharePlugin"] };

test("both parsed Xcode targets embed their own manifest and agree on identity/version", () => checkProject(loadProject()));
test("Watch App Store icon occupies Xcode's watchOS platform slot", () => {
  const contents = JSON.parse(readFileSync(path.join(root, "native/watch/Assets.xcassets/AppIcon.appiconset/Contents.json"), "utf8"));
  assert.equal(contents.images[0].platform, "watchos");
  assert.equal(contents.images[0].idiom, "universal");
  assert.equal(contents.images[0].size, "1024x1024");
});
test("a legacy WatchKit wrapper product type cannot compile single-target Swift sources", () => {
  const project = loadProject();
  project.PBXNativeTarget["B2C3D4E50000000000000031"].productType = '"com.apple.product-type.application.watchapp2"';
  assert.throws(() => checkProject(project), /single-target Watch/);
});
test("iPhone minimum OS cannot promise unsupported iOS 14 layouts", () => {
  const project = loadProject();
  project.XCBuildConfiguration["504EC3181FED79650016851F"].buildSettings.IPHONEOS_DEPLOYMENT_TARGET = "14.0";
  assert.throws(() => checkProject(project), /iOS 16.4/);
});
test("a manifest existing on disk but absent from Copy Bundle Resources fails", () => {
  const project = loadProject();
  project.PBXResourcesBuildPhase["B2C3D4E50000000000000023"].files = [];
  assert.throws(() => checkProject(project), /Copy Bundle Resources/);
});
test("a Release target accidentally using development push entitlements fails", () => {
  const project = loadProject();
  project.XCBuildConfiguration["504EC3181FED79650016851F"].buildSettings.CODE_SIGN_ENTITLEMENTS = "App/App.entitlements";
  assert.throws(() => checkProject(project));
});
test("Release signing cannot silently fall back to a development identity", () => {
  const project = loadProject();
  project.XCBuildConfiguration["504EC3151FED79650016851F"].buildSettings.CODE_SIGN_IDENTITY = "iPhone Developer";
  assert.throws(() => checkProject(project), /Apple Distribution/);
});
test("Release App targets require their exact App Store profiles", () => {
  for (const id of ["504EC3181FED79650016851F", "B2C3D4E50000000000000042"]) {
    const project = loadProject();
    project.XCBuildConfiguration[id].buildSettings.CODE_SIGN_STYLE = "Automatic";
    assert.throws(() => checkProject(project), /explicit App Store profiles/);
  }
});
test("Watch version mismatch and detached companion identity fail", () => {
  for (const field of ["MARKETING_VERSION", "PRODUCT_BUNDLE_IDENTIFIER", "INFOPLIST_FILE"]) {
    const project = loadProject();
    project.XCBuildConfiguration["B2C3D4E50000000000000042"].buildSettings[field] = "wrong";
    assert.throws(() => checkProject(project));
  }
});
test("UserDefaults declaration and account-linked data are required", () => {
  const source = plist.parse(readFileSync(path.join(root, "ios/App/App/PrivacyInfo.xcprivacy"), "utf8"));
  checkManifest(source);
  source.NSPrivacyAccessedAPITypes = [];
  assert.throws(() => checkManifest(source), /UserDefaults/);
});
test("iPhone archive declares that it does not contain non-exempt encryption", () => {
  const info = plist.parse(readFileSync(path.join(root, "ios/App/App/Info.plist"), "utf8"));
  assert.equal(info.ITSAppUsesNonExemptEncryption, false);
});
test("native configuration rejects live reload, HTTP, navigation overrides and debug WebViews", () => {
  checkNativeConfig(config);
  for (const override of [
    { server: { url: "http://localhost:5174" } },
    { server: { cleartext: true } },
    { server: { allowNavigation: ["*"] } },
    { ios: { webContentsDebuggingEnabled: true } },
    { packageClassList: ["AppPlugin"] },
  ]) assert.throws(() => checkNativeConfig({ ...config, ...override }));
});

test("WKWebView leaves safe-area ownership to the full-screen web canvas", () => {
  const source = readFileSync(path.join(root, "capacitor.config.ts"), "utf8");
  assert.match(source, /contentInset:\s*["']never["']/);
  assert.doesNotMatch(source, /contentInset:\s*["']automatic["']/);
});
test("archive inputs reject missing, wildcard and malformed identities/versions", () => {
  checkReleaseInputs(inputs);
  for (const [key, value] of [
    ["NAVA_APPLE_TEAM_ID", ""], ["NAVA_APPLE_TEAM_ID", "example"],
    ["NAVA_IOS_BUNDLE_ID", "health.nava.*"], ["NAVA_IOS_VERSION", "1.0-beta"],
    ["NAVA_IOS_BUILD_NUMBER", "0"], ["NAVA_IOS_BUILD_NUMBER", "10000"],
  ]) assert.throws(() => checkReleaseInputs({ ...inputs, [key]: value }));
});
test("resolved build settings must contain both signed targets with approved versions", () => {
  const settings = ["App", "NAVA Watch"].map((target) => ({ target, buildSettings: {
    PRODUCT_BUNDLE_IDENTIFIER: target === "App" ? inputs.NAVA_IOS_BUNDLE_ID : `${inputs.NAVA_IOS_BUNDLE_ID}.watchkitapp`,
    MARKETING_VERSION: inputs.NAVA_IOS_VERSION,
    CURRENT_PROJECT_VERSION: inputs.NAVA_IOS_BUILD_NUMBER,
    DEVELOPMENT_TEAM: inputs.NAVA_APPLE_TEAM_ID,
    CODE_SIGN_IDENTITY: "Apple Distribution",
    CODE_SIGN_STYLE: "Manual",
    PROVISIONING_PROFILE_SPECIFIER: target === "App" ? "NAVA iOS App Store" : "NAVA Watch App Store",
  } }));
  checkBuildSettings(settings, inputs);
  assert.throws(() => checkBuildSettings(settings.slice(0, 1), inputs));
  settings[1].buildSettings.CURRENT_PROJECT_VERSION = "1";
  assert.throws(() => checkBuildSettings(settings, inputs));
});
test("native builder overrides hostile ambient demo and project settings before invoking Vite", () => {
  const parent = path.join(root, "artifacts", "test-runs");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(path.join(parent, "ios-env-"));
  try {
    writeFileSync(path.join(directory, ".env.native"), readFileSync(path.join(root, ".env.native")));
    const cli = path.join(directory, "node_modules", "vite", "bin");
    mkdirSync(cli, { recursive: true });
    writeFileSync(path.join(cli, "vite.js"), 'console.log(JSON.stringify({demo:process.env.VITE_ENABLE_REVIEW_DEMO,mode:process.env.VITE_APP_ENV,url:process.env.VITE_SUPABASE_URL}));');
    const result = spawnSync(process.execPath, [path.join(root, "scripts/run-vite-with-project-env.mjs"), "build", "--mode", "native"], {
      cwd: directory, encoding: "utf8", env: { ...process.env, VITE_ENABLE_REVIEW_DEMO: "true", VITE_APP_ENV: "review", VITE_SUPABASE_URL: "https://wrong.invalid" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { demo: "false", mode: "production", url: "https://wxteapvwagvhhtrjrbim.supabase.co" });
  } finally {
    assert.equal(path.dirname(directory), parent);
    rmSync(directory, { recursive: true });
  }
});

test("native signed-out screens keep their packaged background and fill the device width", () => {
  const bootstrap = readFileSync(path.join(root, "src/AppBootstrap.tsx"), "utf8");
  const styles = readFileSync(path.join(root, "src/styles/product-ui.css"), "utf8");
  assert.match(bootstrap, /function BootstrapStage[\s\S]*?<LivingBackground \/>[\s\S]*?\{children\}/);
  assert.match(styles, /\.nava-app-stage\s*\{[\s\S]*?linear-gradient\(143deg,[\s\S]*?\}/);
  assert.match(styles, /\.auth-screen\s*\{[\s\S]*?isolation:\s*isolate;[\s\S]*?grid-template-rows:\s*clamp\(/);
  assert.match(styles, /\.auth-form,\s*\n\.auth-form--signIn\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*410px;/);
});

test("actual archive metadata rejects simulator SDKs and mismatched embedded Watch versions", () => {
  const app = { CFBundleIdentifier: inputs.NAVA_IOS_BUNDLE_ID, CFBundleShortVersionString: "1.0.0", CFBundleVersion: "12", DTSDKName: "iphoneos26.0" };
  const watch = { ...app, CFBundleIdentifier: `${inputs.NAVA_IOS_BUNDLE_ID}.watchkitapp`, CFBundleIconName: "AppIcon", CFBundleIconFiles: ["AppIcon"], WKCompanionAppBundleIdentifier: inputs.NAVA_IOS_BUNDLE_ID, DTSDKName: "watchos26.0" };
  checkArchiveMetadata(app, watch, inputs);
  assert.throws(() => checkArchiveMetadata({ ...app, DTSDKName: "iphonesimulator26.0" }, watch, inputs));
  assert.throws(() => checkArchiveMetadata(app, { ...watch, CFBundleVersion: "11" }, inputs));
  assert.throws(() => checkArchiveMetadata(app, { ...watch, DTSDKName: "watchos11.0" }, inputs));
});

test("signed cloud builds allow only a first-run Podfile lock and preserve it as evidence", () => {
  const script = readFileSync(path.join(root, "scripts/prepare-ios-release.sh"), "utf8");
  assert.match(script, /grep -vE '\^\\\?\\\? ios\/App\/Podfile\\\.lock\$'/);
  assert.match(script, /UNEXPECTED_SYNC_STATUS/);
  assert.match(script, /cp ios\/App\/Podfile\.lock "\$\{RELEASE_DIR\}\/Podfile\.lock"/);
  assert.match(script, /changed files other than a first-run Podfile\.lock/);
});

test("release script does not force App signing settings onto CocoaPods", () => {
  const script = readFileSync(path.join(root, "scripts/prepare-ios-release.sh"), "utf8");
  const signingBlock = script.match(/SIGNING_SETTINGS=\([\s\S]*?\n\)/)?.[0] ?? "";
  assert.doesNotMatch(signingBlock, /CODE_SIGN_(?:STYLE|IDENTITY)/);
  assert.match(script, /<key>signingStyle<\/key><string>manual<\/string>/);
  assert.match(script, /NAVA iOS App Store/);
  assert.match(script, /NAVA Watch App Store/);
});

test("upload discovery stays compatible with macOS Bash 3.2", () => {
  const script = readFileSync(path.join(root, "scripts/prepare-ios-release.sh"), "utf8");
  const executableLines = script.split("\n").filter((line) => !line.trimStart().startsWith("#")).join("\n");
  assert.doesNotMatch(executableLines, /\b(?:mapfile|readarray)\b/);
  assert.match(script, /while IFS= read -r ipa_file/);
  assert.match(script, /ALTOOL_STATUS=\$\{PIPESTATUS\[0\]\}/);
  assert.match(script, /UPLOAD FAILED\|Failed to upload package\|Validation failed/);
  assert.match(script, /No errors uploading\|UPLOAD SUCCEEDED/);
  assert.ok(script.indexOf("uploaded-ipa.txt") > script.indexOf("No errors uploading|UPLOAD SUCCEEDED"));
});
