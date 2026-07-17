export default function StatusPill({ children, tone = "neutral" }: { children: string; tone?: "good" | "warn" | "neutral" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

