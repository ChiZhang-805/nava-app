import { Brain, Dumbbell, MoonStar, ScanFace, SmilePlus, Utensils } from "lucide-react";
import { useLocale } from "../i18n";
import type { RecordModule } from "../features/RecordsScreen";

const entries: Array<{ id: RecordModule; zh: string; en: string; icon: typeof Brain }> = [
  { id: "sleep", zh: "睡眠", en: "Sleep", icon: MoonStar },
  { id: "exercise", zh: "运动", en: "Activity", icon: Dumbbell },
  { id: "mood", zh: "情绪", en: "Mood", icon: SmilePlus },
  { id: "diet", zh: "饮食", en: "Diet", icon: Utensils },
  { id: "focus", zh: "专注", en: "Focus", icon: Brain },
  { id: "face", zh: "面部", en: "Face", icon: ScanFace },
];

export default function CatModulePicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (module: RecordModule) => void }) {
  const { locale } = useLocale();
  if (!open) return null;
  return (
    <div className="cat-module-picker-layer" role="presentation" onClick={onClose}>
      <section className="cat-module-picker" role="dialog" aria-modal="true" aria-label={locale === "zh" ? "选择记录模块" : "Choose a module"} onClick={(event) => event.stopPropagation()}>
        <span className="cat-picker-handle" />
        <header><span>NAVA</span><strong>{locale === "zh" ? "记录哪一项？" : "What will you log?"}</strong></header>
        <div>
          {entries.map(({ id, zh, en, icon: Icon }) => <button type="button" data-cat-module={id} key={id} onClick={() => onSelect(id)}><span><Icon size={23} /></span><b>{locale === "zh" ? zh : en}</b></button>)}
        </div>
      </section>
    </div>
  );
}
