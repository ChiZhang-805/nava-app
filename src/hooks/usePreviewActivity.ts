import { useEffect, useRef } from "react";
import { registerPreviewActivity, type PreviewModule, type PreviewReason, type PreviewState } from "../services/previewEnvironment";

export function usePreviewActivity(module: PreviewModule, state: PreviewState | null, onInterrupt: (reason: PreviewReason) => void) {
  const handler = useRef(onInterrupt);
  handler.current = onInterrupt;
  useEffect(() => {
    if (!state) return;
    return registerPreviewActivity({ module, state }, (reason) => handler.current(reason));
  }, [module, state]);
}
