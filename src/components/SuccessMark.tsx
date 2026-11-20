import { useId } from "react";
import "./success-mark.css";

type SuccessMarkProps = {
  size?: number;
  animated?: boolean;
  className?: string;
  /** Omit when an adjacent success heading already describes the result. */
  label?: string;
};

/** A single, brief success gesture. It never delays the next action. */
export default function SuccessMark({ size = 64, animated = true, className = "", label }: SuccessMarkProps) {
  const fillId = `success-fill-${useId().replace(/:/g, "")}`;
  return <svg className={`nava-success-mark ${className}`.trim()} width={size} height={size} viewBox="0 0 80 80" fill="none"
    data-animated={animated} aria-hidden={label ? undefined : true} role={label ? "img" : undefined} aria-label={label} focusable="false">
    <defs><linearGradient id={fillId} x1="20" y1="14" x2="59" y2="66" gradientUnits="userSpaceOnUse"><stop stopColor="#e5f8ef" /><stop offset="1" stopColor="#bce8d8" /></linearGradient></defs>
    <circle className="nava-success-mark-halo" cx="40" cy="40" r="33" fill="#e2f5ed" />
    <circle className="nava-success-mark-disc" cx="40" cy="40" r="27" fill={`url(#${fillId})`} />
    <g className="nava-success-mark-check-group"><path className="nava-success-mark-check" d="m26 40 9 9 20-21" pathLength="1" stroke="#16816b" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" /></g>
    <g className="nava-success-mark-sparks" fill="#57b89c" stroke="#57b89c" strokeWidth="2.5" strokeLinecap="round">
      <path d="m15 15-3-3m52 4 3-3" /><circle cx="71" cy="44" r="1.7" stroke="none" /><circle cx="15" cy="64" r="1.5" stroke="none" />
    </g>
  </svg>;
}
