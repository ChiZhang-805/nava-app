import { useId } from "react";

interface NavaWordmarkProps {
  className?: string;
  tone?: "light" | "ink";
}

// Abril-inspired contours, redrawn to reduce stroke contrast for the NAVA mark.
const glyphs = [
  {
    d: "M590 674V0H468L122 642V26H164V0H25V26H80V674H25V700H286L547 198V674H506V700H645V674Z",
    x: 0,
  },
  {
    d: "M445 26 374 232H173L96 26H164V0H6V26H53L308 706H390L632 26H688V0H370V26ZM276 519 182 264H366Z",
    x: 675,
  },
  {
    d: "M416 190 590 674H524V700H679V674H632L386 -10H312L66 674H6V700H333V674H248Z",
    x: 1260,
  },
  {
    d: "M445 26 374 232H173L96 26H164V0H6V26H53L308 706H390L632 26H688V0H370V26ZM276 519 182 264H366Z",
    x: 1830,
  },
] as const;

function GlyphPaths() {
  return glyphs.map((glyph, index) => <path d={glyph.d} key={`${glyph.x}-${index}`} transform={`translate(${glyph.x} 0)`} />);
}

export default function NavaWordmark({ className = "", tone = "light" }: NavaWordmarkProps) {
  const id = useId().replace(/:/g, "");
  const clipId = `nava-wordmark-clip-${id}`;
  const faceId = `nava-wordmark-face-${id}`;
  const sweepId = `nava-wordmark-sweep-${id}`;

  return (
    <div className={["nava-wordmark", `nava-wordmark--${tone}`, className].filter(Boolean).join(" ")} role="img" aria-label="NAVA">
      <span className="nava-wordmark__halo" aria-hidden="true" />
      <svg
        className="nava-wordmark__vector"
        viewBox="0 0 2530 720"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={faceId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#010203" />
            <stop offset="0.34" stopColor="#030506" stopOpacity="0.99" />
            <stop offset="0.68" stopColor="#111517" stopOpacity="0.93" />
            <stop offset="1" stopColor="#32393c" stopOpacity="0.76" />
          </linearGradient>
          <linearGradient id={sweepId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#8096a0" stopOpacity="0" />
            <stop offset="0.32" stopColor="#8096a0" stopOpacity="0.04" />
            <stop offset="0.48" stopColor="#e6eff3" stopOpacity="0.78" />
            <stop offset="0.62" stopColor="#859eaa" stopOpacity="0.52" />
            <stop offset="0.78" stopColor="#d2dee4" stopOpacity="0.12" />
            <stop offset="1" stopColor="#d2dee4" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <g transform="translate(0 710) scale(1 -1)">
              <GlyphPaths />
            </g>
          </clipPath>
        </defs>
        <g className="nava-wordmark__vector-face" fill={`url(#${faceId})`} transform="translate(0 710) scale(1 -1)">
          <GlyphPaths />
        </g>
        <g clipPath={`url(#${clipId})`}>
          <rect className="nava-wordmark__sweep-band" x="-650" y="-40" width="650" height="800" fill={`url(#${sweepId})`} />
        </g>
      </svg>
    </div>
  );
}
