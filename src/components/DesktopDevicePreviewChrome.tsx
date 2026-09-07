import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DEFAULT_IPHONE_PREVIEW_DEVICE_ID,
  findIPhonePreviewDevice,
  IPHONE_PREVIEW_DEVICES,
} from "../constants/iphonePreviewDevices";

const DEVICE_PREFERENCE_KEY = "nava.desktop-preview-device.v1";
const GRID_PREFERENCE_KEY = "nava.desktop-preview-grid.v1";

function currentClock() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatMetric(value: number) {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export default function DesktopDevicePreviewChrome() {
  const [clock, setClock] = useState(currentClock);
  const [deviceId, setDeviceId] = useState(() => {
    try {
      return findIPhonePreviewDevice(window.localStorage.getItem(DEVICE_PREFERENCE_KEY)).id;
    } catch {
      return DEFAULT_IPHONE_PREVIEW_DEVICE_ID;
    }
  });
  const [showCalibrationGrid, setShowCalibrationGrid] = useState(() => {
    try {
      return window.localStorage.getItem(GRID_PREFERENCE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const previewRef = useRef<HTMLDivElement>(null);
  const device = findIPhonePreviewDevice(deviceId);
  const { calibration } = device;

  useEffect(() => {
    const update = () => setClock(currentClock());
    const interval = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, []);

  useLayoutEffect(() => {
    const stage = previewRef.current?.parentElement;
    if (!stage) return;
    const desktopPreview = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 700px) and (min-height: 700px)");
    const setMetric = (name: string, value: number) => stage.style.setProperty(name, `${value}px`);

    stage.dataset.navaPreviewDevice = device.id;
    stage.dataset.navaPreviewCutout = device.cutout;
    stage.dataset.navaPreviewUpperControl = device.upperControl;
    stage.dataset.navaPreviewCameraControl = device.cameraControl ? "true" : "false";
    setMetric("--nava-device-width", device.logicalWidth);
    setMetric("--nava-device-height", device.logicalHeight);
    setMetric("--nava-device-radius", calibration.shellRadius);
    setMetric("--nava-system-safe-top", calibration.safeTop);
    setMetric("--nava-cutout-top", calibration.cutout.top);
    setMetric("--nava-cutout-width", calibration.cutout.width);
    setMetric("--nava-cutout-height", calibration.cutout.height);
    setMetric("--nava-cutout-radius", calibration.cutout.radius);
    setMetric("--nava-status-center", calibration.status.centerY);
    setMetric("--nava-status-height", calibration.status.height);
    setMetric("--nava-status-time-left", calibration.status.timeLeft);
    setMetric("--nava-status-time-width", calibration.status.timeWidth);
    setMetric("--nava-status-signal-left", calibration.status.signalLeft);
    setMetric("--nava-status-signal-width", calibration.status.signalWidth);
    setMetric("--nava-status-wifi-left", calibration.status.wifiLeft);
    setMetric("--nava-status-wifi-width", calibration.status.wifiWidth);
    setMetric("--nava-status-battery-left", calibration.status.batteryLeft);
    setMetric("--nava-status-battery-width", calibration.status.batteryWidth);
    setMetric("--nava-home-indicator-bottom", calibration.homeIndicator.bottom);
    setMetric("--nava-home-indicator-width", calibration.homeIndicator.width);
    setMetric("--nava-home-indicator-height", calibration.homeIndicator.height);

    const updateScale = () => {
      if (!desktopPreview.matches) {
        stage.style.removeProperty("--nava-preview-scale");
        return;
      }
      const availableHeight = Math.max(1, window.innerHeight - 52);
      const availableWidth = Math.max(1, window.innerWidth - 48);
      const scale = Math.min(1, availableHeight / device.logicalHeight, availableWidth / device.logicalWidth);
      stage.style.setProperty("--nava-preview-scale", scale.toFixed(6));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    desktopPreview.addEventListener("change", updateScale);
    return () => {
      window.removeEventListener("resize", updateScale);
      desktopPreview.removeEventListener("change", updateScale);
      stage.style.removeProperty("--nava-preview-scale");
      for (const property of [
        "--nava-device-width",
        "--nava-device-height",
        "--nava-device-radius",
        "--nava-system-safe-top",
        "--nava-cutout-top",
        "--nava-cutout-width",
        "--nava-cutout-height",
        "--nava-cutout-radius",
        "--nava-status-center",
        "--nava-status-height",
        "--nava-status-time-left",
        "--nava-status-time-width",
        "--nava-status-signal-left",
        "--nava-status-signal-width",
        "--nava-status-wifi-left",
        "--nava-status-wifi-width",
        "--nava-status-battery-left",
        "--nava-status-battery-width",
        "--nava-home-indicator-bottom",
        "--nava-home-indicator-width",
        "--nava-home-indicator-height",
      ]) stage.style.removeProperty(property);
      delete stage.dataset.navaPreviewDevice;
      delete stage.dataset.navaPreviewCutout;
      delete stage.dataset.navaPreviewUpperControl;
      delete stage.dataset.navaPreviewCameraControl;
    };
  }, [calibration, device]);

  const chooseDevice = (nextDeviceId: string) => {
    const nextDevice = findIPhonePreviewDevice(nextDeviceId);
    setDeviceId(nextDevice.id);
    try {
      window.localStorage.setItem(DEVICE_PREFERENCE_KEY, nextDevice.id);
    } catch {
      // The preview remains usable when storage is disabled.
    }
  };

  const toggleCalibrationGrid = (visible: boolean) => {
    setShowCalibrationGrid(visible);
    try {
      window.localStorage.setItem(GRID_PREFERENCE_KEY, String(visible));
    } catch {
      // The preview remains usable when storage is disabled.
    }
  };

  const cutoutLeft = (device.logicalWidth - calibration.cutout.width) / 2;

  return (
    <>
      <aside className="nava-device-selector" data-preview-only="desktop-device-selector">
        <label htmlFor="nava-preview-device">预览机型</label>
        <select
          id="nava-preview-device"
          data-testid="nava-preview-device-select"
          value={device.id}
          onChange={(event) => chooseDevice(event.target.value)}
          aria-label="选择 iPhone 预览机型"
        >
          {["17", "16", "15", "14"].map((generation) => (
            <optgroup key={generation} label={`iPhone ${generation} 系列`}>
              {IPHONE_PREVIEW_DEVICES.filter((candidate) => candidate.generation === generation).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p>
          <span>{device.pixelWidth} × {device.pixelHeight} px</span>
          <span>{device.logicalWidth} × {device.logicalHeight} pt · {device.screenInches.toFixed(1)}″ · {device.cutout === "notch" ? "刘海" : "灵动岛"}</span>
          <span>
            {device.cutout === "notch" ? "刘海" : "岛"} x {formatMetric(cutoutLeft)} · y {formatMetric(calibration.cutout.top)} · {formatMetric(calibration.cutout.width)} × {formatMetric(calibration.cutout.height)} pt
          </span>
          <span>
            时间 x {formatMetric(calibration.status.timeLeft)} · 状态区 x {formatMetric(calibration.status.signalLeft)} · 中轴 y {formatMetric(calibration.status.centerY)}
          </span>
          <span>{device.geometryBasis} 实测校准</span>
        </p>
        <label className="nava-device-grid-toggle">
          <input
            type="checkbox"
            data-testid="nava-preview-grid-toggle"
            checked={showCalibrationGrid}
            onChange={(event) => toggleCalibrationGrid(event.target.checked)}
          />
          <span>1 pt 校准网格（10 pt 加粗）</span>
        </label>
      </aside>
      <div
        ref={previewRef}
        className="nava-device-preview"
        aria-hidden="true"
        data-preview-only="desktop-device-chrome"
        data-calibration-grid={showCalibrationGrid ? "true" : "false"}
      >
        <span className={`nava-device-side-button nava-device-side-button--${device.upperControl}`} />
        <span className="nava-device-side-button nava-device-side-button--volume-up" />
        <span className="nava-device-side-button nava-device-side-button--volume-down" />
        <span className="nava-device-side-button nava-device-side-button--power" />
        {device.cameraControl && <span className="nava-device-side-button nava-device-side-button--camera-control" />}
        <div className="nava-device-status-bar">
          <time>{clock}</time>
          {device.cutout === "dynamic-island" ? (
            <span className="nava-device-cutout nava-device-dynamic-island"><i /></span>
          ) : (
            <span className="nava-device-cutout nava-device-notch"><i className="nava-device-notch-speaker" /><i className="nava-device-notch-camera" /></span>
          )}
          <span className="nava-device-status-icons">
            <svg className="nava-device-signal" viewBox="0 0 18 13">
              <rect x="1" y="8" width="2.5" height="4" rx="1" />
              <rect x="5.5" y="6" width="2.5" height="6" rx="1" />
              <rect x="10" y="3.5" width="2.5" height="8.5" rx="1" />
              <rect x="14.5" y="1" width="2.5" height="11" rx="1" />
            </svg>
            <svg className="nava-device-wifi" viewBox="0 0 18 14">
              <path d="M1.3 4.5C5.7.8 12.3.8 16.7 4.5M4.1 7.7c2.8-2.3 7-2.3 9.8 0M7.2 10.7c1-.8 2.6-.8 3.6 0" />
              <circle cx="9" cy="12.4" r="1" />
            </svg>
            <span className="nava-device-battery"><i /></span>
          </span>
        </div>
        <span className="nava-device-home-indicator" />
        <span className="nava-device-calibration-grid" />
      </div>
    </>
  );
}
