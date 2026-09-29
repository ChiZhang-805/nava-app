import { useEffect, useLayoutEffect, useRef, useState } from "react";

type DurationField = "hours" | "minutes" | "seconds";
const rowHeight = 34;

export default function DurationWheelPicker({ locale, field, value, onCancel, onSelect }: {
  locale: "zh" | "en";
  field: DurationField;
  value: number;
  onCancel: () => void;
  onSelect: (value: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(value);
  const maximum = field === "hours" ? 99 : 59;
  const label = locale === "zh"
    ? { hours: "小时", minutes: "分钟", seconds: "秒钟" }[field]
    : { hours: "Hours", minutes: "Minutes", seconds: "Seconds" }[field];

  function reveal(option: number, behavior: ScrollBehavior = "smooth") {
    const next = Math.max(0, Math.min(maximum, option));
    setActive(next);
    const list = root.current;
    if (list) list.scrollTo({ top: Math.max(0, next * rowHeight - (list.clientHeight - rowHeight) / 2), behavior });
  }

  useLayoutEffect(() => {
    reveal(value, "instant");
    root.current?.focus({ preventScroll: true });
  // Opening a different unit remounts this component through its key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const trigger = document.querySelector(`[data-duration-field="${field}"]`);
      if (root.current?.contains(event.target as Node) || trigger?.contains(event.target as Node)) return;
      onCancel();
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, [field, onCancel]);

  return <div
    ref={root}
    id={`todo-duration-options-${field}`}
    className="duration-unit-popover"
    data-duration-initial="true"
    role="listbox"
    aria-label={label}
    tabIndex={0}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); return; }
      if (event.key === "ArrowDown") { event.preventDefault(); reveal(active + 1); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); reveal(active - 1); return; }
      if (event.key === "Home") { event.preventDefault(); reveal(0); return; }
      if (event.key === "End") { event.preventDefault(); reveal(maximum); return; }
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(active); }
    }}
  >
    {Array.from({ length: maximum + 1 }, (_, option) => <button
      className={option === active ? "is-active" : ""}
      key={option}
      type="button"
      role="option"
      aria-selected={option === value}
      onPointerEnter={() => setActive(option)}
      onFocus={() => reveal(option)}
      onClick={() => onSelect(option)}
    >
      {String(option).padStart(2, "0")}
    </button>)}
  </div>;
}
