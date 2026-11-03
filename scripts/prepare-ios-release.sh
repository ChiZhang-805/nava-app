#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on macOS because iOS compilation and signing require Xcode." >&2
  exit 1
fi

for command_name in node npm xcodebuild xcrun pod git; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

echo "Node: $(node --version)"
echo "npm: $(npm --version)"
xcodebuild -version
echo "CocoaPods: $(pod --version)"

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 18)) throw new Error("Use Node 22.18+ (recommended: Node 22 LTS)");'
XCODE_VERSION="$(xcodebuild -version)"
if ! [[ "${XCODE_VERSION}" =~ Xcode\ ([0-9]+) ]] || (( BASH_REMATCH[1] < 26 )); then
  echo "App Store Connect requires Xcode 26 or later." >&2
  exit 1
fi
for sdk in iphoneos iphonesimulator watchos watchsimulator; do
  sdk_version="$(xcrun --sdk "${sdk}" --show-sdk-version)"
  if (( ${sdk_version%%.*} < 26 )); then
    echo "Install the ${sdk} 26+ SDK in Xcode before continuing." >&2
    exit 1
  fi
done

if [[ "${NAVA_EXPORT:-0}" == "1" && "${NAVA_ARCHIVE:-0}" != "1" ]]; then
  echo "NAVA_EXPORT=1 requires NAVA_ARCHIVE=1." >&2
  exit 1
fi
if [[ "${NAVA_UPLOAD:-0}" == "1" && "${NAVA_EXPORT:-0}" != "1" ]]; then
  echo "NAVA_UPLOAD=1 requires NAVA_EXPORT=1." >&2
  exit 1
