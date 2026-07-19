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
  "native\ios\NavaSpeechPlugin.swift",
  "native\ios\NavaWatchBridgePlugin.swift",
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
  @{ Path = "ios\App\App\Assets.xcassets\Splash.imageset\splash-2732x2732.png"; Size = 2732 }
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

[xml]$storyboard = Get-Content -LiteralPath (Join-Path $appRoot "Base.lproj\Main.storyboard") -Raw -Encoding UTF8
if (!$storyboard.SelectSingleNode("//viewController[@customClass='NavaBridgeViewController']")) {
  throw "Main.storyboard does not use NavaBridgeViewController."
}

$bridge = Get-Content -LiteralPath (Join-Path $appRoot "NavaBridgeViewController.swift") -Raw -Encoding UTF8
foreach ($plugin in @("NavaHealthPlugin", "NavaSpeechPlugin", "NavaWatchBridgePlugin")) {
  if (!$bridge.Contains("registerPluginInstance($plugin())")) { throw "Bridge does not register $plugin." }
}

$healthPlugin = Get-Content -LiteralPath (Join-Path $root "native\ios\NavaHealthPlugin.swift") -Raw -Encoding UTF8
foreach ($expected in @("getAuthorizationStatus", "getRequestStatusForAuthorization")) {
  if (!$healthPlugin.Contains($expected)) { throw "Health plugin is missing: $expected" }
}

$project = Get-Content -LiteralPath (Join-Path $root "ios\App\App.xcodeproj\project.pbxproj") -Raw -Encoding UTF8
foreach ($expected in @(
  "NavaHealthPlugin.swift in Sources",
  "NavaSpeechPlugin.swift in Sources",
  "NavaWatchBridgePlugin.swift in Sources",
  "NavaBridgeViewController.swift in Sources",
  "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
  "TARGETED_DEVICE_FAMILY = 1;"
)) {
  if (!$project.Contains($expected)) { throw "Xcode project is missing: $expected" }
}

foreach ($relativeSource in @("..\..\..\native\ios\NavaHealthPlugin.swift", "..\..\..\native\ios\NavaSpeechPlugin.swift", "..\..\..\native\ios\NavaWatchBridgePlugin.swift")) {
  if (!(Test-Path -LiteralPath (Join-Path $appRoot $relativeSource))) { throw "Broken Xcode source reference: $relativeSource" }
}

$watchManager = Get-Content -LiteralPath (Join-Path $root "native\watch\WatchSessionManager.swift") -Raw -Encoding UTF8
foreach ($expected in @("import Combine", "transferUserInfo", "actionId")) {
  if (!$watchManager.Contains($expected)) { throw "Watch session manager is missing: $expected" }
}
$watchBridge = Get-Content -LiteralPath (Join-Path $root "native\ios\NavaWatchBridgePlugin.swift") -Raw -Encoding UTF8
foreach ($expected in @("didReceiveMessage message", "replyHandler", "didReceiveUserInfo")) {
  if (!$watchBridge.Contains($expected)) { throw "iPhone Watch bridge is missing: $expected" }
}

Write-Host "iOS project contract verified: iPhone portrait, HealthKit, motion, speech input, native plugins, and Watch companion sources."
