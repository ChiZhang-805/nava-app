import type { LegacyWardrobeMascotMotion as WardrobeMascotMotion } from "../services/wardrobeMascotMotion";

export default function WardrobeMascotEffect({ motion }: { motion: WardrobeMascotMotion | null }) {
  return <svg className="mascot-wardrobe-effect" viewBox="0 0 320 320" aria-hidden="true" focusable="false" data-motion={motion ?? "rest"}>
    <defs>
      <radialGradient id="wardrobe-bubble" cx="35%" cy="30%" r="75%">
        <stop offset="0" stopColor="#fff" stopOpacity=".78" />
        <stop offset=".48" stopColor="#c9fbff" stopOpacity=".24" />
        <stop offset="1" stopColor="#9ce5ff" stopOpacity=".5" />
      </radialGradient>
      <radialGradient id="wardrobe-star" cx="42%" cy="37%" r="68%">
        <stop offset="0" stopColor="#fff" />
        <stop offset=".48" stopColor="#fff1b1" />
        <stop offset="1" stopColor="#9be9ff" />
      </radialGradient>
      <radialGradient id="wardrobe-petal" cx="40%" cy="30%" r="80%">
        <stop offset="0" stopColor="#fff" />
        <stop offset=".65" stopColor="#ffdce9" />
        <stop offset="1" stopColor="#f3a7ce" />
      </radialGradient>
    </defs>
    {motion === "bubble" && <g className="mascot-wardrobe-effect-art">
      <circle cx="231" cy="133" r="24" fill="url(#wardrobe-bubble)" stroke="#eaffff" strokeWidth="2.4" />
      <ellipse cx="220" cy="122" rx="6" ry="3" fill="#fff" opacity=".88" transform="rotate(-38 220 122)" />
      <circle cx="263" cy="93" r="11" fill="url(#wardrobe-bubble)" stroke="#eaffff" strokeWidth="1.6" />
      <circle cx="201" cy="82" r="7" fill="url(#wardrobe-bubble)" stroke="#eaffff" strokeWidth="1.3" />
      <path d="M271 128v-11m-5 5h11M202 142v-7m-4 3h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".88" />
    </g>}
    {motion === "starlight" && <g className="mascot-wardrobe-effect-art">
      <path d="m209 78 7.4 17.2 18.6 1.8-14 12.5 4.2 18.2-16.2-9.5-16.2 9.5 4.2-18.2-14-12.5 18.6-1.8z" fill="url(#wardrobe-star)" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M258 60v20m-10-10h20M170 132v13m-6.5-6.5h13M257 139v9m-4.5-4.5h9" stroke="#f8ffff" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="245" cy="112" r="3.5" fill="#fff7d7" /><circle cx="177" cy="67" r="2.5" fill="#fff" />
    </g>}
    {motion === "blossom" && <g className="mascot-wardrobe-effect-art">
      <path d="M232 176c-8-26-1-47 15-66" fill="none" stroke="#7ecdbb" strokeWidth="5" strokeLinecap="round" />
      <path d="M236 159c-14-10-24-8-29-3 7 10 18 11 29 3ZM239 145c10-11 20-13 28-9-5 10-17 15-28 9Z" fill="#a9dfc9" stroke="#eafff2" strokeWidth="1.4" />
      <g fill="url(#wardrobe-petal)" stroke="#fff" strokeWidth="1.5">
        <ellipse cx="247" cy="91" rx="10" ry="18" /><ellipse cx="247" cy="122" rx="10" ry="18" />
        <ellipse cx="231" cy="107" rx="18" ry="10" /><ellipse cx="263" cy="107" rx="18" ry="10" />
        <ellipse cx="236" cy="96" rx="9" ry="15" transform="rotate(-45 236 96)" />
      </g>
      <circle cx="247" cy="107" r="9" fill="#fff6cb" stroke="#fff" strokeWidth="2" />
      <path d="M199 73c9 0 12 5 10 13-8-1-12-5-10-13ZM280 169c8-3 13 0 13 8-8 2-12-1-13-8Z" fill="#ffdeeb" stroke="#fff" strokeWidth="1.4" />
    </g>}
    {motion === "snowfall" && <g className="mascot-wardrobe-effect-art" fill="none" stroke="#faffff" strokeLinecap="round">
      <path d="M216 79v40m-20-20h40m-34-14 28 28m0-28-28 28" strokeWidth="3.4" />
      <path d="M268 124v23m-11.5-11.5h23m-19-8 16 16m0-16-16 16" strokeWidth="2.5" />
      <path d="M176 141v17m-8.5-8.5h17m-14-6 12 12m0-12-12 12" strokeWidth="2.1" />
      <circle cx="244" cy="68" r="3" fill="#fff" stroke="none" /><circle cx="274" cy="84" r="2.5" fill="#fff" stroke="none" />
      <circle cx="190" cy="110" r="2" fill="#fff" stroke="none" />
    </g>}
  </svg>;
}
