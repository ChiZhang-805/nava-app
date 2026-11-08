// Source-contract preflight, usable on Windows AND macOS. Not an Xcode compile/device test.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifySource } from "./ios-release-checks.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const includes = (file, needles) => { const text = read(file); for (const needle of needles) assert.ok(text.includes(needle), `${file}: missing ${needle}`); };
const privacy = ["NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription", "NSMotionUsageDescription", "NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription", "NSCameraUsageDescription", "NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"];
const plist = read("ios/App/App/Info.plist");
includes("ios/App/Podfile", ["CapacitorFilesystem", "CapacitorShare"]);
includes("ios/App/App/PrivacyInfo.xcprivacy", ["NSPrivacyAccessedAPICategoryFileTimestamp", "C617.1"]);
for (const key of privacy) {
  assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>[^<]+</string>`));
  for (const language of ["en", "zh-Hans"]) includes(`ios/App/App/${language}.lproj/InfoPlist.strings`, [`"${key}" = "`]);
}
assert.match(plist, /<key>UISupportedInterfaceOrientations<\/key>\s*<array>\s*<string>UIInterfaceOrientationPortrait<\/string>\s*<\/array>/);
for (const entitlement of ["com.apple.developer.healthkit", "com.apple.developer.healthkit.background-delivery"]) {
  assert.ok(read("ios/App/App/App.entitlements").includes(`<key>${entitlement}</key>`));
}
includes("ios/App/App/App.entitlements", ["aps-environment"]);
for (const file of ["ios/App/App/App.entitlements", "ios/App/App/App.Release.entitlements"]) {
  includes(file, ["com.apple.developer.applesignin", "<string>Default</string>"]);
}
includes("ios/App/App/Base.lproj/Main.storyboard", ['customClass="NavaBridgeViewController"']);
for (const name of ["NavaHealthPlugin", "NavaSecureStoragePlugin", "NavaSpeechPlugin", "NavaWatchBridgePlugin", "NavaWakeLockPlugin", "NavaNotificationPermissionPlugin", "NavaAppleSignInPlugin", "NavaExternalAuthPlugin"]) {
  includes("ios/App/App/NavaBridgeViewController.swift", [`registerPluginInstance(${name}())`]);
}
includes("ios/App/App/NavaBridgeViewController.swift", ["ASAuthorizationAppleIDProvider", "request.nonce", "identityToken", "ASWebAuthenticationSession", 'callbackURLScheme: callbackScheme']);
includes("src/services/nativeSocialAuth.ts", ['registerPlugin<NavaAppleSignInPlugin>("NavaAppleSignIn")', 'registerPlugin<NavaExternalAuthPlugin>("NavaExternalAuth")']);
includes("ios/App/App/NavaBridgeViewController.swift", ["isIdleTimerDisabled = true", "willResignActiveNotification", "leases.removeAll()", "isIdleTimerDisabled = false", "applicationState == .active"]);
includes("ios/App/App/NavaBridgeViewController.swift", ["getNotificationSettings", "requestAuthorization(options: [.alert, .sound, .badge])", "UIAlertController", "#available(iOS 16.0, *)", "UIApplication.openNotificationSettingsURLString", "UIApplication.openSettingsURLString"]);
includes("ios/App/App/AppDelegate.swift", ["NavaHealthBackgroundObserver.shared.start()", "didRegisterForRemoteNotificationsWithDeviceToken", "didFailToRegisterForRemoteNotificationsWithError", ".capacitorDidRegisterForRemoteNotifications", ".capacitorDidFailToRegisterForRemoteNotifications"]);
includes("native/ios/NavaHealthPlugin.swift", ["getAuthorizationStatus", "getRequestStatusForAuthorization", "startBackgroundDelivery", "readPendingBackgroundUpdate", "acknowledgePendingBackgroundUpdate", "healthDataChanged"]);
includes("native/ios/NavaHealthBackgroundObserver.swift", ["HKObserverQuery", "enableBackgroundDelivery", "finish()", "recordPendingChange"]);
includes("native/ios/NavaSecureStoragePlugin.swift", ["kSecClassGenericPassword", "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly", "SecItemCopyMatching", "SecItemUpdate"]);
includes("native/watch/WatchSessionManager.swift", ["import Combine", "transferUserInfo", "actionId"]);
includes("native/ios/NavaWatchBridgePlugin.swift", ["didReceiveMessage message", "replyHandler", "didReceiveUserInfo", "drainPendingActions", "acknowledgePendingActions", "completeFileProtectionUntilFirstUserAuthentication"]);
for (const name of ["NavaHealthPlugin", "NavaHealthBackgroundObserver", "NavaSecureStoragePlugin", "NavaSpeechPlugin", "NavaWatchBridgePlugin", "NavaWatchApp", "WatchHomeView", "WatchSessionManager", "NavaBridgeViewController"]) {
  includes("ios/App/App.xcodeproj/project.pbxproj", [`${name}.swift in Sources`]);
}
includes("ios/App/App.xcodeproj/project.pbxproj", ["NAVA Watch.app in Embed Watch Content", "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;", "TARGETED_DEVICE_FAMILY = 1;", 'PRODUCT_BUNDLE_IDENTIFIER = "$(NAVA_APP_BUNDLE_ID).watchkitapp";', "INFOPLIST_FILE = ../../native/watch/Info.plist;"]);
includes("ios/App/Podfile", ["CapacitorCamera", "CapacitorLocalNotifications", "CapacitorPushNotifications"]);
includes("src/services/notifications.ts", ["replaceNotificationSchedules(LocalNotifications, notifications)", "localNotificationReceived", "localNotificationActionPerformed"]);
includes("src/services/notificationSchedule.ts", ["await adapter.cancel", "await adapter.schedule"]);
for (const [file, size] of [["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024], ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", 2732], ["native/watch/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png", 1024]]) {
  const bytes = readFileSync(path.join(root, file));
  assert.equal(bytes.subarray(1, 4).toString(), "PNG"); assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
}
for (const language of ["en", "zh-Hans"]) assert.ok(existsSync(path.join(root, `native/watch/${language}.lproj/Localizable.strings`)));
verifySource();
console.log("Portable iOS source contracts passed; Xcode compile, signing and physical-device acceptance remain required.");
