import { useId, type CSSProperties } from "react";
import { chartCurvePath, type ChartCurveMode } from "../services/chartCurves";

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

export default function LineTrendChart({
  points,
  ariaLabel,
  tone = "mood",
  compact = false,
  scale = "score",
  verticalEmphasis = false,
  curve = "bump",
  showAllDates = false,
  rangeFloorRatio = 0,
  showArea = true,
  showConfidenceBand = true,
  valueFormatter = (value) => Math.round(value).toString(),
}: {
  points: LineTrendPoint[];
  ariaLabel: string;
  tone?: "mood" | "rhythm";
  compact?: boolean;
  scale?: "score" | "auto" | "range";
  verticalEmphasis?: boolean;
  curve?: ChartCurveMode;
  showAllDates?: boolean;
  rangeFloorRatio?: number;
  showArea?: boolean;
  showConfidenceBand?: boolean;
  valueFormatter?: (value: number) => string;
}) {
  const rawId = useId();
  if (points.length === 0) return null;
  const gradientId = `trend-gradient-${rawId.replace(/:/g, "")}`;
  const areaGradientId = `trend-area-gradient-${rawId.replace(/:/g, "")}`;
  // Compact dashboard cards are considerably wider than they are tall. Give
  // them a matching internal coordinate system so the browser does not center
  // a narrow 320px plot and leave large unused gutters on both sides.
  const width = compact ? 600 : 360;
  const height = compact ? (verticalEmphasis ? 320 : 148) : 184;
  const horizontalInset = compact ? 22 : 20;
  const left = horizontalInset;
  const right = width - horizontalInset;
  const top = compact ? (verticalEmphasis ? 24 : 18) : 22;
  const bottom = compact ? (verticalEmphasis ? 258 : 108) : 142;
  const dateY = compact ? (verticalEmphasis ? height - 5 : 136) : 169;
  const spanX = right - left;
  const spanY = bottom - top;
  const valueBottom = scale === "range"
    ? bottom - spanY * Math.min(0.6, Math.max(0, rangeFloorRatio))
    : bottom;
  const valueSpanY = valueBottom - top;
  const scaleValues = (scale === "range"
    ? points.map((point) => point.value)
    : points.flatMap((point) => [point.value, point.lower, point.upper]))
    .filter((value): value is number => value != null);
  const rawMin = Math.min(...scaleValues);
  const rawMax = Math.max(...scaleValues);
  let domainMin: number;
  let domainMax: number;
  if (scale === "range") {
    if (rawMax === rawMin) {
      const padding = Math.max(1, Math.abs(rawMax) * 0.05);
      domainMin = Math.max(0, rawMin - padding);
      domainMax = rawMax + padding;
    } else {
      domainMin = rawMin;
      domainMax = rawMax;
    }
  } else if (scale === "auto") {
    const rawRange = rawMax - rawMin;
    if (verticalEmphasis) {
      // Dashboard energy values typically sit close together. Preserve the
      // real ratios while using most of the available height, rather than
      // rounding the domain out to broad hundreds that visually flatten it.
      const fallbackRange = Math.max(1, Math.abs(rawMax) * 0.08);
      const effectiveRange = rawRange > 0 ? rawRange : fallbackRange;
      const padding = Math.max(1, effectiveRange * 0.08);
      domainMin = Math.max(0, rawMin - padding);
      domainMax = rawMax + padding;
      if (domainMax <= domainMin) domainMax = domainMin + effectiveRange;
    } else {
      const effectiveRange = Math.max(1, rawRange);
      const padding = Math.max(1, effectiveRange * 0.18);
      const magnitude = 10 ** Math.max(0, Math.floor(Math.log10((effectiveRange + padding * 2) / 4)));
      domainMin = Math.max(0, Math.floor((rawMin - padding) / magnitude) * magnitude);
      domainMax = Math.ceil((rawMax + padding) / magnitude) * magnitude;
      if (domainMax <= domainMin) domainMax = domainMin + magnitude;
    }
  } else {
    domainMin = Math.max(0, Math.floor((rawMin - 5) / 10) * 10);
    domainMax = Math.min(100, Math.ceil((rawMax + 5) / 10) * 10);
    while (domainMax - domainMin < 30) {
      if (domainMin > 0) domainMin = Math.max(0, domainMin - 10);
      if (domainMax - domainMin >= 30) break;
      if (domainMax < 100) domainMax = Math.min(100, domainMax + 10);
      else break;
    }
    if (domainMax <= domainMin) domainMax = Math.min(100, domainMin + 30);
  }
  const domainSpan = Math.max(1, domainMax - domainMin);
  const xAt = (index: number) => left + (points.length <= 1 ? spanX / 2 : (index / (points.length - 1)) * spanX);
  const yAt = (value: number) => {
    const scaledValue = scale === "score" ? clampScore(value) : value;
    return top + ((domainMax - Math.min(domainMax, Math.max(domainMin, scaledValue))) / domainSpan) * valueSpanY;
  };
  const plottedPoints = points.map((point, index) => ({ x: xAt(index), y: yAt(point.value) }));
  const linePath = chartCurvePath(plottedPoints, curve);
  const lastPlottedPoint = plottedPoints[plottedPoints.length - 1];
  const areaPath = showArea && plottedPoints.length > 1
    ? `${linePath} L ${lastPlottedPoint.x} ${bottom} L ${plottedPoints[0].x} ${bottom} Z`
    : "";
  const hasBand = showConfidenceBand && points.length > 1 && points.every((point) => point.lower != null && point.upper != null);
  const bandPoints = hasBand
    ? [
        ...points.map((point, index) => `${xAt(index)},${yAt(point.upper as number)}`),
        ...points.map((point, index) => `${xAt(points.length - index - 1)},${yAt(points[points.length - index - 1].lower as number)}`),
      ].join(" ")
    : "";
  const signature = points.map((point) => `${point.id}:${point.value}:${point.lower ?? ""}:${point.upper ?? ""}`).join("|");

  return (
    <div className={["line-trend-chart", tone, verticalEmphasis ? "is-vertically-emphasized" : ""].filter(Boolean).join(" ")}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={verticalEmphasis ? "xMidYMax meet" : undefined} role="img" aria-label={ariaLabel}>
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

        {[0.25, 0.5, 0.75].map((ratio, index) => {
          const score = domainMin + domainSpan * ratio;
          return (
          <line
            className="trend-grid-line"
            x1={left}
            x2={right}
            y1={yAt(score)}
            y2={yAt(score)}
            key={score}
            style={{ "--trend-grid-index": index } as CSSProperties}
          />
          );
        })}

        {hasBand && <polygon className="trend-confidence-band" points={bandPoints} />}
        {areaPath && <path className="trend-area" d={areaPath} style={{ fill: `url(#${areaGradientId})` }} />}
        <path key={`trend-${signature}`} className="trend-line" d={linePath} pathLength={1} style={{ stroke: `url(#${gradientId})` }} />

        {points.map((point, index) => {
          const x = xAt(index);
          const y = yAt(point.value);
          const showDate = showAllDates || points.length <= 4 || index % 2 === 0 || index === points.length - 1;
          return (
            <g
              className="trend-point"
              key={`${point.id}-${signature}`}
              data-label={point.label}
              data-value={point.value}
              style={{ "--trend-point-index": index } as CSSProperties}
            >
              <circle cx={x} cy={y} r="4.5">
                <title>{`${point.label}: ${valueFormatter(point.value)}`}</title>
              </circle>
              <text className="trend-value" x={x} y={Math.max(12, y - 9)} textAnchor="middle">{valueFormatter(point.value)}</text>
              {showDate && <text className="trend-date" x={x} y={dateY} textAnchor="middle">{point.label}</text>}
            </g>
          );
        })}
      </svg>
      <ol className="sr-only">
        {points.map((point) => <li key={point.id}>{point.label}: {valueFormatter(point.value)}</li>)}
      </ol>
    </div>
  );
}
