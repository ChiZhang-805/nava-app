import { useEffect, useRef } from "react";
import { mountLivingBackground } from "./livingBackgroundRenderer";

export default function LivingBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountLivingBackground(canvas);
  }, []);

  return (
    <div className="living-background" aria-hidden="true">
      <canvas className="living-background__canvas" ref={canvasRef} />
    </div>
  );
}
