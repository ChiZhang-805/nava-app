import { Check } from "lucide-react";
import { useLocale } from "../i18n";
import { APP_SKINS, type AppSkin } from "../services/appSkin";

const skinPoetry = {
  "glacier-mist": {
    zh: ["晨雾落在冰蓝窗前", "光沿玻璃轻轻流动", "一笔记录清澈醒来", "深海导航稳稳相伴", "呼吸留在柔软留白", "每次触碰安静明亮"],
    en: ["Morning mist meets icy blue", "Light drifts softly over glass", "Each note wakes clear and calm", "Deep-ocean paths stay steady", "Breathing room rests between", "Every touch feels quietly bright"],
  },
  "violet-dusk": {
    zh: ["暮紫从星河漫下来", "流光在卡片间呼吸", "心事被夜色轻轻接住", "青蓝微光指引方向", "每段记录都有回声", "慢慢走进温柔星夜"],
    en: ["Violet dusk spills from stars", "Light breathes between each card", "Night gently holds your thoughts", "Cyan glimmers guide the way", "Every note carries an echo", "Step softly into starlight"],
  },
  "sky-ripple": {
    zh: ["晴空铺开浅蓝呼吸", "微风把青绿轻轻晕开", "日常像水波慢慢舒展", "每个模块留有余地", "明亮光线陪你记录", "一页一页自在向前"],
    en: ["Clear skies open into blue", "Soft teal moves with the breeze", "Days unfold like quiet ripples", "Every space has room to rest", "Bright light follows each note", "Turn each page at your own pace"],
  },
} as const;

export default function AppSkinPicker({ value, onChange, compact = false, detailed = false }: {
  value: AppSkin;
  onChange: (skin: AppSkin) => void;
  compact?: boolean;
  detailed?: boolean;
}) {
  const { locale } = useLocale();
  return (
    <div className={["app-skin-picker", compact ? "is-compact" : "", detailed ? "is-detailed" : ""].filter(Boolean).join(" ")} role="radiogroup" aria-label={locale === "zh" ? "界面皮肤" : "Interface skin"}>
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
            <span className="app-skin-swatch" aria-hidden="true">
              <i /><i /><i />
              <span className="app-skin-palette"><b /><b /><b /></span>
            </span>
            <span className="app-skin-copy">
              <strong>{locale === "zh" ? skin.name : skin.nameEn}</strong>
              {detailed
                ? <span className="app-skin-poetry">{skinPoetry[skin.id][locale === "zh" ? "zh" : "en"].map((line) => <small key={line}>{line}</small>)}</span>
                : !compact && <small>{locale === "zh" ? skin.description : skin.descriptionEn}</small>}
            </span>
            {selected && <Check className="app-skin-selected" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
