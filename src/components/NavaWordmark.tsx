interface NavaWordmarkProps {
  className?: string;
  tone?: "light" | "ink";
}

export default function NavaWordmark({ className = "", tone = "light" }: NavaWordmarkProps) {
  return (
    <div className={["nava-wordmark", `nava-wordmark--${tone}`, className].filter(Boolean).join(" ")} role="img" aria-label="NAVA">
      <span className="nava-wordmark__halo" aria-hidden="true" />
      <span className="nava-wordmark__face" aria-hidden="true">NAVA</span>
      <span className="nava-wordmark__sweep" aria-hidden="true">NAVA</span>
    </div>
  );
}
