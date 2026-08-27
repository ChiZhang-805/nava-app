import { Languages } from "lucide-react";
import { useLocale } from "../i18n";

export default function LanguageToggle({ onToggle }: { onToggle?: () => void } = {}) {
  const { locale, toggleLocale, t } = useLocale();

  return (
    <button className="language-toggle" type="button" onClick={() => { toggleLocale(); onToggle?.(); }} aria-label={t("language.toggle")}>
      <Languages size={14} />
      <span>{locale === "zh" ? t("language.zh") : t("language.en")}</span>
    </button>
  );
}
