interface NavaWordmarkProps {
  className?: string;
  tone?: "light" | "ink";
}

const letters = ["N", "A", "V", "A"];

export default function NavaWordmark({ className = "", tone = "light" }: NavaWordmarkProps) {
  return (
    <div className={["nava-wordmark", `nava-wordmark--${tone}`, className].filter(Boolean).join(" ")} role="img" aria-label="NAVA">
      <span className="nava-wordmark__halo" aria-hidden="true" />
      <span className="nava-wordmark__letters" aria-hidden="true">
        {letters.map((letter, index) => (
          <span className="nava-wordmark__letter" key={`${letter}-${index}`}>
            {letter}
          </span>
        ))}
      </span>
      <span className="nava-wordmark__reflection" aria-hidden="true" />
    </div>
  );
}
