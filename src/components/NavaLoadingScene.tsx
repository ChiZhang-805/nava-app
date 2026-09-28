import { useLocale } from "../i18n";

export default function NavaLoadingScene({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const label = locale === "zh" ? "正在加载" : "Loading";
  return <section className={compact ? "nava-loading-scene is-compact" : "nava-loading-scene"} role="status" aria-live="polite" aria-busy="true" aria-label={locale === "zh" ? "NAVA 正在加载" : "NAVA is loading"}>
    <div className="nava-loading-cradle" aria-hidden="true">
      <svg className="nava-loading-cat" viewBox="0 0 152 102">
        <g className="nava-loading-tail"><path d="M111 69c23-2 32-16 25-28-4-7-12-7-17-2" /></g>
        <path className="cat-body" d="M49 72c1-22 10-37 27-39 19-2 31 13 33 39" />
        <path className="cat-head" d="M55 42 51 17l18 10c7-3 15-3 22 0l18-10-4 25c3 5 4 10 3 15-2 15-14 22-28 22S54 72 52 57c-1-5 0-10 3-15Z" />
        <path d="M67 51h1M92 51h1" />
        <path d="M76 59c2 3 6 3 8 0m-4-2v3" />
        <path d="M61 58 43 55m19 9-18 2m54-8 18-3m-18 9 18 2" />
        <path className="nava-loading-wave" d="M104 37c9-8 17-5 18 1m-17 5c8-6 14-3 15 1" />
        <path d="M65 71v14m30-14v14" />
      </svg>
      <span className="nava-loading-bar" />
      <span className="nava-loading-string is-left"><i /></span>
      <span className="nava-loading-string is-middle"><i /></span>
      <span className="nava-loading-string is-right"><i /></span>
    </div>
    <div className="nava-loading-word" aria-hidden="true"><span>{label}</span><i className="dot-one">.</i><i className="dot-two">.</i><i className="dot-three">.</i></div>
  </section>;
}
