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
  }
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
