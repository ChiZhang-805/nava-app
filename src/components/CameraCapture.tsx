import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, RotateCcw, X } from "lucide-react";
import { usePreviewActivity } from "../hooks/usePreviewActivity";
import "../styles/camera-capture.css";

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>> };
type DetectorWindow = Window & { FaceDetector?: new (options: { fastMode: boolean; maxDetectedFaces: number }) => Detector };

/** Live frames stay on this device; only an explicitly confirmed still is returned. */
export default function CameraCapture({ locale, facing, onCapture, onClose, onFallback }: {
  locale: "zh" | "en"; facing: "user" | "environment";
  onCapture: (file: File) => void; onClose: () => void; onFallback: () => void;
}) {
  const zh = locale === "zh";
  const [phase, setPhase] = useState<"starting" | "live" | "paused" | "review" | "error">("starting");
  const [notice, setNotice] = useState("");
  const [guidance, setGuidance] = useState("");
  const [still, setStill] = useState<{ file: File; url: string } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const capturing = useRef(false);
  const closeAction = useRef(onClose);
  closeAction.current = onClose;
  const host = document.querySelector(".phone-frame") ?? document.body;
  const stop = useCallback(() => {
    generation.current++;
    const owned = stream.current; stream.current = null;
    owned?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    if (video.current) video.current.srcObject = null;
  }, []);
  const interrupt = useCallback((simulated = false) => {
    stop();
    setPhase((current) => current === "review" ? current : "paused");
    setNotice(zh ? `${simulated ? "模拟中断：" : ""}拍摄已暂停，可重新开启。` : `${simulated ? "Simulated interruption: " : ""}Camera paused. Restart when ready.`);
  }, [stop, zh]);
  usePreviewActivity("camera", phase === "starting" || phase === "live" ? "running" : "paused", () => interrupt(true));
  const start = useCallback(async () => {
    stop();
    if (document.hidden) { setPhase("paused"); return; }
    const request = generation.current;
    setPhase("starting"); setNotice(""); setGuidance(""); setStill(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } } });
      if (!mounted.current || request !== generation.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      media.getVideoTracks().forEach((track) => { track.onended = () => interrupt(); });
      if (!video.current) { stop(); return; }
      video.current.srcObject = media;
      await video.current.play();
      if (request === generation.current && mounted.current) setPhase("live");
    } catch {
      if (request !== generation.current || !mounted.current) return;
      stop(); setPhase("error");
      setNotice(zh ? "无法开启相机，请检查权限或选择照片。" : "Allow camera access or choose a photo from your library.");
    }
  }, [facing, interrupt, stop, zh]);
  useEffect(() => {
    mounted.current = true;
    void start();
    const hide = () => { if (document.hidden) interrupt(); };
    const leave = () => interrupt();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => { mounted.current = false; stop(); document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave); };
  }, [interrupt, start, stop]);
  useEffect(() => () => { if (still) URL.revokeObjectURL(still.url); }, [still]);
  useEffect(() => {
    const previous = document.activeElement;
    const siblings = [...host.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== root.current);
    const inert = siblings.map((node) => node.inert); siblings.forEach((node) => { node.inert = true; });
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeAction.current(); }
      if (event.key !== "Tab") return;
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === buttons.length - 1))) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0]?.focus(); }
    };
    document.addEventListener("keydown", key, true);
    return () => { siblings.forEach((node, index) => { node.inert = inert[index]; }); document.removeEventListener("keydown", key, true); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [host]);
  useEffect(() => {
    if (phase !== "live" || facing !== "user") return;
    let alive = true, busy = false;
    const NativeDetector = (window as DetectorWindow).FaceDetector;
    if (!NativeDetector) { setGuidance(zh ? "请手动对齐面部" : "Align your face manually"); return; }
    let detector: Detector;
    try { detector = new NativeDetector({ fastMode: true, maxDetectedFaces: 2 }); }
    catch { setGuidance(zh ? "请手动对齐面部" : "Align your face manually"); return; }
    const timer = window.setInterval(() => {
      if (busy || !video.current || video.current.readyState < 2) return;
      busy = true;
      const source = video.current;
      void Promise.resolve().then(() => detector.detect(source)).then((faces) => {
        if (!alive) return;
        const box = faces[0]?.boundingBox;
        const centered = box && Math.abs((box.x + box.width / 2) / source.videoWidth - .5) < .18 && Math.abs((box.y + box.height / 2) / source.videoHeight - .5) < .2;
        setGuidance(faces.length !== 1 ? (zh ? "请保持单人入镜" : "Keep one face in view") : centered ? (zh ? "面部已居中，可以拍摄" : "Face centered. Ready to capture") : (zh ? "请将面部移向画面中间" : "Move your face toward the center"));
      }).catch(() => { window.clearInterval(timer); if (alive) setGuidance(zh ? "请手动对齐面部" : "Align your face manually"); }).finally(() => { busy = false; });
    }, 800);
    return () => { alive = false; window.clearInterval(timer); };
  }, [facing, phase, zh]);
  const capture = async () => {
    const source = video.current;
    if (!source?.videoWidth || phase !== "live" || capturing.current) return;
    capturing.current = true;
    const request = generation.current;
    try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(source.videoWidth, source.videoHeight));
    canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", .9));
    if (!mounted.current || request !== generation.current) return;
    if (!blob) throw new Error("capture unavailable");
    stop(); setNotice(""); setStill({ file: new File([blob], `nava-${facing === "user" ? "face" : "meal"}.jpg`, { type: "image/jpeg" }), url: URL.createObjectURL(blob) }); setPhase("review");
    } catch { if (mounted.current && request === generation.current) setNotice(zh ? "拍摄失败，请重试。" : "Capture failed. Please retry."); }
    finally { capturing.current = false; }
  };
  return createPortal(<div className="camera-capture-overlay" ref={root} role="dialog" aria-modal="true" aria-label={zh ? "相机取景" : "Camera preview"} data-camera-phase={phase}>
    <section className="camera-capture-sheet"><header><h2>{zh ? (facing === "user" ? "面部取景" : "餐食取景") : "Camera"}</h2><button className="camera-close" type="button" onClick={onClose} aria-label={zh ? "关闭相机" : "Close camera"}><X size={18} /></button></header>
      <div className="camera-capture-body"><div className={`camera-viewfinder ${facing === "user" ? "is-front" : ""}`} hidden={phase !== "live" && !still}><video ref={video} autoPlay muted playsInline hidden={phase !== "live"} />{still && <img src={still.url} alt={zh ? "待确认照片" : "Photo to confirm"} />}{phase === "live" && facing === "user" && <i className="camera-face-guide" aria-hidden="true" />}</div>
        {!still && phase !== "live" && <Camera className="camera-status-icon" size={28} aria-hidden="true" />}
        {phase === "starting" && <p role="status">{zh ? "正在开启摄像头…" : "Opening camera…"}</p>}{notice && !still && <p role="status">{notice}</p>}{phase === "live" && !notice && guidance && <p role="status">{guidance}</p>}
      </div><footer>{phase === "live" ? <button type="button" onClick={() => void capture()}><Camera size={20} />{zh ? "拍摄" : "Capture"}</button> : phase === "review" && still ? <><button type="button" onClick={() => void start()}><RotateCcw size={18} />{zh ? "重拍" : "Retake"}</button><button type="button" onClick={() => { stop(); onCapture(still.file); }}>{zh ? "使用照片" : "Use photo"}</button></> : <><button type="button" disabled={phase === "starting"} onClick={() => void start()}>{zh ? "重新开启" : "Restart"}</button><button type="button" onClick={() => { stop(); onFallback(); }}>{zh ? "系统相机 / 相册" : "System camera / library"}</button></>}</footer>
    </section></div>, host);
}
