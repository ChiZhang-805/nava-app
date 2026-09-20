#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS because iOS compilation and signing require Xcode." >&2
  exit 1
fi

for command_name in node npm xcodebuild pod; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

echo "Node: $(node --version)"
echo "npm: $(npm --version)"
xcodebuild -version
echo "CocoaPods: $(pod --version)"

if [[ "${NAVA_SKIP_NPM_CI:-0}" != "1" ]]; then
  npm ci
fi
# The full release gate runs in the source workspace. This Mac handoff must not invoke
# Windows-only PowerShell or Q-drive screenshot paths, and must fail on any native gate.
npm run lint
npm run ios:verify:portable
npm run native-photos:test
npm run motion:test
npm run notification:test
npm run health:contract:test
npm run ai:speech:test
npm run push:contract:test
npm run cap:sync
node scripts/verify-native-preview-exclusion.mjs
plutil -lint ios/App/App/Info.plist ios/App/App/App.entitlements

DERIVED_DATA="${REPO_ROOT}/artifacts/ios/DerivedData"
mkdir -p "${DERIVED_DATA}"

# Compile every Swift/Capacitor source without requiring a signing identity. HealthKit values
# still require a physical iPhone; this step proves only that the native target compiles.
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "${DERIVED_DATA}" \
  CODE_SIGNING_ALLOWED=NO \
  build

if [[ "${NAVA_ARCHIVE:-0}" != "1" ]]; then
  echo "Unsigned iOS compile passed. Set NAVA_ARCHIVE=1 with NAVA_APPLE_TEAM_ID and NAVA_IOS_BUNDLE_ID to create a signed archive."
  exit 0
fi

: "${NAVA_APPLE_TEAM_ID:?Set NAVA_APPLE_TEAM_ID to the approved Apple Developer Team ID.}"
: "${NAVA_IOS_BUNDLE_ID:?Set NAVA_IOS_BUNDLE_ID to the approved, unique App ID.}"

CONFIGURED_BUNDLE_ID="$(xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -showBuildSettings 2>/dev/null \
  | awk '/PRODUCT_BUNDLE_IDENTIFIER = / { print $3; exit }')"
if [[ "${CONFIGURED_BUNDLE_ID}" != "${NAVA_IOS_BUNDLE_ID}" ]]; then
  echo "Configured App bundle ID '${CONFIGURED_BUNDLE_ID}' does not match approved NAVA_IOS_BUNDLE_ID." >&2
  echo "Update the App target in Xcode first; the archive command will not override target identities." >&2
  exit 1
fi

ARCHIVE_PATH="${REPO_ROOT}/artifacts/ios/NAVA.xcarchive"
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE_PATH}" \
  DEVELOPMENT_TEAM="${NAVA_APPLE_TEAM_ID}" \
  CODE_SIGN_STYLE=Automatic \
  clean archive

echo "Signed archive created at ${ARCHIVE_PATH}. Validate it in Xcode Organizer before TestFlight upload."
