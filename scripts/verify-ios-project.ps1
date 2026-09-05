Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $root "ios\App\App"
$requiredFiles = @(
  "ios\App\App.xcodeproj\project.pbxproj",
  "ios\App\App\App.entitlements",
  "ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png",
  "ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732.png",
  "ios\App\App\Base.lproj\Main.storyboard",
  "ios\App\App\en.lproj\InfoPlist.strings",
  "ios\App\App\Info.plist",
  "ios\App\App\NavaBridgeViewController.swift",
  "ios\App\App\zh-Hans.lproj\InfoPlist.strings",
  "native\ios\NavaHealthPlugin.swift",
  "native\ios\NavaHealthBackgroundObserver.swift",
  "native\ios\NavaSecureStoragePlugin.swift",
  "native\ios\NavaSpeechPlugin.swift",
  "native\ios\NavaWatchBridgePlugin.swift",
  "native\watch\Assets.xcassets\AppIcon.appiconset\AppIcon-1024.png",
  "native\watch\Assets.xcassets\AppIcon.appiconset\Contents.json",
  "native\watch\en.lproj\Localizable.strings",
  "native\watch\NavaWatchApp.swift",
  "native\watch\WatchHomeView.swift",
  "native\watch\WatchSessionManager.swift",
  "native\watch\zh-Hans.lproj\Localizable.strings"
)

foreach ($relativePath in $requiredFiles) {
  $path = Join-Path $root $relativePath
  if (!(Test-Path -LiteralPath $path)) { throw "Missing iOS project file: $relativePath" }
}

