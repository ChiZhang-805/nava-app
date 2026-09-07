export type IPhonePreviewCutout = "dynamic-island" | "notch";
export type IPhonePreviewUpperControl = "ringer" | "action";

export type IPhonePreviewCalibration = {
  shellRadius: number;
  safeTop: number;
  cutout: {
    top: number;
    width: number;
    height: number;
    radius: number;
  };
  status: {
    centerY: number;
    height: number;
    timeLeft: number;
    timeWidth: number;
    signalLeft: number;
    signalWidth: number;
    wifiLeft: number;
    wifiWidth: number;
    batteryLeft: number;
    batteryWidth: number;
  };
  homeIndicator: {
    bottom: number;
    width: number;
    height: number;
  };
};

export type IPhonePreviewDevice = {
  id: string;
  generation: "17" | "16" | "15" | "14";
  label: string;
  screenInches: number;
  pixelWidth: number;
  pixelHeight: number;
  logicalWidth: number;
  logicalHeight: number;
  cutout: IPhonePreviewCutout;
  upperControl: IPhonePreviewUpperControl;
  cameraControl: boolean;
  officialSpecUrl: string;
  officialGeometryUrl: string;
  geometryBasis: "Apple Product Bezels" | "Apple Dimensional Drawings";
  calibration: IPhonePreviewCalibration;
};

const HOME_INDICATOR = { bottom: 8, width: 134, height: 5 } as const;

// The following visible bounds were measured from Apple's official portrait
// Product Bezel PSDs at their native physical resolution, then divided by the
// documented @3x scale. The 16e/17e notch uses Apple's dimensional drawing:
// 26.79 mm x 5.58 mm on a 64.58 mm x 139.77 mm active display area.
const CALIBRATION_390_NOTCH_14: IPhonePreviewCalibration = {
  shellRadius: 48,
  safeTop: 47,
  cutout: { top: 0, width: 171.333, height: 33.667, radius: 19 },
  status: {
    centerY: 25.833,
    height: 13,
    timeLeft: 46,
    timeWidth: 44,
    signalLeft: 285.333,
    signalWidth: 19.334,
    wifiLeft: 312,
    wifiWidth: 17,
    batteryLeft: 336.333,
    batteryWidth: 27.334,
  },
  homeIndicator: HOME_INDICATOR,
};

const CALIBRATION_428_NOTCH_14_PLUS: IPhonePreviewCalibration = {
  shellRadius: 51,
  safeTop: 47,
  cutout: { top: 0, width: 171.333, height: 33.667, radius: 19 },
  status: {
    centerY: 25.167,
    height: 14.333,
    timeLeft: 55.667,
    timeWidth: 44,
    signalLeft: 308.333,
    signalWidth: 21.667,
    wifiLeft: 337.333,
    wifiWidth: 19.667,
    batteryLeft: 364.333,
    batteryWidth: 31.334,
  },
  homeIndicator: HOME_INDICATOR,
};

const CALIBRATION_390_NOTCH_E: IPhonePreviewCalibration = {
  ...CALIBRATION_390_NOTCH_14,
  cutout: { top: 0, width: 161.785, height: 33.695, radius: 18.5 },
};

const CALIBRATION_393_ISLAND: IPhonePreviewCalibration = {
  shellRadius: 48,
  safeTop: 59,
  cutout: { top: 11.333, width: 125, height: 36.667, radius: 21 },
  status: {
    centerY: 29.167,
    height: 13,
    timeLeft: 55.333,
    timeWidth: 44,
    signalLeft: 282,
    signalWidth: 19.333,
    wifiLeft: 308.667,
    wifiWidth: 17,
    batteryLeft: 332.667,
    batteryWidth: 27.666,
  },
  homeIndicator: HOME_INDICATOR,
};

