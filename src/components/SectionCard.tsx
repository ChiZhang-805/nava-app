import type { ReactNode } from "react";

export default function SectionCard({
  title,
  subtitle,
  children,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={["section-card", className].filter(Boolean).join(" ")}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
