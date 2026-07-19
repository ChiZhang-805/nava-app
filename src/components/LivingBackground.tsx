import { useEffect, useRef } from "react";
import { startBackgroundMotionIfAvailable } from "../services/backgroundMotion";
import { mountLivingBackground } from "./livingBackgroundRenderer";

export default function LivingBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset.motionStartupStatus = startBackgroundMotionIfAvailable();
    return mountLivingBackground(canvas);
  }, []);

  return (
    <div className="living-background" aria-hidden="true">
      <canvas className="living-background__canvas" ref={canvasRef} />
    </div>
  );
}
