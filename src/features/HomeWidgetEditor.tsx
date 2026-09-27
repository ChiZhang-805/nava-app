import { ArrowLeft, Check, ChevronLeft, ChevronRight, Footprints, GripVertical, MoonStar, ScanFace, SmilePlus, TimerReset, Utensils, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HOME_WIDGET_LIMIT, homeWidgetIds, moveHomeWidget, shiftHomeWidget, type HomeWidgetId } from "../services/homeWidgets";

const widgetMeta: Record<HomeWidgetId, { icon: LucideIcon; zh: string; en: string; descriptionZh: string; descriptionEn: string }> = {
  mood: { icon: SmilePlus, zh: "情绪", en: "Mood", descriptionZh: "今日情绪状态", descriptionEn: "Today's mood state" },
  sleep: { icon: MoonStar, zh: "睡眠", en: "Sleep", descriptionZh: "昨夜时长与状态", descriptionEn: "Last sleep duration and state" },
  exercise: { icon: Footprints, zh: "运动", en: "Activity", descriptionZh: "今日运动时长", descriptionEn: "Today's active time" },
  diet: { icon: Utensils, zh: "饮食", en: "Diet", descriptionZh: "今日能量与餐次", descriptionEn: "Today's energy and meals" },
  face: { icon: ScanFace, zh: "面部", en: "Face", descriptionZh: "今日非诊断状态", descriptionEn: "Today's non-diagnostic state" },
  focus: { icon: TimerReset, zh: "专注", en: "Focus", descriptionZh: "今日累计专注", descriptionEn: "Today's focus total" },
};

function sameIds(left: HomeWidgetId[], right: HomeWidgetId[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export default function HomeWidgetEditor({
  locale,
  initialIds,
  onSave,
  onCancel,
}: {
  locale: "zh" | "en";
  initialIds: HomeWidgetId[];
  onSave: (ids: HomeWidgetId[]) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"select" | "sort">("select");
  const [ids, setIds] = useState<HomeWidgetId[]>(initialIds);
  const dragIdRef = useRef<HomeWidgetId | null>(null);
  const dirty = useMemo(() => !sameIds(ids, initialIds), [ids, initialIds]);
  const zh = locale === "zh";

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const cancel = () => {
    if (dirty && !window.confirm(zh ? "首页设置尚未保存，确定放弃修改吗？" : "Discard unsaved home changes?")) return;
    onCancel();
  };

  const toggle = (id: HomeWidgetId) => {
    setIds((current) => {
      if (current.includes(id)) return current.filter((candidate) => candidate !== id);
      if (current.length >= HOME_WIDGET_LIMIT) return current;
      return [...current, id];
    });
  };

  const movePointer = (event: ReactPointerEvent<HTMLElement>) => {
    const source = dragIdRef.current;
    if (!source) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-widget]")?.dataset.sortWidget as HomeWidgetId | undefined;
    if (target && target !== source) setIds((current) => moveHomeWidget(current, source, target));
  };

  return (
    <section className="home-widget-editor" data-widget-editor-step={step}>
      <header className="home-widget-editor-header">
        <button type="button" onClick={step === "sort" ? () => setStep("select") : cancel} aria-label={zh ? "返回" : "Back"}><ArrowLeft size={21} /></button>
        <div><h1>{step === "select" ? (zh ? "选择小组件" : "Choose widgets") : (zh ? "调整首页顺序" : "Arrange widgets")}</h1></div>
        <span>{ids.length}/{HOME_WIDGET_LIMIT}</span>
      </header>

      {step === "select" ? (
        <div className="home-widget-picker" role="list" aria-label={zh ? "可用健康小组件" : "Available health widgets"}>
          {homeWidgetIds.map((id) => {
            const meta = widgetMeta[id];
            const Icon = meta.icon;
            const selected = ids.includes(id);
            const disabled = !selected && ids.length >= HOME_WIDGET_LIMIT;
            return <button key={id} type="button" role="listitem" className={selected ? "is-selected" : ""} disabled={disabled} aria-pressed={selected} onClick={() => toggle(id)}>
              <span><Icon size={23} /></span>
              <div><strong>{zh ? meta.zh : meta.en}</strong><small>{zh ? meta.descriptionZh : meta.descriptionEn}</small></div>
              <i>{selected && <Check size={15} />}</i>
            </button>;
          })}
        </div>
      ) : (
        <div className="home-widget-sort" role="list" aria-label={zh ? "拖动调整小组件顺序" : "Drag to arrange widgets"}>
          {ids.length === 0 && <p>{zh ? "当前首页不显示健康小组件。保存后可随时从侧边栏重新添加。" : "No health widgets will be shown. You can add them later from the sidebar."}</p>}
          {ids.map((id, index) => {
            const meta = widgetMeta[id];
            const Icon = meta.icon;
            return <article
              key={id}
              role="listitem"
              data-sort-widget={id}
              data-sort-index={index + 1}
              onPointerDown={(event) => { dragIdRef.current = id; event.currentTarget.setPointerCapture(event.pointerId); }}
              onPointerMove={movePointer}
              onPointerUp={() => { dragIdRef.current = null; }}
              onPointerCancel={() => { dragIdRef.current = null; }}
            >
              <GripVertical className="home-widget-drag" size={19} aria-hidden="true" />
              <span><Icon size={20} /></span><strong>{zh ? meta.zh : meta.en}</strong>
              <div>
                <button type="button" disabled={index === 0} onPointerDown={(event) => event.stopPropagation()} onClick={() => setIds((current) => shiftHomeWidget(current, id, -1))} aria-label={zh ? `向前移动${meta.zh}` : `Move ${meta.en} earlier`}><ChevronLeft size={17} /></button>
                <button type="button" disabled={index === ids.length - 1} onPointerDown={(event) => event.stopPropagation()} onClick={() => setIds((current) => shiftHomeWidget(current, id, 1))} aria-label={zh ? `向后移动${meta.zh}` : `Move ${meta.en} later`}><ChevronRight size={17} /></button>
              </div>
            </article>;
          })}
        </div>
      )}

      <footer>
        <button type="button" onClick={cancel}>{zh ? "取消" : "Cancel"}</button>
        {step === "select"
          ? <button type="button" onClick={() => setStep("sort")}>{zh ? "调整顺序" : "Arrange"}<ChevronRight size={17} /></button>
          : <button type="button" onClick={() => onSave(ids)}><Check size={17} />{zh ? "保存首页" : "Save home"}</button>}
      </footer>
    </section>
  );
}
