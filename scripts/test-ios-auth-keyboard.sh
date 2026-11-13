#!/usr/bin/env bash
set -euo pipefail
# Run after cap:sync:ios on macOS; screenshots come from actual simulator apps.
RUNTIME_ID="$(xcrun simctl list runtimes -j | python3 -c 'import json,sys; r=[x for x in json.load(sys.stdin)["runtimes"] if x.get("isAvailable") and "SimRuntime.iOS-" in x["identifier"] and x["version"].startswith("26.")]; print(sorted(r,key=lambda x:tuple(map(int,x["version"].split("."))))[-1]["identifier"])')"
mkdir -p artifacts/ios-auth-keyboard
# Xcode signed the simulator products during build-for-testing. Do not
# re-sign them here: app entitlements must never be copied onto frameworks.
for DEVICE in "iPhone 15 Pro Max" "iPhone SE (3rd generation)"; do
  TYPE="$(xcrun simctl list devicetypes -j | DEVICE="$DEVICE" python3 -c 'import json,sys,os; print(next(x["identifier"] for x in json.load(sys.stdin)["devicetypes"] if x["name"]==os.environ["DEVICE"]))')"
  ID="$(xcrun simctl create "NAVA Auth Keyboard" "$TYPE" "$RUNTIME_ID")"
  # A connected hardware keyboard suppresses the software keyboard in XCTest.
  defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool NO
  xcrun simctl boot "$ID"
  xcrun simctl bootstatus "$ID" -b
  xcrun simctl ui "$ID" appearance light
  # Check the simulator's capture service before starting XCTest. A hung
  # capture request otherwise holds the whole UI test for many minutes.
  python3 - "$ID" "artifacts/ios-auth-keyboard/preflight-${ID}.png" <<'PY'
import subprocess
import sys

subprocess.run(["xcrun", "simctl", "io", sys.argv[1], "screenshot", sys.argv[2]],
               check=True, timeout=45)
PY
  RESULT="artifacts/ios-auth-keyboard/${ID}.xcresult"
  STATUS=0
  # Both devices use the same release test products, without recompiling the
  # application or creating a second simulator clone.
  xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release \
    -destination "platform=iOS Simulator,id=$ID" \
    -derivedDataPath artifacts/ios/DerivedData \
    -resultBundlePath "$RESULT" \
    -parallel-testing-enabled NO \
    -only-testing:AppUITests/NavaAuthKeyboardTests \
    test-without-building || STATUS=$?
  xcrun xcresulttool export attachments --path "$RESULT" --output-path "artifacts/ios-auth-keyboard/${ID}-screenshots" || true
  xcrun simctl shutdown "$ID" || true
  if [[ "$STATUS" != 0 ]]; then exit "$STATUS"; fi
done