function Get-PngDimensions {
  param([string]$Path)
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $signature = [byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
  if ($bytes.Length -lt 24) { throw "Invalid PNG file: $Path" }
  for ($index = 0; $index -lt $signature.Length; $index += 1) {
    if ($bytes[$index] -ne $signature[$index]) { throw "Invalid PNG signature: $Path" }
  }
  $width = ([uint32]$bytes[16] -shl 24) -bor ([uint32]$bytes[17] -shl 16) -bor ([uint32]$bytes[18] -shl 8) -bor [uint32]$bytes[19]
  $height = ([uint32]$bytes[20] -shl 24) -bor ([uint32]$bytes[21] -shl 16) -bor ([uint32]$bytes[22] -shl 8) -bor [uint32]$bytes[23]
  return @{ Width = $width; Height = $height }
}

foreach ($asset in @(
  @{ Path = "ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"; Size = 1024 },
  @{ Path = "ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732.png"; Size = 2732 },
  @{ Path = "native\watch\Assets.xcassets\AppIcon.appiconset\AppIcon-1024.png"; Size = 1024 }
)) {
  $dimensions = Get-PngDimensions -Path (Join-Path $root $asset.Path)
  if ($dimensions.Width -ne $asset.Size -or $dimensions.Height -ne $asset.Size) {
    throw "Unexpected iOS asset dimensions for $($asset.Path): $($dimensions.Width)x$($dimensions.Height)"
  }
}

function Get-PlistValueNode {
  param([xml]$Document, [string]$Key)
  $dict = $Document.SelectSingleNode("/plist/dict")
  if (!$dict) { throw "Invalid plist: missing root dict." }
  $children = @($dict.ChildNodes)
  for ($index = 0; $index -lt $children.Count - 1; $index += 1) {
    if ($children[$index].Name -eq "key" -and $children[$index].InnerText -eq $Key) {
      return $children[$index + 1]
    }
  }
  return $null
}

[xml]$info = Get-Content -LiteralPath (Join-Path $appRoot "Info.plist") -Raw -Encoding UTF8
foreach ($privacyKey in @("NSHealthShareUsageDescription", "NSMotionUsageDescription", "NSMicrophoneUsageDescription", "NSSpeechRecognitionUsageDescription")) {
  $value = Get-PlistValueNode -Document $info -Key $privacyKey
  if (!$value -or !$value.InnerText.Trim()) { throw "Missing iOS privacy description: $privacyKey" }
}
$orientations = Get-PlistValueNode -Document $info -Key "UISupportedInterfaceOrientations"
$orientationValues = @($orientations.ChildNodes | Where-Object { $_.Name -eq "string" } | ForEach-Object { $_.InnerText })
if ($orientationValues.Count -ne 1 -or $orientationValues[0] -ne "UIInterfaceOrientationPortrait") {
  throw "The iPhone target must support portrait orientation only."
}

[xml]$entitlements = Get-Content -LiteralPath (Join-Path $appRoot "App.entitlements") -Raw -Encoding UTF8
$healthEntitlement = Get-PlistValueNode -Document $entitlements -Key "com.apple.developer.healthkit"
if (!$healthEntitlement -or $healthEntitlement.Name -ne "true") { throw "HealthKit entitlement is missing." }
$backgroundHealthEntitlement = Get-PlistValueNode -Document $entitlements -Key "com.apple.developer.healthkit.background-delivery"
if (!$backgroundHealthEntitlement -or $backgroundHealthEntitlement.Name -ne "true") { throw "HealthKit background delivery entitlement is missing." }

[xml]$storyboard = Get-Content -LiteralPath (Join-Path $appRoot "Base.lproj\Main.storyboard") -Raw -Encoding UTF8
if (!$storyboard.SelectSingleNode("//viewController[@customClass='NavaBridgeViewController']")) {
  throw "Main.storyboard does not use NavaBridgeViewController."
}

$bridge = Get-Content -LiteralPath (Join-Path $appRoot "NavaBridgeViewController.swift") -Raw -Encoding UTF8
foreach ($plugin in @("NavaHealthPlugin", "NavaSecureStoragePlugin", "NavaSpeechPlugin", "NavaWatchBridgePlugin")) {
  if (!$bridge.Contains("registerPluginInstance($plugin())")) { throw "Bridge does not register $plugin." }
}

$appDelegate = Get-Content -LiteralPath (Join-Path $appRoot "AppDelegate.swift") -Raw -Encoding UTF8
if (!$appDelegate.Contains("NavaHealthBackgroundObserver.shared.start()")) {
  throw "AppDelegate must register HealthKit observer queries during app launch."
}

$healthPlugin = Get-Content -LiteralPath (Join-Path $root "native\ios\NavaHealthPlugin.swift") -Raw -Encoding UTF8
foreach ($expected in @("getAuthorizationStatus", "getRequestStatusForAuthorization", "startBackgroundDelivery", "readPendingBackgroundUpdate", "acknowledgePendingBackgroundUpdate", "healthDataChanged")) {
  if (!$healthPlugin.Contains($expected)) { throw "Health plugin is missing: $expected" }
}

$healthObserver = Get-Content -LiteralPath (Join-Path $root "native\ios\NavaHealthBackgroundObserver.swift") -Raw -Encoding UTF8
foreach ($expected in @("HKObserverQuery", "enableBackgroundDelivery", "finish()", "recordPendingChange")) {
  if (!$healthObserver.Contains($expected)) { throw "Health background observer is missing: $expected" }
}

$secureStorage = Get-Content -LiteralPath (Join-Path $root "native\ios\NavaSecureStoragePlugin.swift") -Raw -Encoding UTF8
foreach ($expected in @("kSecClassGenericPassword", "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly", "SecItemCopyMatching", "SecItemUpdate")) {
  if (!$secureStorage.Contains($expected)) { throw "Secure storage plugin is missing: $expected" }
}

$project = Get-Content -LiteralPath (Join-Path $root "ios\App\App.xcodeproj\project.pbxproj") -Raw -Encoding UTF8
foreach ($expected in @(
  "NavaHealthPlugin.swift in Sources",
  "NavaHealthBackgroundObserver.swift in Sources",
  "NavaSecureStoragePlugin.swift in Sources",
  "NavaSpeechPlugin.swift in Sources",
  "NavaWatchBridgePlugin.swift in Sources",
  "NavaWatchApp.swift in Sources",
  "WatchHomeView.swift in Sources",
  "WatchSessionManager.swift in Sources",
  "NAVA Watch.app in Embed Watch Content",
  'productType = "com.apple.product-type.application.watchapp2";',
  'PRODUCT_BUNDLE_IDENTIFIER = "$(NAVA_APP_BUNDLE_ID).watchkitapp";',
  'INFOPLIST_KEY_WKCompanionAppBundleIdentifier = "$(NAVA_APP_BUNDLE_ID)";',
  "NavaBridgeViewController.swift in Sources",
  "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
  "TARGETED_DEVICE_FAMILY = 1;"
)) {
  if (!$project.Contains($expected)) { throw "Xcode project is missing: $expected" }
}

foreach ($relativeSource in @("..\..\..\native\ios\NavaHealthPlugin.swift", "..\..\..\native\ios\NavaHealthBackgroundObserver.swift", "..\..\..\native\ios\NavaSecureStoragePlugin.swift", "..\..\..\native\ios\NavaSpeechPlugin.swift", "..\..\..\native\ios\NavaWatchBridgePlugin.swift")) {
  if (!(Test-Path -LiteralPath (Join-Path $appRoot $relativeSource))) { throw "Broken Xcode source reference: $relativeSource" }
}

$xcodeProjectRoot = Join-Path $root "ios\App"
$podfile = Get-Content -LiteralPath (Join-Path $xcodeProjectRoot "Podfile") -Raw -Encoding UTF8
if (!$podfile.Contains("CapacitorLocalNotifications")) { throw "iOS Podfile is missing CapacitorLocalNotifications." }
$notificationService = Get-Content -LiteralPath (Join-Path $root "src\services\notifications.ts") -Raw -Encoding UTF8
foreach ($expected in @("LocalNotifications.schedule", "localNotificationReceived", "localNotificationActionPerformed")) {
  if (!$notificationService.Contains($expected)) { throw "Notification service is missing: $expected" }
}
foreach ($relativeSource in @("..\..\native\watch\NavaWatchApp.swift", "..\..\native\watch\WatchHomeView.swift", "..\..\native\watch\WatchSessionManager.swift", "..\..\native\watch\Assets.xcassets")) {
  if (!(Test-Path -LiteralPath (Join-Path $xcodeProjectRoot $relativeSource))) { throw "Broken Watch target source reference: $relativeSource" }
}

$watchManager = Get-Content -LiteralPath (Join-Path $root "native\watch\WatchSessionManager.swift") -Raw -Encoding UTF8
foreach ($expected in @("import Combine", "transferUserInfo", "actionId")) {
  if (!$watchManager.Contains($expected)) { throw "Watch session manager is missing: $expected" }
}
$watchBridge = Get-Content -LiteralPath (Join-Path $root "native\ios\NavaWatchBridgePlugin.swift") -Raw -Encoding UTF8
foreach ($expected in @("didReceiveMessage message", "replyHandler", "didReceiveUserInfo", "drainPendingActions", "acknowledgePendingActions", "completeFileProtectionUntilFirstUserAuthentication")) {
  if (!$watchBridge.Contains($expected)) { throw "iPhone Watch bridge is missing: $expected" }
}

Write-Host "iOS project contract verified: iPhone portrait, HealthKit, motion, speech input, native plugins, durable Watch actions, and an embedded watchOS target."
