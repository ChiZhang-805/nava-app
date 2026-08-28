import { useId, type CSSProperties } from "react";
import { chartBarMotion, chartSequenceEnd, clampChartPercent } from "../services/chartMotion";

export type BarLineTrendPoint = {
  id: string;
  label: string;
  barValue: number;
  lineValue: number;
  barText?: string;
  lineText?: string;
};

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

export default function BarLineTrendChart({
  points,
  ariaLabel,
}: {
  points: BarLineTrendPoint[];
  ariaLabel: string;
}) {
  const rawId = useId().replace(/:/g, "");
  if (points.length === 0) return null;

  const width = 320;
  const height = 116;
  const left = 18;
  const right = 302;
  const top = 13;
  const bottom = 86;
  const maxBarValue = Math.max(1, ...points.map((point) => point.barValue));
  const lineValues = points.map((point) => clampChartPercent(point.lineValue));
  const rawLineMin = Math.min(...lineValues);
  const rawLineMax = Math.max(...lineValues);
  const lineMin = Math.max(0, Math.floor((rawLineMin - 8) / 10) * 10);
  const lineMax = Math.min(100, Math.max(lineMin + 20, Math.ceil((rawLineMax + 8) / 10) * 10));
  const lineSpan = Math.max(1, lineMax - lineMin);
  const step = points.length <= 1 ? 0 : (right - left) / (points.length - 1);
  const xAt = (index: number) => points.length <= 1 ? width / 2 : left + step * index;
  const yAt = (value: number) => top + ((lineMax - Math.min(lineMax, Math.max(lineMin, value))) / lineSpan) * (bottom - top);
  const plotted = points.map((point, index) => ({ x: xAt(index), y: yAt(point.lineValue) }));
  const linePath = smoothPath(plotted);
  const barsEndAt = chartSequenceEnd(points.map((point) => ({ value: point.barValue })));
  const signature = points.map((point) => `${point.id}:${point.barValue}:${point.lineValue}`).join("|");
  const lineDelay = barsEndAt + 80;

  return (
    <div
      className="bar-line-trend-chart"
      role="img"
      aria-label={ariaLabel}
      data-chart-points={points.length}
      style={{ "--combo-line-delay": `${lineDelay}ms` } as CSSProperties}
    >
      <div className="bar-line-bars" aria-hidden="true">
        {points.map((point, index) => {
          const motion = chartBarMotion(index, point.barValue, maxBarValue);
          const heightPercent = Math.max(7, (point.barValue / maxBarValue) * 100);
          return (
            <span key={point.id} style={{ "--bar-index": index } as CSSProperties}>
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
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <linearGradient id={`bar-line-gradient-${rawId}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#75d5ee" />
            <stop offset="55%" stopColor="#167fa9" />
            <stop offset="100%" stopColor="#074f75" />
          </linearGradient>
        </defs>
        <path
          key={`line-${signature}`}
          className="bar-line-path"
          d={linePath}
          pathLength={1}
          style={{ stroke: `url(#bar-line-gradient-${rawId})` }}
        />
        {plotted.map((point, index) => (
          <g
            className="bar-line-point"
            key={`${points[index].id}-${signature}`}
            style={{ "--point-index": index } as CSSProperties}
          >
            <circle cx={point.x} cy={point.y} r="3.4">
              <title>{`${points[index].label} · ${points[index].lineText ?? Math.round(points[index].lineValue)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <ol className="sr-only">
        {points.map((point) => <li key={point.id}>{point.label}: {point.barText ?? point.barValue}; {point.lineText ?? point.lineValue}</li>)}
      </ol>
    </div>
  );
}