const CALIBRATION_430_ISLAND: IPhonePreviewCalibration = {
  shellRadius: 51,
  safeTop: 59,
  cutout: { top: 11.333, width: 125.334, height: 36.667, radius: 21 },
  status: {
    centerY: 29.167,
    height: 13,
    timeLeft: 64.667,
    timeWidth: 44,
    signalLeft: 309.667,
    signalWidth: 19.333,
    wifiLeft: 336.333,
    wifiWidth: 17,
    batteryLeft: 360.333,
    batteryWidth: 27.667,
  },
  homeIndicator: HOME_INDICATOR,
};

const CALIBRATION_402_ISLAND_PRO: IPhonePreviewCalibration = {
  shellRadius: 48,
  safeTop: 62,
  cutout: { top: 14.333, width: 124.667, height: 35.667, radius: 21 },
  status: {
    centerY: 31.833,
    height: 13,
    timeLeft: 58.333,
    timeWidth: 44,
    signalLeft: 288.667,
    signalWidth: 19.333,
    wifiLeft: 315.333,
    wifiWidth: 17,
    batteryLeft: 339.333,
    batteryWidth: 27.667,
  },
  homeIndicator: HOME_INDICATOR,
};

const CALIBRATION_440_ISLAND_16_PRO_MAX: IPhonePreviewCalibration = {
  shellRadius: 54,
  safeTop: 62,
  cutout: { top: 14.333, width: 124.666, height: 36, radius: 21 },
  status: {
    centerY: 31.167,
    height: 13,
    timeLeft: 68,
    timeWidth: 44,
    signalLeft: 317,
    signalWidth: 19.333,
    wifiLeft: 343.667,
    wifiWidth: 17,
    batteryLeft: 367.667,
    batteryWidth: 27.666,
  },
  homeIndicator: HOME_INDICATOR,
};

const CALIBRATION_402_ISLAND_17: IPhonePreviewCalibration = {
  ...CALIBRATION_402_ISLAND_PRO,
  cutout: { top: 14.333, width: 124.333, height: 35.667, radius: 21 },
};

const CALIBRATION_440_ISLAND_17_PRO_MAX: IPhonePreviewCalibration = {
  shellRadius: 54,
  safeTop: 62,
  cutout: { top: 14.667, width: 124, height: 35.666, radius: 21 },
  status: {
    centerY: 32.5,
    height: 13,
    timeLeft: 67.667,
    timeWidth: 44,
    signalLeft: 317,
    signalWidth: 19.333,
    wifiLeft: 343.667,
    wifiWidth: 17,
    batteryLeft: 367.667,
    batteryWidth: 27.666,
  },
  homeIndicator: HOME_INDICATOR,
};

const CALIBRATION_420_ISLAND_AIR: IPhonePreviewCalibration = {
  shellRadius: 51,
  safeTop: 68,
  cutout: { top: 20.333, width: 124.666, height: 36, radius: 21 },
  status: {
    centerY: 38.5,
    height: 13,
    timeLeft: 63.333,
    timeWidth: 44,
    signalLeft: 302.333,
    signalWidth: 19.334,
    wifiLeft: 329,
    wifiWidth: 17,
    batteryLeft: 353,
    batteryWidth: 27.667,
  },
  homeIndicator: HOME_INDICATOR,
};

const BEZEL_14_URL = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-14.dmg";
const BEZEL_15_URL = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-15.dmg";
const BEZEL_16_URL = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-16.dmg";
const BEZEL_17_URL = "https://devimages-cdn.apple.com/design/resources/download/Bezel-iPhone-17.dmg";
const DIMENSIONAL_16E_URL = "https://developer.apple.com/download/files/accessories/dimensional-drawings/iphone-16e.pdf";
const DIMENSIONAL_17E_URL = "https://developer.apple.com/download/files/accessories/dimensional-drawings/iphone-17e.pdf";

