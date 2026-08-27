import { useId, type CSSProperties } from "react";

export interface LineTrendPoint {
  id: string;
  label: string;
  value: number;
  lower?: number | null;
  upper?: number | null;
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const controlX = (previous.x + point.x) / 2;
    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

export default function LineTrendChart({
  points,
  ariaLabel,
  tone = "mood",
  compact = false,
}: {
  points: LineTrendPoint[];
  ariaLabel: string;
  tone?: "mood" | "rhythm";
  compact?: boolean;
}) {
  const rawId = useId();
  if (points.length === 0) return null;
  const gradientId = `trend-gradient-${rawId.replace(/:/g, "")}`;
  const areaGradientId = `trend-area-gradient-${rawId.replace(/:/g, "")}`;
  const width = 320;
  const height = compact ? 148 : 184;
  const left = 16;
  const right = 304;
  const top = compact ? 18 : 22;
  const bottom = compact ? 108 : 142;
  const dateY = compact ? 136 : 169;
  const spanX = right - left;
  const spanY = bottom - top;
  const scaleValues = points.flatMap((point) => [point.value, point.lower, point.upper]).filter((value): value is number => value != null);
  const rawMin = Math.min(...scaleValues);
  const rawMax = Math.max(...scaleValues);
  let domainMin = Math.max(0, Math.floor((rawMin - 5) / 10) * 10);
  let domainMax = Math.min(100, Math.ceil((rawMax + 5) / 10) * 10);
  while (domainMax - domainMin < 30) {
    if (domainMin > 0) domainMin = Math.max(0, domainMin - 10);
    if (domainMax - domainMin >= 30) break;
    if (domainMax < 100) domainMax = Math.min(100, domainMax + 10);
    else break;
  }
  if (domainMax <= domainMin) domainMax = Math.min(100, domainMin + 30);
  const domainSpan = Math.max(1, domainMax - domainMin);
  const xAt = (index: number) => left + (points.length <= 1 ? spanX / 2 : (index / (points.length - 1)) * spanX);
  const yAt = (value: number) => top + ((domainMax - Math.min(domainMax, Math.max(domainMin, clampScore(value)))) / domainSpan) * spanY;
  const plottedPoints = points.map((point, index) => ({ x: xAt(index), y: yAt(point.value) }));
  const linePath = smoothPath(plottedPoints);
  const lastPlottedPoint = plottedPoints[plottedPoints.length - 1];
  const areaPath = plottedPoints.length > 1
    ? `${linePath} L ${lastPlottedPoint.x} ${bottom} L ${plottedPoints[0].x} ${bottom} Z`
    : "";
  const hasBand = points.length > 1 && points.every((point) => point.lower != null && point.upper != null);
  const bandPoints = hasBand
    ? [
        ...points.map((point, index) => `${xAt(index)},${yAt(point.upper as number)}`),
        ...points.map((point, index) => `${xAt(points.length - index - 1)},${yAt(points[points.length - index - 1].lower as number)}`),
      ].join(" ")
    : "";

  return (
    <div className={["line-trend-chart", tone].join(" ")}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4ec4f2" />
            <stop offset="55%" stopColor="#147fb9" />
            <stop offset="100%" stopColor="#07527f" />
          </linearGradient>
          <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34afe0" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#34afe0" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => {
          const score = domainMin + domainSpan * ratio;
          return (
          <line className="trend-grid-line" x1={left} x2={right} y1={yAt(score)} y2={yAt(score)} key={score} />
          );
        })}

        {hasBand && <polygon className="trend-confidence-band" points={bandPoints} />}
        {areaPath && <path className="trend-area" d={areaPath} style={{ fill: `url(#${areaGradientId})` }} />}
        <path className="trend-line" d={linePath} style={{ stroke: `url(#${gradientId})` }} />

        {points.map((point, index) => {
          const x = xAt(index);
          const y = yAt(point.value);
          const showDate = points.length <= 4 || index % 2 === 0 || index === points.length - 1;
          return (
            <g
              className="trend-point"
              key={point.id}
              data-label={point.label}
              data-value={point.value}
              style={{ "--trend-point-index": index } as CSSProperties}
            >
              <circle cx={x} cy={y} r="4.5">
                <title>{`${point.label}: ${Math.round(point.value)}`}</title>
              </circle>
              <text className="trend-value" x={x} y={Math.max(12, y - 9)} textAnchor="middle">{Math.round(point.value)}</text>
              {showDate && <text className="trend-date" x={x} y={dateY} textAnchor="middle">{point.label}</text>}
            </g>
          );
        })}
      </svg>
      <ol className="sr-only">
        {points.map((point) => <li key={point.id}>{point.label}: {Math.round(point.value)}</li>)}
      </ol>
    </div>
  );
}
