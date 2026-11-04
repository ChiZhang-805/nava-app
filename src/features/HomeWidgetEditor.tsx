import { ArrowLeft, Check, ChevronLeft, ChevronRight, Footprints, GripVertical, MoonStar, ScanFace, SmilePlus, TimerReset, Utensils, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { homeWidgetIds, moveHomeWidget, shiftHomeWidget, type HomeWidgetId } from "../services/homeWidgets";

const widgetMeta: Record<HomeWidgetId, { icon: LucideIcon; zh: string; en: string }> = {
  mood: { icon: SmilePlus, zh: "情绪", en: "Mood" },
  sleep: { icon: MoonStar, zh: "睡眠", en: "Sleep" },
  exercise: { icon: Footprints, zh: "运动", en: "Activity" },
  diet: { icon: Utensils, zh: "饮食", en: "Diet" },
  face: { icon: ScanFace, zh: "面部", en: "Face" },
  focus: { icon: TimerReset, zh: "专注", en: "Focus" },
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
  const [ids, setIds] = useState<HomeWidgetId[]>(() => [
    ...initialIds.filter((id, index) => homeWidgetIds.includes(id) && initialIds.indexOf(id) === index),
    ...homeWidgetIds.filter((id) => !initialIds.includes(id)),
  ].slice(0, homeWidgetIds.length));
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

  const movePointer = (event: ReactPointerEvent<HTMLElement>) => {
    const source = dragIdRef.current;
    if (!source) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-widget]")?.dataset.sortWidget as HomeWidgetId | undefined;
    if (target && target !== source) setIds((current) => moveHomeWidget(current, source, target));
  };

  return (
    <section className="home-widget-editor" data-widget-editor-step="sort">
      <header className="home-widget-editor-header">
        <button type="button" onClick={cancel} aria-label={zh ? "返回" : "Back"}><ArrowLeft size={21} /></button>
        <div><h1>{zh ? "调整首页顺序" : "Arrange widgets"}</h1></div>
        <span>{ids.length}/{homeWidgetIds.length}</span>
      </header>

      <div className="home-widget-sort" role="list" aria-label={zh ? "拖动调整小组件顺序" : "Drag to arrange widgets"}>
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

      <footer>
        <button type="button" onClick={cancel}>{zh ? "取消" : "Cancel"}</button>
        <button type="button" onClick={() => onSave(ids)}><Check size={17} />{zh ? "保存首页" : "Save home"}</button>
      </footer>
    </section>
  );
}
