import type { PointsCardSkin } from "../services/rewardCards";

/** One shared isometric plane keeps the card, screen, keys and casing aligned. */
export default function ShopPaymentTerminal({ card, approved }: { card: PointsCardSkin; approved: boolean }) {
  return <svg className="shop-payment-terminal" viewBox="0 0 360 270" role="presentation" aria-hidden="true">
    <defs>
      <linearGradient id="terminal-case" x2=".8" y2="1"><stop stopColor="#ffffff" /><stop offset=".55" stopColor="#e3eeeb" /><stop offset="1" stopColor="#bacdca" /></linearGradient>
      <linearGradient id="terminal-face" x2=".3" y2="1"><stop stopColor="#31565c" /><stop offset="1" stopColor="#163b43" /></linearGradient>
      <linearGradient id="terminal-paper" x2="0" y2="1"><stop stopColor="#fffefb" /><stop offset=".7" stopColor="#f4f4ee" /><stop offset="1" stopColor="#d0dcd7" /></linearGradient>
      <linearGradient id="terminal-card-shade" x2="0" y2="1"><stop stopColor="#143e45" stopOpacity=".1" /><stop offset="1" stopColor="#102e37" stopOpacity=".74" /></linearGradient>
      <filter id="terminal-soft-shadow" x="-30%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="10" stdDeviation="7" floodColor="#234b50" floodOpacity=".16" /></filter>
      <clipPath id="terminal-card-clip"><rect width="128" height="80" rx="7" /></clipPath>
    </defs>
    <g filter="url(#terminal-soft-shadow)">
      {/* The roll curls above the back edge; its dark end is behind the paper. */}
      <ellipse cx="313" cy="115" rx="14" ry="23" fill="#21454b" transform="rotate(25 313 115)" />
      <path d="M210 91 228 48Q235 34 251 40L324 72Q311 69 305 83L289 121Z" fill="url(#terminal-paper)" />
      <path d="m226 74 57 25m-61-16 47 20m-44-29 40 17" fill="none" stroke="#b9c8c4" strokeWidth="2" strokeLinecap="round" />
      {/* Rounded white lower shell, dark inset side strip, then the top face. */}
      <g transform="translate(0 15)"><g transform="matrix(.9 .38 -.70 .43 211 91)"><rect width="124" height="224" rx="25" fill="url(#terminal-case)" stroke="#c6d6d2" strokeWidth="1.5" /></g></g>
      <path d="M311 139 176 222Q171 225 169 232L174 235 310 157Q318 151 317 143Z" fill="#1b4249" />
      <g transform="matrix(.9 .38 -.70 .43 211 85)">
        <rect width="124" height="224" rx="24" fill="url(#terminal-face)" stroke="#22434a" strokeWidth="2" />
        <path d="M17 10H107" stroke="#71938f" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round" />
        <rect x="9" y="21" width="106" height="83" rx="7" fill="#102e35" />
        <rect x="15" y="27" width="94" height="71" rx="3" fill="#f7fcf7" />
        <g className="shop-terminal-screen-mark">
          {!approved && [43, 61, 79].map((x) => <circle key={x} cx={x} cy="63" r="4" fill="#379c8e" />)}
          {approved && <path className="shop-terminal-check" d="m36 63 17 18 37-40" pathLength="1" fill="none" stroke="#31af86" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />}
        </g>
        {Array.from({ length: 12 }, (_, i) => {
          const x = 15 + (i % 3) * 33;
          const y = 118 + Math.floor(i / 3) * 23;
          return <g key={i}>
            <rect x={x} y={y + 3} width="26" height="14" rx="5" fill={i === 11 ? "#24816b" : "#9fb4b2"} />
            <rect x={x} y={y} width="26" height="14" rx="5" fill={i === 11 ? "#55c69e" : "#eef3ec"} />
          </g>;
        })}
        <path d="M28 213H96" stroke="#60847f" strokeWidth="2" strokeLinecap="round" />
      </g>
    </g>
    {/* Separate motion group: approach from above, settle over the reader, stay. */}
    <g className="shop-terminal-card-motion">
      <g className="shop-points-card" transform="matrix(.9 .38 -.70 .43 129 46)">
        <rect y="3" width="128" height="80" rx="7" fill="#426960" />
        <g clipPath="url(#terminal-card-clip)">
          <image href={card.art} width="128" height="80" preserveAspectRatio="xMidYMid slice" />
          <rect width="128" height="80" fill="url(#terminal-card-shade)" />
          <path d="M-20 0 75 0 10 80H-20" fill="#fff" fillOpacity=".12" />
        </g>
        <rect x=".5" y=".5" width="127" height="79" rx="7" fill="none" stroke="#e5e9d9" />
        <text x="10" y="16" fontSize="7" fontWeight="800" fill="white" letterSpacing="1">NAVA POINTS</text>
        <rect x="10" y="28" width="17" height="13" rx="3" fill="#ecd288" />
        <path d="M16 28V41m6-13v13M10 34h17" stroke="#b1934e" strokeWidth=".6" />
        <text x="10" y="68" fontSize="8" fontWeight="700" fill="white">•• {card.lastFour}</text>
        <path d="M108 19q8 6 0 12m-4-10q6 4 0 8m-4-6q3 2 0 4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
    </g>
  </svg>;
}
