import { Check, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DurationValue = { hours: number; minutes: number; seconds: number };
type DurationField = keyof DurationValue;
const rowHeight = 46;

function WheelColumn({ label, maximum, value, initial, onChange }: {
  label: string;
  maximum: number;
  value: number;
  initial: boolean;
  onChange: (value: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    list.current?.scrollTo({ top: value * rowHeight, behavior: "instant" });
  }, [value]);

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);

  return <div className="duration-wheel-column">
    <strong>{label}</strong>
    <div className="duration-wheel-list" data-duration-initial={initial ? "true" : undefined} ref={list} role="listbox" aria-label={label} tabIndex={0} onScroll={(event) => {
      if (settle.current) clearTimeout(settle.current);
      const target = event.currentTarget;
      settle.current = setTimeout(() => {
        const next = Math.max(0, Math.min(maximum, Math.round(target.scrollTop / rowHeight)));
        onChange(next);
        target.scrollTo({ top: next * rowHeight, behavior: "smooth" });
      }, 70);
    }}>
      {Array.from({ length: maximum + 1 }, (_, option) => <button key={option} type="button" role="option" aria-selected={option === value}
        onClick={() => { onChange(option); list.current?.scrollTo({ top: option * rowHeight, behavior: "smooth" }); }}>
        {String(option).padStart(2, "0")}
      </button>)}
    </div>
  </div>;
}

export default function DurationWheelPicker({ locale, value, initialColumn = "hours", onCancel, onConfirm }: {
  locale: "zh" | "en";
  value: DurationValue;
  initialColumn?: DurationField;
  onCancel: () => void;
  onConfirm: (value: DurationValue) => void;
}) {
  const [draft, setDraft] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const host = document.querySelector(".phone-frame") ?? document.body;

  useEffect(() => {
    const previous = document.activeElement;
    const siblings = [...host.children].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== root.current);
    const inert = siblings.map((node) => node.inert);
    siblings.forEach((node) => { node.inert = true; });
    root.current?.querySelector<HTMLElement>('[data-duration-initial="true"]')?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      siblings.forEach((node, index) => { node.inert = inert[index]; });
      document.removeEventListener("keydown", key);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [host, initialColumn, onCancel]);

  const labels = locale === "zh"
    ? { hours: "小时", minutes: "分钟", seconds: "秒钟" }
    : { hours: "Hours", minutes: "Minutes", seconds: "Seconds" };
  return createPortal(<div ref={root} className="duration-wheel-overlay" onClick={onCancel}>
    <section className="duration-wheel-sheet" role="dialog" aria-modal="true" aria-labelledby={id} onClick={(event) => event.stopPropagation()}>
      <header><button className="duration-wheel-close" type="button" onClick={onCancel} aria-label={locale === "zh" ? "关闭时长选择" : "Close duration picker"}><X size={21} /></button><h2 id={id}>{locale === "zh" ? "选择所需时间" : "Choose duration"}</h2><span aria-hidden="true" /></header>
      <div className="duration-wheel-columns">
        <WheelColumn label={labels.hours} maximum={99} value={draft.hours} initial={initialColumn === "hours"} onChange={(hours) => setDraft((current) => ({ ...current, hours }))} />
        <WheelColumn label={labels.minutes} maximum={59} value={draft.minutes} initial={initialColumn === "minutes"} onChange={(minutes) => setDraft((current) => ({ ...current, minutes }))} />
        <WheelColumn label={labels.seconds} maximum={59} value={draft.seconds} initial={initialColumn === "seconds"} onChange={(seconds) => setDraft((current) => ({ ...current, seconds }))} />
      </div>
      <button className="duration-wheel-confirm" type="button" onClick={() => onConfirm(draft)}><Check size={19} />{locale === "zh" ? "确定" : "Done"}</button>
    </section>
  </div>, host);
}
