import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

export default function AnimatedNumber({
  value,
  duration = 920,
  delay = 120,
  formatter = Math.round,
  className,
}: {
  value: number;
  duration?: number;
  delay?: number;
  formatter?: (value: number) => string | number;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;
    const startValue = previousValue.current === target ? 0 : previousValue.current;
    previousValue.current = target;

    if (prefersReducedMotion() || duration <= 0) {
      setDisplayValue(target);
      return;
    }

    let frame = 0;
    let startedAt = 0;
    const delayTimer = window.setTimeout(() => {
      const tick = (time: number) => {
        if (!startedAt) startedAt = time;
        const progress = Math.min(1, (time - startedAt) / duration);
        setDisplayValue(startValue + (target - startValue) * easeOutCubic(progress));
        if (progress < 1) frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(delayTimer);
      window.cancelAnimationFrame(frame);
    };
  }, [delay, duration, value]);

  return <span className={className} data-animated-number={value}>{formatter(displayValue)}</span>;
}
