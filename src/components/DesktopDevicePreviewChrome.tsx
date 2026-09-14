import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Bell, Ellipsis, MousePointerClick, PhoneIncoming, RotateCcw, Smartphone } from "lucide-react";
import {
  DEFAULT_IPHONE_PREVIEW_DEVICE_ID,
  findIPhonePreviewDevice,
  IPHONE_PREVIEW_DEVICES,
} from "../constants/iphonePreviewDevices";
import { getPreviewActivity, simulatePreviewInterruption, subscribePreviewActivity } from "../services/previewEnvironment";

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
  const [showSpecifications, setShowSpecifications] = useState(false);
  const [selectorHeight, setSelectorHeight] = useState(132);
  const previewActivity = useSyncExternalStore(subscribePreviewActivity, getPreviewActivity, () => null);
  const previewState = previewActivity?.state;
  const previewModuleName = previewActivity ? { focus: "专注", exercise: "运动", sleep: "睡眠" }[previewActivity.module] : "";
  const previewRef = useRef<HTMLDivElement>(null);
  const selectorFrontRef = useRef<HTMLElement>(null);
  const selectorBackRef = useRef<HTMLElement>(null);
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
      const panelWidth = window.innerWidth <= 900 ? 132 : window.innerWidth <= 1090 ? 180 : 262;
      const panelRight = window.innerWidth <= 900 ? 12 : 20;
      // Reserve the right-side controls even on a narrow desktop window.
      const availableWidth = Math.max(1, window.innerWidth - 2 * (panelWidth + panelRight + 16));
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

  useLayoutEffect(() => {
    const face = showSpecifications ? selectorBackRef.current : selectorFrontRef.current;
    if (!face) return;
    const updateHeight = () => setSelectorHeight(Math.ceil(face.scrollHeight));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(face);
    return () => observer.disconnect();
  }, [device.id, showSpecifications]);

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
        <div
          className={["nava-device-selector-turn", showSpecifications ? "is-flipped" : ""].filter(Boolean).join(" ")}
          style={{ "--nava-device-selector-height": `${selectorHeight}px` } as CSSProperties}
        >
          <section ref={selectorFrontRef} className="nava-device-selector-face nava-device-selector-front" aria-hidden={showSpecifications} {...(showSpecifications ? { inert: "" } : {})}>
            <header>
              <label htmlFor="nava-preview-device">预览机型</label>
              <button type="button" className="nava-device-selector-flip" onClick={() => setShowSpecifications(true)} aria-label="查看机型规格参数" title="查看规格参数"><Smartphone size={17} /></button>
            </header>
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
            <label className="nava-device-grid-toggle">
              <input
                type="checkbox"
                data-testid="nava-preview-grid-toggle"
                checked={showCalibrationGrid}
                onChange={(event) => toggleCalibrationGrid(event.target.checked)}
              />
              <span>1 pt 校准网格（10 pt 加粗）</span>
            </label>
          </section>
          <section ref={selectorBackRef} className="nava-device-selector-face nava-device-selector-back" aria-hidden={!showSpecifications} {...(!showSpecifications ? { inert: "" } : {})}>
            <header>
              <strong>规格参数</strong>
              <button type="button" className="nava-device-selector-flip" onClick={() => setShowSpecifications(false)} aria-label="返回机型选择" title="返回机型选择"><RotateCcw size={17} /></button>
            </header>
            <dl>
              <div><dt>机型</dt><dd>{device.label}</dd></div>
              <div><dt>物理分辨率</dt><dd>{device.pixelWidth} × {device.pixelHeight} px</dd></div>
              <div><dt>逻辑画布</dt><dd>{device.logicalWidth} × {device.logicalHeight} pt · {device.screenInches.toFixed(1)}″</dd></div>
              <div><dt>{device.cutout === "notch" ? "刘海" : "灵动岛"}</dt><dd>x {formatMetric(cutoutLeft)} · y {formatMetric(calibration.cutout.top)} · {formatMetric(calibration.cutout.width)} × {formatMetric(calibration.cutout.height)} pt</dd></div>
              <div><dt>状态栏</dt><dd>时间 x {formatMetric(calibration.status.timeLeft)} · 状态区 x {formatMetric(calibration.status.signalLeft)} · 中轴 y {formatMetric(calibration.status.centerY)}</dd></div>
              <div><dt>校准依据</dt><dd>{device.geometryBasis}</dd></div>
            </dl>
          </section>
        </div>
      </aside>
      {previewActivity && createPortal(<aside
        className="nava-focus-event-simulator"
        data-preview-only="focus-event-simulator"
        data-preview-module={previewActivity.module}
        style={{ "--nava-preview-panel-top": `${selectorHeight + 32}px` } as CSSProperties}
        aria-label={`${previewModuleName}外部事件模拟`}
      >
        <header><strong>外部事件模拟</strong><small>{previewModuleName} · 预览</small></header>
        <p>{previewState === "running" ? `正在${previewModuleName}，选择一种外部事件` : previewState === "paused" ? "先返回或继续，再测试下一次事件" : "开始计时后可测试中断与恢复"}</p>
        <div className="nava-focus-event-actions">
          {([
            { reason: "call", label: "来电", icon: PhoneIncoming },
            { reason: "message", label: "消息通知", icon: Bell },
            { reason: "distraction", label: "主动分心", icon: MousePointerClick },
            { reason: "other", label: previewActivity.module === "focus" ? "其他事件" : "切到后台", icon: Ellipsis },
          ] as const).filter(({ reason }) => previewActivity.module === "focus" || reason !== "distraction").map(({ reason, label, icon: Icon }) => <button
            key={reason}
            type="button"
            data-preview-event={reason}
            onClick={() => simulatePreviewInterruption(reason)}
            disabled={previewState !== "running"}
            title={`模拟${label}`}
            aria-label={`模拟${label}`}
          ><Icon size={17} /><span>{label}</span></button>)}
        </div>
        <small className="nava-focus-event-disclaimer">仅测试当前页面的恢复流程，不会真实拨号、发通知或生成健康记录。</small>
      </aside>, document.body)}
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
