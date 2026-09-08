import type { CSSProperties } from "react";

const ringRadius = 21.5;
const ringCircumference = 2 * Math.PI * ringRadius;

export default function ModuleProgressRing({
  progress,
  loading = false,
}: {
  progress: number;
  loading?: boolean;
}) {
  const normalizedProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const offset = ringCircumference * (1 - normalizedProgress);

  return (
    <svg
      className={["module-progress-ring", loading ? "is-loading" : "", normalizedProgress >= 1 ? "is-complete" : ""].filter(Boolean).join(" ")}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      data-progress={loading ? undefined : String(normalizedProgress)}
      style={{
        "--module-progress-circumference": ringCircumference,
        "--module-progress-offset": offset,
      } as CSSProperties}
    >
      <circle className="module-progress-ring__track" cx="24" cy="24" r={ringRadius} />
      <circle className="module-progress-ring__value" cx="24" cy="24" r={ringRadius} />
    </svg>
  );
}
