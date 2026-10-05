import { Check } from "lucide-react";
import { useLocale } from "../i18n";
import { APP_SKINS, type AppSkin } from "../services/appSkin";

export default function AppSkinPicker({ value, onChange, compact = false }: {
  value: AppSkin;
  onChange: (skin: AppSkin) => void;
  compact?: boolean;
}) {
  const { locale } = useLocale();
  return (
    <div className={["app-skin-picker", compact ? "is-compact" : ""].filter(Boolean).join(" ")} role="radiogroup" aria-label={locale === "zh" ? "界面皮肤" : "Interface skin"}>
      {APP_SKINS.map((skin) => {
        const selected = skin.id === value;
        return (
          <button
            key={skin.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={["app-skin-option", `app-skin-option--${skin.id}`, selected ? "is-selected" : ""].filter(Boolean).join(" ")}
            onClick={() => onChange(skin.id)}
          >
            <span className="app-skin-swatch" aria-hidden="true"><i /><i /><i /></span>
            <span className="app-skin-copy">
              <strong>{locale === "zh" ? skin.name : skin.nameEn}</strong>
              {!compact && <small>{locale === "zh" ? skin.description : skin.descriptionEn}</small>}
            </span>
            {selected && <Check className="app-skin-selected" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
