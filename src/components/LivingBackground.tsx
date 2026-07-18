export default function LivingBackground() {
  return (
    <div className="living-background" aria-hidden="true">
      <div className="living-background__base" />
      <div className="living-background__volume living-background__volume--ice" />
      <div className="living-background__volume living-background__volume--sky" />
      <div className="living-background__volume living-background__volume--cyan" />
      <div className="living-background__volume living-background__volume--deep" />
      <div className="living-background__volume living-background__volume--pearl" />

      <svg className="living-background__ribbons" viewBox="0 0 430 932" preserveAspectRatio="none">
        <defs>
          <linearGradient id="navaRibbonIce" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#effcff" stopOpacity="0" />
            <stop offset="0.42" stopColor="#e5f8ff" stopOpacity="0.44" />
            <stop offset="0.72" stopColor="#73c7ee" stopOpacity="0.18" />
            <stop offset="1" stopColor="#effcff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="navaRibbonBlue" x1="1" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#164f89" stopOpacity="0" />
            <stop offset="0.46" stopColor="#0d5a9b" stopOpacity="0.38" />
            <stop offset="1" stopColor="#8edcff" stopOpacity="0" />
          </linearGradient>
          <filter id="navaRibbonSoft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
        <g className="living-background__ribbon living-background__ribbon--ice" filter="url(#navaRibbonSoft)">
          <path d="M-180 214 C-34 42 154 378 304 188 C426 34 528 116 616 286" stroke="url(#navaRibbonIce)" strokeWidth="82" fill="none" />
          <path d="M-132 698 C24 518 162 842 330 642 C446 504 522 594 604 744" stroke="url(#navaRibbonIce)" strokeWidth="62" fill="none" />
        </g>
        <g className="living-background__ribbon living-background__ribbon--blue" filter="url(#navaRibbonSoft)">
          <path d="M-154 448 C-22 310 140 592 286 420 C408 276 528 378 602 520" stroke="url(#navaRibbonBlue)" strokeWidth="94" fill="none" />
        </g>
      </svg>

      <div className="living-background__glass" />

      <svg className="living-background__grain" viewBox="0 0 430 932" preserveAspectRatio="none">
        <filter id="navaFineGrain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" seed="19" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.34" />
          </feComponentTransfer>
        </filter>
        <filter id="navaCoarseFrost" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.065" numOctaves="3" seed="7" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.22" />
          </feComponentTransfer>
        </filter>
        <filter id="navaMediumFrost" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.16 0.22" numOctaves="3" seed="31" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.26" />
          </feComponentTransfer>
        </filter>
        <rect width="430" height="932" filter="url(#navaCoarseFrost)" className="living-background__coarse-frost" />
        <rect width="430" height="932" filter="url(#navaMediumFrost)" className="living-background__medium-frost" />
        <rect width="430" height="932" filter="url(#navaFineGrain)" className="living-background__fine-grain" />
      </svg>

      <div className="living-background__sheen" />
      <div className="living-background__depth" />
    </div>
  );
}
