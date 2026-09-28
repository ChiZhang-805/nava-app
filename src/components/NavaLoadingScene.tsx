import { useLocale } from "../i18n";
import loadingCat from "../assets/mascot/nava-loading-cat-v1.png";

export default function NavaLoadingScene({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const label = locale === "zh" ? "正在加载" : "Loading";
  return <section className={compact ? "nava-loading-scene is-compact" : "nava-loading-scene"} role="status" aria-live="polite" aria-busy="true" aria-label={locale === "zh" ? "NAVA 正在加载" : "NAVA is loading"}>
    <div className="nava-loading-cradle" aria-hidden="true">
      <img className="nava-loading-cat" src={loadingCat} alt="" />
      <span className="nava-loading-bar" />
      <span className="nava-loading-string is-left"><i /></span>
      <span className="nava-loading-string is-middle"><i /></span>
      <span className="nava-loading-string is-right"><i /></span>
    </div>
    <div className="nava-loading-word" aria-hidden="true"><span>{label}</span><i className="dot-one">.</i><i className="dot-two">.</i><i className="dot-three">.</i></div>
  </section>;
}