// Apple publishes both the physical pixels and the logical point canvases used
// here. Preview-only chrome never enters the actual mobile/PWA product surface.
export const IPHONE_PREVIEW_DEVICES = [
  {
    id: "iphone-17",
    generation: "17",
    label: "iPhone 17",
    screenInches: 6.3,
    pixelWidth: 1206,
    pixelHeight: 2622,
    logicalWidth: 402,
    logicalHeight: 874,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/125089",
    officialGeometryUrl: BEZEL_17_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_402_ISLAND_17,
  },
  {
    id: "iphone-air",
    generation: "17",
    label: "iPhone Air",
    screenInches: 6.5,
    pixelWidth: 1260,
    pixelHeight: 2736,
    logicalWidth: 420,
    logicalHeight: 912,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/125092",
    officialGeometryUrl: BEZEL_17_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_420_ISLAND_AIR,
  },
  {
    id: "iphone-17-pro",
    generation: "17",
    label: "iPhone 17 Pro",
    screenInches: 6.3,
    pixelWidth: 1206,
    pixelHeight: 2622,
    logicalWidth: 402,
    logicalHeight: 874,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/125090",
    officialGeometryUrl: BEZEL_17_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_402_ISLAND_17,
  },
  {
    id: "iphone-17-pro-max",
    generation: "17",
    label: "iPhone 17 Pro Max",
    screenInches: 6.9,
    pixelWidth: 1320,
    pixelHeight: 2868,
    logicalWidth: 440,
    logicalHeight: 956,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/125091",
    officialGeometryUrl: BEZEL_17_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_440_ISLAND_17_PRO_MAX,
  },
  {
    id: "iphone-17e",
    generation: "17",
    label: "iPhone 17e",
    screenInches: 6.1,
    pixelWidth: 1170,
    pixelHeight: 2532,
    logicalWidth: 390,
    logicalHeight: 844,
    cutout: "notch",
    upperControl: "action",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/126470",
    officialGeometryUrl: DIMENSIONAL_17E_URL,
    geometryBasis: "Apple Dimensional Drawings",
    calibration: CALIBRATION_390_NOTCH_E,
  },
  {
    id: "iphone-16",
    generation: "16",
    label: "iPhone 16",
    screenInches: 6.1,
    pixelWidth: 1179,
    pixelHeight: 2556,
    logicalWidth: 393,
    logicalHeight: 852,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/121029",
    officialGeometryUrl: BEZEL_16_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_393_ISLAND,
  },
  {
    id: "iphone-16-plus",
    generation: "16",
    label: "iPhone 16 Plus",
    screenInches: 6.7,
    pixelWidth: 1290,
    pixelHeight: 2796,
    logicalWidth: 430,
    logicalHeight: 932,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/121030",
    officialGeometryUrl: BEZEL_16_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_430_ISLAND,
  },
  {
    id: "iphone-16-pro",
    generation: "16",
    label: "iPhone 16 Pro",
    screenInches: 6.3,
    pixelWidth: 1206,
    pixelHeight: 2622,
    logicalWidth: 402,
    logicalHeight: 874,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/121031",
    officialGeometryUrl: BEZEL_16_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_402_ISLAND_PRO,
  },
  {
    id: "iphone-16-pro-max",
    generation: "16",
    label: "iPhone 16 Pro Max",
    screenInches: 6.9,
    pixelWidth: 1320,
    pixelHeight: 2868,
    logicalWidth: 440,
    logicalHeight: 956,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: true,
    officialSpecUrl: "https://support.apple.com/en-us/121032",
    officialGeometryUrl: BEZEL_16_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_440_ISLAND_16_PRO_MAX,
  },
  {
    id: "iphone-16e",
    generation: "16",
    label: "iPhone 16e",
    screenInches: 6.1,
    pixelWidth: 1170,
    pixelHeight: 2532,
    logicalWidth: 390,
    logicalHeight: 844,
    cutout: "notch",
    upperControl: "action",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/122208",
    officialGeometryUrl: DIMENSIONAL_16E_URL,
    geometryBasis: "Apple Dimensional Drawings",
    calibration: CALIBRATION_390_NOTCH_E,
  },
  {
    id: "iphone-15",
    generation: "15",
    label: "iPhone 15",
    screenInches: 6.1,
    pixelWidth: 1179,
    pixelHeight: 2556,
    logicalWidth: 393,
    logicalHeight: 852,
    cutout: "dynamic-island",
    upperControl: "ringer",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111831",
    officialGeometryUrl: BEZEL_15_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_393_ISLAND,
  },
  {
    id: "iphone-15-plus",
    generation: "15",
    label: "iPhone 15 Plus",
    screenInches: 6.7,
    pixelWidth: 1290,
    pixelHeight: 2796,
    logicalWidth: 430,
    logicalHeight: 932,
    cutout: "dynamic-island",
    upperControl: "ringer",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111830",
    officialGeometryUrl: BEZEL_15_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_430_ISLAND,
  },
  {
    id: "iphone-15-pro",
    generation: "15",
    label: "iPhone 15 Pro",
    screenInches: 6.1,
    pixelWidth: 1179,
    pixelHeight: 2556,
    logicalWidth: 393,
    logicalHeight: 852,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111829",
    officialGeometryUrl: BEZEL_15_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_393_ISLAND,
  },
  {
    id: "iphone-15-pro-max",
    generation: "15",
    label: "iPhone 15 Pro Max",
    screenInches: 6.7,
    pixelWidth: 1290,
    pixelHeight: 2796,
    logicalWidth: 430,
    logicalHeight: 932,
    cutout: "dynamic-island",
    upperControl: "action",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111828",
    officialGeometryUrl: BEZEL_15_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_430_ISLAND,
  },
  {
    id: "iphone-14",
    generation: "14",
    label: "iPhone 14",
    screenInches: 6.1,
    pixelWidth: 1170,
    pixelHeight: 2532,
    logicalWidth: 390,
    logicalHeight: 844,
    cutout: "notch",
    upperControl: "ringer",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111850",
    officialGeometryUrl: BEZEL_14_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_390_NOTCH_14,
  },
  {
    id: "iphone-14-plus",
    generation: "14",
    label: "iPhone 14 Plus",
    screenInches: 6.7,
    pixelWidth: 1284,
    pixelHeight: 2778,
    logicalWidth: 428,
    logicalHeight: 926,
    cutout: "notch",
    upperControl: "ringer",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111854",
    officialGeometryUrl: BEZEL_14_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_428_NOTCH_14_PLUS,
  },
  {
    id: "iphone-14-pro",
    generation: "14",
    label: "iPhone 14 Pro",
    screenInches: 6.1,
    pixelWidth: 1179,
    pixelHeight: 2556,
    logicalWidth: 393,
    logicalHeight: 852,
    cutout: "dynamic-island",
    upperControl: "ringer",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111849",
    officialGeometryUrl: BEZEL_14_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_393_ISLAND,
  },
  {
    id: "iphone-14-pro-max",
    generation: "14",
    label: "iPhone 14 Pro Max",
    screenInches: 6.7,
    pixelWidth: 1290,
    pixelHeight: 2796,
    logicalWidth: 430,
    logicalHeight: 932,
    cutout: "dynamic-island",
    upperControl: "ringer",
    cameraControl: false,
    officialSpecUrl: "https://support.apple.com/en-us/111846",
    officialGeometryUrl: BEZEL_14_URL,
    geometryBasis: "Apple Product Bezels",
    calibration: CALIBRATION_430_ISLAND,
  },
] as const satisfies readonly IPhonePreviewDevice[];

export const DEFAULT_IPHONE_PREVIEW_DEVICE_ID = "iphone-15-pro-max";

export function findIPhonePreviewDevice(id: string | null | undefined): IPhonePreviewDevice {
  return IPHONE_PREVIEW_DEVICES.find((device) => device.id === id)
    ?? IPHONE_PREVIEW_DEVICES.find((device) => device.id === DEFAULT_IPHONE_PREVIEW_DEVICE_ID)
    ?? IPHONE_PREVIEW_DEVICES[0];
}