fi
if [[ "${NAVA_ARCHIVE:-0}" == "1" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Signed releases require a clean source checkout. Preserve/reconcile existing work before archiving." >&2
    exit 1
  fi
fi

if [[ "${NAVA_SKIP_NPM_CI:-0}" != "1" ]]; then
  npm ci
fi
if [[ "${NAVA_ARCHIVE:-0}" == "1" ]]; then
  node scripts/ios-release-checks.mjs --inputs
fi
# The full release gate runs in the source workspace. This Mac handoff must not invoke
# Windows-only PowerShell or Q-drive screenshot paths, and must fail on any native gate.
npm run lint
npm run ios:verify:portable
npm run ios:release:check
npm run ios:release:test
npm run native-photos:test
npm run motion:test
npm run notification:test
npm run health:contract:test
npm run ai:speech:test
npm run push:contract:test
npm run cap:sync:ios
npm run ios:release:check
node scripts/verify-native-preview-exclusion.mjs
node scripts/ios-release-checks.mjs --copied
plutil -lint ios/App/App/Info.plist ios/App/App/App.entitlements ios/App/App/App.Release.entitlements ios/App/App/PrivacyInfo.xcprivacy native/watch/PrivacyInfo.xcprivacy
SYNC_STATUS="$(git status --porcelain --untracked-files=all)"
GENERATED_POD_LOCK=0
if [[ "${NAVA_ARCHIVE:-0}" == "1" && -n "${SYNC_STATUS}" ]]; then
  UNEXPECTED_SYNC_STATUS="$(printf '%s\n' "${SYNC_STATUS}" | grep -vE '^\?\? ios/App/Podfile\.lock$' || true)"
  if [[ -n "${UNEXPECTED_SYNC_STATUS}" ]]; then
    echo "Dependency sync changed files other than a first-run Podfile.lock:" >&2
    printf '%s\n' "${SYNC_STATUS}" >&2
    echo "Review and commit those changes, then retry with a clean checkout." >&2
    exit 1
  fi
  GENERATED_POD_LOCK=1
  echo "CocoaPods generated the first ios/App/Podfile.lock; it will be preserved with the signed build evidence."
fi

DERIVED_DATA="${REPO_ROOT}/artifacts/ios/DerivedData"
mkdir -p "${DERIVED_DATA}"

# Compile every Swift/Capacitor source without requiring a signing identity. HealthKit values
# still require a physical iPhone; this step proves only that the native target compiles.
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "${DERIVED_DATA}" \
  CODE_SIGNING_ALLOWED=NO \
  build

if [[ "${NAVA_ARCHIVE:-0}" != "1" ]]; then
  echo "Unsigned iOS compile passed. For an archive set NAVA_ARCHIVE=1, NAVA_APPLE_TEAM_ID, NAVA_IOS_BUNDLE_ID, NAVA_IOS_VERSION and NAVA_IOS_BUILD_NUMBER."
  exit 0
fi

# The same version/build overrides apply to the iPhone and its embedded Watch app.
# Bundle IDs are deliberately not overridden: configure the approved root in the
# project AND capacitor.config.ts, then let the resolved-settings check enforce it.
SIGNING_SETTINGS=(
  "DEVELOPMENT_TEAM=${NAVA_APPLE_TEAM_ID}"
  "MARKETING_VERSION=${NAVA_IOS_VERSION}"
  "CURRENT_PROJECT_VERSION=${NAVA_IOS_BUILD_NUMBER}"
)
PROVISIONING_FLAGS=()
if [[ "${NAVA_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
  PROVISIONING_FLAGS=(-allowProvisioningUpdates)
fi
AUTHENTICATION_FLAGS=()
AUTHENTICATION_VALUES=(
  "${NAVA_APP_STORE_CONNECT_KEY_PATH:-}"
  "${NAVA_APP_STORE_CONNECT_KEY_ID:-}"
  "${NAVA_APP_STORE_CONNECT_ISSUER_ID:-}"
)
AUTHENTICATION_VALUE_COUNT=0
for value in "${AUTHENTICATION_VALUES[@]}"; do
  [[ -n "${value}" ]] && AUTHENTICATION_VALUE_COUNT=$((AUTHENTICATION_VALUE_COUNT + 1))
done
if (( AUTHENTICATION_VALUE_COUNT != 0 && AUTHENTICATION_VALUE_COUNT != 3 )); then
  echo "App Store Connect authentication requires key path, key ID and issuer ID together." >&2
  exit 1
fi
if (( AUTHENTICATION_VALUE_COUNT == 3 )); then
  if [[ ! -f "${NAVA_APP_STORE_CONNECT_KEY_PATH}" ]]; then
    echo "App Store Connect private key file does not exist." >&2
    exit 1
  fi
  AUTHENTICATION_FLAGS=(
    -authenticationKeyPath "${NAVA_APP_STORE_CONNECT_KEY_PATH}"
    -authenticationKeyID "${NAVA_APP_STORE_CONNECT_KEY_ID}"
    -authenticationKeyIssuerID "${NAVA_APP_STORE_CONNECT_ISSUER_ID}"
  )
fi
if [[ "${NAVA_UPLOAD:-0}" == "1" && ${AUTHENTICATION_VALUE_COUNT} -ne 3 ]]; then
  echo "NAVA_UPLOAD=1 requires App Store Connect API key path, key ID and issuer ID." >&2
  exit 1
fi
RELEASE_DIR="${REPO_ROOT}/artifacts/ios/${NAVA_IOS_VERSION}-${NAVA_IOS_BUILD_NUMBER}"
if [[ -e "${RELEASE_DIR}" ]]; then
  echo "Release output already exists: ${RELEASE_DIR}. Choose a new build number; existing evidence is preserved." >&2
  exit 1
fi
mkdir -p "${RELEASE_DIR}"
if [[ -f ios/App/Podfile.lock ]]; then
  cp ios/App/Podfile.lock "${RELEASE_DIR}/Podfile.lock"
fi
xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' "${SIGNING_SETTINGS[@]}" \
  -showBuildSettings -json > "${RELEASE_DIR}/build-settings.json"
node scripts/ios-release-checks.mjs --build-settings "${RELEASE_DIR}/build-settings.json"
git rev-parse HEAD > "${RELEASE_DIR}/source-commit.txt"
ARCHIVE_PATH="${RELEASE_DIR}/NAVA.xcarchive"
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "${DERIVED_DATA}" \
  -archivePath "${ARCHIVE_PATH}" \
  "${SIGNING_SETTINGS[@]}" \
  ${PROVISIONING_FLAGS[@]+"${PROVISIONING_FLAGS[@]}"} \
  ${AUTHENTICATION_FLAGS[@]+"${AUTHENTICATION_FLAGS[@]}"} \
  archive

node scripts/ios-release-checks.mjs --archive "${ARCHIVE_PATH}"
echo "Signed archive created at ${ARCHIVE_PATH}. Validate it in Xcode Organizer before TestFlight upload."

if [[ "${NAVA_EXPORT:-0}" == "1" ]]; then
  # Export first so CI keeps an inspectable IPA and archive before any optional upload.
  cat > "${RELEASE_DIR}/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>export</string>
<key>teamID</key><string>${NAVA_APPLE_TEAM_ID}</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>provisioningProfiles</key><dict>
<key>${NAVA_IOS_BUNDLE_ID}</key><string>NAVA iOS App Store</string>
<key>${NAVA_IOS_BUNDLE_ID}.watchkitapp</key><string>NAVA Watch App Store</string>
</dict>
<key>manageAppVersionAndBuildNumber</key><false/>
<key>uploadSymbols</key><true/>
</dict></plist>
EOF
  xcodebuild -exportArchive -archivePath "${ARCHIVE_PATH}" \
    -exportOptionsPlist "${RELEASE_DIR}/ExportOptions.plist" \
    -exportPath "${RELEASE_DIR}/export" \
    ${PROVISIONING_FLAGS[@]+"${PROVISIONING_FLAGS[@]}"} \
    ${AUTHENTICATION_FLAGS[@]+"${AUTHENTICATION_FLAGS[@]}"}
  echo "App Store Connect IPA exported under ${RELEASE_DIR}/export."

  if [[ "${NAVA_UPLOAD:-0}" == "1" ]]; then
    # macOS still ships Bash 3.2, which does not provide mapfile/readarray.
    IPA_FILES=()
    while IFS= read -r ipa_file; do
      IPA_FILES+=("${ipa_file}")
    done < <(find "${RELEASE_DIR}/export" -maxdepth 1 -type f -name '*.ipa' -print)
    if (( ${#IPA_FILES[@]} != 1 )); then
      echo "Expected exactly one exported IPA, found ${#IPA_FILES[@]}." >&2
      exit 1
    fi
    xcrun altool --upload-app \
      --type ios \
      --file "${IPA_FILES[0]}" \
      --apiKey "${NAVA_APP_STORE_CONNECT_KEY_ID}" \
      --apiIssuer "${NAVA_APP_STORE_CONNECT_ISSUER_ID}"
    printf '%s\n' "${IPA_FILES[0]}" > "${RELEASE_DIR}/uploaded-ipa.txt"
    echo "Upload accepted by App Store Connect. Processing and export-compliance answers are still pending."
  else
    echo "Upload is disabled. Set NAVA_UPLOAD=1 only when this build should be sent to App Store Connect."
  fi
fi
