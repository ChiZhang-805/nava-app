import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_IPHONE_PREVIEW_DEVICE_ID,
  findIPhonePreviewDevice,
  IPHONE_PREVIEW_DEVICES,
} from "../src/constants/iphonePreviewDevices.ts";

test("preview catalog covers every iPhone 14-17 family variant", () => {
  assert.equal(IPHONE_PREVIEW_DEVICES.length, 18);
  assert.deepEqual(
    Object.fromEntries(["14", "15", "16", "17"].map((generation) => [
      generation,
      IPHONE_PREVIEW_DEVICES.filter((device) => device.generation === generation).length,
    ])),
    { 14: 4, 15: 4, 16: 5, 17: 5 },
  );
  assert.deepEqual(
    IPHONE_PREVIEW_DEVICES.filter((device) => device.cutout === "notch").map((device) => device.id),
    ["iphone-17e", "iphone-16e", "iphone-14", "iphone-14-plus"],
  );
});

test("logical canvases are exact @3x derivations of Apple pixel dimensions", () => {
  const ids = new Set<string>();
  for (const device of IPHONE_PREVIEW_DEVICES) {
    assert.equal(ids.has(device.id), false, `duplicate device id ${device.id}`);
    ids.add(device.id);
    assert.equal(device.pixelWidth / 3, device.logicalWidth, `${device.label} width`);
    assert.equal(device.pixelHeight / 3, device.logicalHeight, `${device.label} height`);
    assert.match(device.officialSpecUrl, /^https:\/\/(support\.)?apple\.com\//);
    assert.match(device.officialGeometryUrl, /^https:\/\/(?:devimages-cdn\.apple\.com|developer\.apple\.com)\//);
    assert.ok(device.calibration.cutout.width > 120 && device.calibration.cutout.width < 180, `${device.label} cutout width`);
    assert.ok(device.calibration.cutout.height > 30 && device.calibration.cutout.height < 40, `${device.label} cutout height`);
    const cutoutLeft = (device.logicalWidth - device.calibration.cutout.width) / 2;
    const cutoutRight = cutoutLeft + device.calibration.cutout.width;
    assert.ok(device.calibration.status.timeLeft + device.calibration.status.timeWidth < cutoutLeft, `${device.label} time/cutout separation`);
    assert.ok(device.calibration.status.signalLeft > cutoutRight, `${device.label} cutout/status separation`);
    assert.ok(device.calibration.status.batteryLeft + device.calibration.status.batteryWidth <= device.logicalWidth, `${device.label} status right edge`);
    assert.ok(device.calibration.safeTop > device.calibration.cutout.top + device.calibration.cutout.height, `${device.label} safe top`);
  }
});

test("official geometry calibrations preserve model-specific cutout differences", () => {
  assert.equal(findIPhonePreviewDevice("iphone-14").calibration.cutout.width, 171.333);
  assert.equal(findIPhonePreviewDevice("iphone-14-plus").calibration.cutout.width, 171.333);
  assert.equal(findIPhonePreviewDevice("iphone-16e").calibration.cutout.width, 161.785);
  assert.equal(findIPhonePreviewDevice("iphone-17e").calibration.cutout.width, 161.785);
  assert.equal(findIPhonePreviewDevice("iphone-16").calibration.cutout.top, 11.333);
  assert.equal(findIPhonePreviewDevice("iphone-17").calibration.cutout.top, 14.333);
  assert.equal(findIPhonePreviewDevice("iphone-air").calibration.cutout.top, 20.333);
  assert.equal(findIPhonePreviewDevice("iphone-air").calibration.status.centerY, 38.5);
});

test("camera and upper-control details follow the model generations", () => {
  const withCameraControl = IPHONE_PREVIEW_DEVICES.filter((device) => device.cameraControl).map((device) => device.id);
  assert.deepEqual(withCameraControl, [
    "iphone-17",
    "iphone-air",
    "iphone-17-pro",
    "iphone-17-pro-max",
    "iphone-16",
    "iphone-16-plus",
    "iphone-16-pro",
    "iphone-16-pro-max",
  ]);
  assert.equal(findIPhonePreviewDevice(DEFAULT_IPHONE_PREVIEW_DEVICE_ID).label, "iPhone 15 Pro Max");
  assert.equal(findIPhonePreviewDevice("unknown").id, DEFAULT_IPHONE_PREVIEW_DEVICE_ID);
});
