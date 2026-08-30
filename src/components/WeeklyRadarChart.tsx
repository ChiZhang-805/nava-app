import { useId } from "react";
import type { WeeklyModuleKey } from "../services/weeklyModuleScores";

export type WeeklyRadarPoint = {
  key: WeeklyModuleKey;
  label: string;
  value: number;
  recordedDays: number;
};

const width = 420;
const height = 270;
const centerX = width / 2;
const centerY = 136;
const radius = 95;

function polarPoint(index: number, scale: number) {
  const angle = -Math.PI / 2 + index * (Math.PI * 2 / 6);
  return {
    x: centerX + Math.cos(angle) * radius * scale,
    y: centerY + Math.sin(angle) * radius * scale,
    angle,
  };
}

function polygonPoints(scale: number) {
  return Array.from({ length: 6 }, (_, index) => {
    const point = polarPoint(index, scale);
    return `${point.x},${point.y}`;
  }).join(" ");
}

export default function WeeklyRadarChart({ points, ariaLabel }: { points: WeeklyRadarPoint[]; ariaLabel: string }) {
  const rawId = useId();
  const gradientId = `weekly-radar-${rawId.replace(/:/g, "")}`;
  const dataPoints = points.map((point, index) => {
    const position = polarPoint(index, Math.min(100, Math.max(0, point.value)) / 100);
    return `${position.x},${position.y}`;
  }).join(" ");

  return (
    <div className="weekly-radar-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <title>{ariaLabel}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38b9e7" stopOpacity="0.46" />
            <stop offset="100%" stopColor="#1378b0" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((level) => <polygon className="weekly-radar-grid" points={polygonPoints(level)} key={level} />)}
        {Array.from({ length: 6 }, (_, index) => {
          const end = polarPoint(index, 1);
          return <line className="weekly-radar-axis" x1={centerX} y1={centerY} x2={end.x} y2={end.y} key={index} />;
        })}
        <polygon className="weekly-radar-area" points={dataPoints} style={{ fill: `url(#${gradientId})` }} />
        {points.map((point, index) => {
          const data = polarPoint(index, Math.min(100, Math.max(0, point.value)) / 100);
          const label = polarPoint(index, 1.18);
          const cosine = Math.cos(label.angle);
          const anchor = cosine > 0.35 ? "start" : cosine < -0.35 ? "end" : "middle";
          const yOffset = Math.sin(label.angle) > 0.55 ? -2 : Math.sin(label.angle) < -0.55 ? 7 : 4;
          return <g key={point.key} data-recorded-days={point.recordedDays}>
            <title>{`${point.label}: ${point.value}; ${point.recordedDays} recorded days`}</title>
            <circle className="weekly-radar-point" cx={data.x} cy={data.y} r="4.5" />
            <text className="weekly-radar-caption" x={label.x} y={label.y + yOffset} textAnchor={anchor}>
              <tspan>{point.label}</tspan><tspan className="weekly-radar-score" dx="5">{point.value}</tspan>
            </text>
          </g>;
        })}
      </svg>
      <ol className="sr-only">
        {points.map((point) => <li key={point.key}>{point.label}: {point.value}; {point.recordedDays} recorded days</li>)}
      </ol>
    </div>
  );
}
