import { useId, type CSSProperties } from "react";
import { chartBarMotion, chartSequenceEnd, clampChartPercent } from "../services/chartMotion";
import { chartCurvePath, type ChartCurveMode } from "../services/chartCurves";

export type BarLineTrendPoint = {
  id: string;
  label: string;
  barValue: number;
  lineValue: number;
  barText?: string;
  lineText?: string;
};

export default function BarLineTrendChart({
  points,
  ariaLabel,
  scoreScale = false,
  interactive = false,
  lineAnchor = "bar-center",
  curve = "bump",
}: {
  points: BarLineTrendPoint[];
  ariaLabel: string;
  scoreScale?: boolean;
  interactive?: boolean;
  lineAnchor?: "value" | "bar-center";
  curve?: ChartCurveMode;
}) {
  const rawId = useId().replace(/:/g, "");
  if (points.length === 0) return null;

  const width = 320;
  const height = 116;
  const left = 28;
  // Keep the final label clear of compact-card clipping and the adjacent donut.
  const right = 280;
  const top = scoreScale ? 9 : 13;
  const bottom = scoreScale ? 96 : 86;
  const rawBarMin = Math.min(...points.map((point) => point.barValue));
  const rawBarMax = Math.max(...points.map((point) => point.barValue));
  const rawBarSpan = Math.max(1, rawBarMax - rawBarMin);
  const maxBarValue = Math.max(1, rawBarMax);
  const heightPercentAt = (value: number) => {
    if (rawBarMax === rawBarMin) return 67;
    return 34 + ((value - rawBarMin) / rawBarSpan) * 66;
  };
  const lineValues = points.map((point) => clampChartPercent(point.lineValue));
  const rawLineMin = Math.min(...lineValues);
  const rawLineMax = Math.max(...lineValues);
  const lineMin = scoreScale ? 0 : Math.max(0, Math.floor((rawLineMin - 8) / 10) * 10);
  const lineMax = scoreScale ? 100 : Math.min(100, Math.max(lineMin + 20, Math.ceil((rawLineMax + 8) / 10) * 10));
  const lineSpan = Math.max(1, lineMax - lineMin);
  const step = points.length <= 1 ? 0 : (right - left) / (points.length - 1);
  const xAt = (index: number) => points.length <= 1 ? width / 2 : left + step * index;
  const yAt = (value: number) => top + ((lineMax - Math.min(lineMax, Math.max(lineMin, value))) / lineSpan) * (bottom - top);
  const plotted = points.map((point, index) => {
    const barPercent = heightPercentAt(point.barValue);
    const barTop = bottom - (barPercent / 100) * (bottom - top);
    return {
      x: xAt(index),
      y: lineAnchor === "bar-center" ? (barTop + bottom) / 2 : yAt(point.lineValue),
    };
  });
  const linePath = chartCurvePath(plotted, curve);
  const barsEndAt = chartSequenceEnd(points.map((point) => ({ value: point.barValue })));
  const signature = points.map((point) => `${point.id}:${point.barValue}:${point.lineValue}`).join("|");
  const lineDelay = barsEndAt + 80;

  return (
    <div
      className={["bar-line-trend-chart", scoreScale ? "is-score-scale" : "", interactive ? "is-interactive" : ""].filter(Boolean).join(" ")}
      role="img"
      aria-label={ariaLabel}
      data-chart-points={points.length}
      style={{ "--combo-line-delay": `${lineDelay}ms` } as CSSProperties}
    >
      <div className="bar-line-bars" aria-hidden="true">
        {points.map((point, index) => {
          const motion = chartBarMotion(index, point.barValue, maxBarValue);
          const heightPercent = heightPercentAt(point.barValue);
          return (
            <span key={point.id} style={{ "--bar-index": index, "--bar-left": `${(xAt(index) / width) * 100}%` } as CSSProperties}>
              <i
                title={`${point.label} · ${point.barText ?? Math.round(point.barValue)}`}
                style={{
                  height: `${heightPercent}%`,
                  "--bar-delay": `${motion.delayMs}ms`,
                  "--bar-duration": `${motion.durationMs}ms`,
                } as CSSProperties}
              />
              <small>{point.label}</small>
            </span>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`bar-line-gradient-${rawId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#75d5ee" />
            <stop offset="55%" stopColor="#167fa9" />
            <stop offset="100%" stopColor="#074f75" />
          </linearGradient>
        </defs>
        <path
          key={`line-${interactive ? "interactive" : signature}`}
          className="bar-line-path"
          d={linePath}
          pathLength={1}
          vectorEffect="non-scaling-stroke"
          style={{ stroke: `url(#bar-line-gradient-${rawId})` }}
        />
      </svg>
      {plotted.map((point, index) => (
        <span
          className="bar-line-html-point"
          key={`${points[index].id}-${interactive ? "interactive" : signature}`}
          title={`${points[index].label} · ${points[index].lineText ?? Math.round(points[index].lineValue)}`}
          style={{
            "--point-index": index,
            "--point-left": `${(point.x / width) * 100}%`,
            "--point-top": `${(point.y / height) * 100}%`,
          } as CSSProperties}
        />
      ))}
      <ol className="sr-only">
        {points.map((point) => <li key={point.id}>{point.label}: {point.barText ?? point.barValue}; {point.lineText ?? point.lineValue}</li>)}
      </ol>
    </div>
  );
}
