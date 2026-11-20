import { getSvgPath } from "figma-squircle";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";

/** A decorative continuous-corner surface; the real HTML input keeps native editing. */
export default function ContinuousField({ children, className }: { children: ReactNode; className: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ width: 0, height: 0, path: "" });

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    let previous = "";
    const update = (width: number, height: number) => {
      const key = `${width}:${height}`;
      if (width <= 2 || height <= 2 || key === previous) return;
      previous = key;
      setGeometry({ width, height, path: getSvgPath({
        // Reserve a visible vertical side even in the compact keyboard layout.
        width: width - 2, height: height - 2, cornerRadius: Math.min(14, (height - 2) * 0.22),
        cornerSmoothing: 0.6, preserveSmoothing: true,
      }) });
    };
    update(element.offsetWidth, element.offsetHeight);
    // Border-box dimensions exclude the screen's entrance animation transform.
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize[0];
      update(box.inlineSize, box.blockSize);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={host} className={`${className} continuous-field`} data-continuous-ready={Boolean(geometry.path)}>
    {children}
    {geometry.path && <svg className="continuous-field-surface" aria-hidden="true" focusable="false"
      width={geometry.width} height={geometry.height} viewBox={`0 0 ${geometry.width} ${geometry.height}`}>
      <path transform="translate(1 1)" d={geometry.path} />
    </svg>}
  </div>;
}
