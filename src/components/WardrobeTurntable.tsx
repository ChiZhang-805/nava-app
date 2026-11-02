import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { WardrobeAccessoryId, WardrobeSkinId } from "../services/mascotWardrobe";
import { normalizeWardrobeAccessories } from "../services/wardrobeAccessorySlots";
import { normalizeWardrobeAngle } from "../services/wardrobeTurntable";
import type { WardrobeScene } from "../services/wardrobeScene";
import type { WardrobeMascotMotion } from "../services/wardrobeMascotMotion";

export type WardrobeTurntableHandle = {
  setAngle: (degrees: number) => void;
  getAngle: () => number;
  setMotion: (motion: WardrobeMascotMotion | null, progress?: number) => void;
};
type Props = {
  skinId: WardrobeSkinId;
  accessoryIds: WardrobeAccessoryId[];
  prefetchIds?: WardrobeAccessoryId[];
  onLoadError?: () => void;
  onStatus: (status: "loading" | "ready" | "unavailable") => void;
};

const WardrobeTurntable = forwardRef<WardrobeTurntableHandle, Props>(function WardrobeTurntable({ skinId, accessoryIds, prefetchIds = [], onStatus, onLoadError }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WardrobeScene | null>(null);
  const angleRef = useRef(0);
  const lookRef = useRef({ skinId, accessoryIds });
  lookRef.current = { skinId, accessoryIds };
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const preloadKey = prefetchIds.join(" ");
  const preloadRef = useRef(prefetchIds);
  preloadRef.current = prefetchIds;
  const errorRef = useRef(onLoadError);
  errorRef.current = onLoadError;

  const syncModelStatus = () => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;
    const expected = normalizeWardrobeAccessories(lookRef.current.accessoryIds)[0] ?? "none";
    if (canvas.dataset.modelError === expected) {
      statusRef.current("unavailable");
      return;
    }
    if (canvas.dataset.wornModel !== expected || canvas.dataset.pendingModel === expected) {
      statusRef.current("loading");
      return;
    }
    statusRef.current(scene.render() ? "ready" : "unavailable");
  };

  useImperativeHandle(ref, () => ({
    setAngle(degrees) {
      angleRef.current = normalizeWardrobeAngle(degrees);
      sceneRef.current?.setAngle(angleRef.current);
      canvasRef.current?.setAttribute("data-angle", String(angleRef.current));
    },
    getAngle() { return angleRef.current; },
    setMotion(motion, progress = 0) { sceneRef.current?.setMotion(motion, progress); },
  }), []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const canvas = canvasRef.current!;
    statusRef.current("loading");
    const lost = (event: Event) => {
      event.preventDefault();
      sceneRef.current?.setMotion(null, 0);
      statusRef.current("unavailable");
    };
    const restored = () => {
      statusRef.current(sceneRef.current ? (sceneRef.current.render() ? "ready" : "unavailable") : "loading");
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    const modelState = new MutationObserver(syncModelStatus);
    const modelError = () => errorRef.current?.();
    canvas.addEventListener("wardrobe-model-error", modelError);
    modelState.observe(canvas, { attributes: true, attributeFilter: ["data-worn-model", "data-pending-model", "data-model-error"] });
    void import("../services/wardrobeScene").then(async ({ createWardrobeScene }) => {
      if (disposed) return;
      const scene = await createWardrobeScene(canvas, controller.signal);
      if (disposed) { scene.dispose(); return; }
      sceneRef.current = scene;
      scene.setLook(lookRef.current.skinId, lookRef.current.accessoryIds);
      scene.setAngle(angleRef.current);
      scene.prefetch(preloadRef.current);
      syncModelStatus();
    }).catch(() => { if (!disposed) statusRef.current("unavailable"); });
    return () => {
      disposed = true;
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      modelState.disconnect();
      canvas.removeEventListener("wardrobe-model-error", modelError);
      controller.abort();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const expected = normalizeWardrobeAccessories(accessoryIds)[0] ?? "none";
    if (canvasRef.current?.dataset.wornModel !== expected) statusRef.current("loading");
    scene.setLook(skinId, accessoryIds);
    syncModelStatus();
  }, [skinId, accessoryIds]);
  useEffect(() => { sceneRef.current?.prefetch(preloadRef.current); }, [preloadKey]);

  return <canvas className="mascot-wardrobe-turntable" ref={canvasRef} data-angle="0" data-skin={skinId} data-accessories={accessoryIds.join(" ")} aria-hidden="true" />;
});

export default WardrobeTurntable;
