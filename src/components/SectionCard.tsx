import type { ReactNode } from "react";

export default function SectionCard({
  title,
  subtitle,
  children,
  action,
  className,
  bodyClassName,
  footer,
}: {
  title?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
}) {
  return (
    <section className={["section-card", className].filter(Boolean).join(" ")}>
      {(title != null || subtitle != null || action != null) && (
        <div className="section-heading">
          <div>
            {title != null && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
      {footer}
    </section>
  );
}
