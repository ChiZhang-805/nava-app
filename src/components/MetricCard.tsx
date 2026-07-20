import type { ReactNode } from "react";

export default function MetricCard({
  label,
  value,
  detail,
  icon,
  className,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <article className={["metric-card", className].filter(Boolean).join(" ")}>
      <div className="metric-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}
