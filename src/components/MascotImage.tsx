import { useEffect, useState, type ImgHTMLAttributes } from "react";

type MascotImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  animatedSrc: string;
  staticSrc: string;
};

export default function MascotImage({ animatedSrc, staticSrc, onError, ...props }: MascotImageProps) {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false));
  const [animationFailed, setAnimationFailed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => setAnimationFailed(false), [animatedSrc]);

  const useStill = reducedMotion || animationFailed;
  return <img
    {...props}
    src={useStill ? staticSrc : animatedSrc}
    data-mascot-media={useStill ? "still" : "animated"}
    onError={(event) => {
      if (!useStill) setAnimationFailed(true);
      onError?.(event);
    }}
  />;
}
