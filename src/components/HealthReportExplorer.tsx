import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BedDouble, ChartNoAxesCombined, ChevronRight, ClipboardPlus, HeartPulse, RotateCw, ScanFace, SmilePlus, Timer, Utensils, Dumbbell } from "lucide-react";
import type { TrendBundle } from "../types";
import { buildHealthReportCharts, type HealthReportCategory, type HealthReportChart } from "../services/healthReportExplorer";
import BottomSheet from "./BottomSheet";
import LineTrendChart from "./LineTrendChart";
import "../styles/health-report-explorer.css";

const categories = [
  { id: "mood", zh: "情绪", en: "Mood", icon: SmilePlus },
  { id: "face", zh: "面部", en: "Face", icon: ScanFace },
  { id: "focus", zh: "专注", en: "Focus", icon: Timer },
  { id: "sleep", zh: "睡眠", en: "Sleep", icon: BedDouble },
  { id: "exercise", zh: "运动", en: "Activity", icon: Dumbbell },
  { id: "diet", zh: "饮食", en: "Diet", icon: Utensils },
  { id: "heart", zh: "心率", en: "Heart", icon: HeartPulse },
] as const;

function CategoryImage({ category }: { category: typeof categories[number] }) {
  const [failed, setFailed] = useState(false);
  if (category.id === "heart" || failed) return <category.icon size={30} strokeWidth={1.7} aria-hidden="true" />;
  return <img src={`${import.meta.env.BASE_URL}assets/health-report/${category.id}.webp`} alt="" draggable={false} onError={() => setFailed(true)} />;
}

function ReportCard({ chart, locale, active, flipped, onFlip, onSelect, onOpenRecord }: {
  chart: HealthReportChart; locale: "zh" | "en"; active: boolean; flipped: boolean; onFlip: () => void; onSelect: () => void; onOpenRecord?: () => void;
}) {
  const recorded = chart.points.filter((point) => !point.missing);
  const latest = recorded[recorded.length - 1];
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return <article className="health-explorer-card" data-chart-id={chart.id} data-active={active} data-side={flipped ? "back" : "front"} aria-hidden={!active} aria-label={chart.title}>
    {!active && <button type="button" tabIndex={-1} className="health-explorer-neighbor" data-target-id={chart.id} aria-label={chart.title} onClick={onSelect} />}
    <button type="button" className="health-explorer-flip" aria-label={flipped ? (locale === "zh" ? "回到图表" : "Back to chart") : (locale === "zh" ? "查看明细" : "View details")} aria-pressed={flipped} disabled={!active} onClick={(event) => { event.stopPropagation(); onFlip(); }}><RotateCw size={21} /></button>
    <div className="health-explorer-card-turn">
      <div className="health-explorer-front" aria-hidden={!active || flipped} ref={(node) => { if (node) node.inert = !active || flipped; }}>
        <h3>{chart.title}</h3>
        <div className="health-explorer-value"><strong>{latest ? format(latest.value) : "—"}</strong><span>{latest ? chart.unit : (locale === "zh" ? "还没有记录" : "No entries yet")}</span></div>
        <div className="health-explorer-plot">
          {latest ? <LineTrendChart points={chart.points} ariaLabel={chart.title} tone="rhythm" scale="auto" domain={chart.domain} presentation="report" showYAxis={false} curve="monotone" showValues={false} dateLabelEvery={2} showConfidenceBand={false} valueFormatter={format} /> : <div className="health-explorer-empty"><ClipboardPlus size={38} strokeWidth={1.4} /><p>{locale === "zh" ? "记下一笔，让趋势慢慢出现。" : "Add an entry to begin your trend."}</p></div>}
        </div>
      </div>
      <div className="health-explorer-back" aria-hidden={!active || !flipped} ref={(node) => { if (node) node.inert = !active || !flipped; }}>
        <h3>{chart.title}</h3>
        <div className="health-explorer-details">
          <p className="health-explorer-description">{chart.description}</p>
          <p className="health-explorer-range">{chart.points[0]?.id} — {chart.points[chart.points.length - 1]?.id}<br />{locale === "zh" ? `${recorded.length} 天有数据` : `${recorded.length} ${recorded.length === 1 ? "day" : "days"} with data`}</p>
          <h4>{locale === "zh" ? "最近记录" : "Recent entries"}</h4>
          {recorded.length ? <dl>{recorded.slice(-5).reverse().map((point) => <div key={point.id} data-record-date={point.id} data-record-value={point.value}><dt>{point.id}</dt><dd>{format(point.value)} <span>{chart.unit}</span></dd></div>)}</dl> : <p>{locale === "zh" ? "这段时间还没有记录，缺失不会算作零。" : "No entries in this period. Missing values are not zero."}</p>}
        </div>
        {onOpenRecord && <button type="button" className="health-explorer-record" onClick={onOpenRecord}>{locale === "zh" ? "查看 / 补充记录" : "View / add entries"}<ChevronRight size={17} /></button>}
      </div>
    </div>
  </article>;
}

function ChartDeck({ charts, locale, initialIndex, onOpenRecord }: {
  charts: HealthReportChart[]; locale: "zh" | "en"; initialIndex: number; onOpenRecord?: () => void;
}) {
  const count = charts.length;
  const repeated = count > 1;
  const slides = repeated ? [...charts, ...charts, ...charts] : charts;
  const firstPosition = (repeated ? count : 0) + Math.min(initialIndex, count - 1);
  const [position, setPosition] = useState(firstPosition);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const activeChartId = useRef(slides[firstPosition].id);
  const track = useRef<HTMLDivElement | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocus = useRef<{ index: number; selector: string } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.index !== position) return;
    pendingFocus.current = null;
    track.current?.children[position].querySelector<HTMLElement>(pending.selector)?.focus({ preventScroll: true });
  }, [position]);
  const center = (node: HTMLDivElement, index: number) => {
    const card = node.children[index] as HTMLElement;
    return card.offsetLeft - (node.clientWidth - card.offsetWidth) / 2;
  };
  const initialScroll = useCallback((node: HTMLDivElement | null) => {
    track.current = node;
    if (node?.children[firstPosition]) node.scrollLeft = center(node, firstPosition);
  }, [firstPosition]);
  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  const go = (index: number) => {
    const node = track.current;
    if (!node?.children[index]) return;
    if (settle.current) { clearTimeout(settle.current); settle.current = null; }
    pendingFocus.current = null;
    if (document.activeElement !== node && node.contains(document.activeElement)) node.focus({ preventScroll: true });
    node.scrollTo({ left: center(node, index), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (repeated) go(Math.max(0, Math.min(slides.length - 1, position + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  return <div className="health-explorer-deck">
    <div ref={initialScroll} className="health-explorer-track" role="region" aria-roledescription={locale === "zh" ? "轮播图表" : "carousel"} aria-label={locale === "zh" ? "左右滑动查看图表" : "Swipe to explore charts"} tabIndex={0} onKeyDown={onKeyDown} onScroll={(event) => {
      const node = event.currentTarget;
      const distances = slides.map((_, index) => Math.abs(center(node, index) - node.scrollLeft));
      const nearest = distances.indexOf(Math.min(...distances));
      if (slides[nearest].id !== activeChartId.current) {
        pendingFocus.current = null;
        if (document.activeElement !== node && node.contains(document.activeElement)) node.focus({ preventScroll: true });
        activeChartId.current = slides[nearest].id;
        setFlippedId(null);
      }
      setPosition(nearest);
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => {
        if (!repeated || (nearest >= count && nearest < 2 * count)) return;
        const middle = (nearest % count) + count;
        const focused = document.activeElement;
        const focusSelector = node.children[nearest].contains(focused) && focused instanceof HTMLElement
          ? focused.classList.contains("health-explorer-flip") ? ".health-explorer-flip" : focused.classList.contains("health-explorer-record") ? ".health-explorer-record" : null
          : null;
        pendingFocus.current = focusSelector ? { index: middle, selector: focusSelector } : null;
        node.scrollTo({ left: center(node, middle), behavior: "instant" });
        setPosition(middle);
      }, 160);
    }}>
      {slides.map((chart, index) => <ReportCard key={`${chart.id}-${index}`} chart={chart} locale={locale} active={index === position} flipped={index === position && flippedId === chart.id} onFlip={() => setFlippedId((id) => id === chart.id ? null : chart.id)} onSelect={() => go(index)} onOpenRecord={onOpenRecord} />)}
    </div>
    <span className="sr-only" aria-live="polite">{slides[position]?.title} · {position % count + 1}/{count}</span>
  </div>;
}

export default function HealthReportExplorer({ bundle, date, maxDate, locale, onDateChange, onOpenRecord, onOpenWeekly, overview }: {
  bundle: TrendBundle | null; date: string; maxDate: string; locale: "zh" | "en";
  onDateChange: (date: string) => void; onOpenRecord: (category: Exclude<HealthReportCategory, "heart">) => void;
  onOpenWeekly?: () => void;
  overview?: string;
}) {
  const charts = useMemo(() => buildHealthReportCharts(bundle, date, locale), [bundle, date, locale]);
  const [selection, setSelection] = useState<{ category: HealthReportCategory; chart: number; revision: number }>({ category: "mood", chart: -1, revision: 0 });
  const [showAll, setShowAll] = useState(false);
  const categoryTrack = useRef<HTMLDivElement>(null);
  const available = categories.filter((category) => category.id !== "heart" || charts.heart.length > 0);
  const active = available.find((category) => category.id === selection.category) ?? available[0];
  const select = (category: HealthReportCategory, chart = -1) => setSelection((current) => ({ category, chart, revision: current.revision + 1 }));
  const initialChart = selection.chart < 0 ? Math.max(0, charts[active.id].findIndex((chart) => chart.points.some((point) => !point.missing))) : selection.chart;
  useEffect(() => {
    const node = categoryTrack.current;
    const tab = node?.querySelector<HTMLElement>(`[data-health-category="${active.id}"]`);
    if (!node || !tab) return;
    const bounds = node.getBoundingClientRect(), target = tab.getBoundingClientRect();
    if (target.left < bounds.left) node.scrollLeft += target.left - bounds.left;
    else if (target.right > bounds.right) node.scrollLeft += target.right - bounds.right;
  }, [active.id]);
  return <section className="health-report-explorer" data-health-explorer data-category={active.id}>
    <div className="health-explorer-toolbar"><h2><img src={`${import.meta.env.BASE_URL}assets/health-report/rhythm.webp`} alt="" draggable={false} />{locale === "zh" ? "我的节律" : "My rhythm"}</h2><button type="button" className="health-explorer-all" onClick={() => setShowAll(true)}>{locale === "zh" ? "查看全部" : "See all"}<ChevronRight size={16} /></button></div>
    <div ref={categoryTrack} className="health-explorer-categories" role="tablist" aria-label={locale === "zh" ? "健康类别" : "Health categories"}>
      {available.map((category, index) => <button type="button" role="tab" aria-selected={active.id === category.id} aria-controls="health-explorer-panel" tabIndex={active.id === category.id ? 0 : -1} key={category.id} data-health-category={category.id} onClick={() => select(category.id)} onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + available.length) % available.length;
        select(available[next].id);
        (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
      }}><span><CategoryImage category={category} /></span><strong>{locale === "zh" ? category.zh : category.en}</strong></button>)}
    </div>
    <div id="health-explorer-panel" className="health-explorer-panel" role="tabpanel" aria-label={locale === "zh" ? active.zh : active.en}>
      <div className="health-explorer-heading"><h2><CategoryImage key={active.id} category={active} />{locale === "zh" ? active.zh : active.en}</h2></div>
      <ChartDeck key={`${active.id}-${date}-${selection.revision}-${initialChart}-${charts[active.id].map((chart) => chart.id).join(",")}`} charts={charts[active.id]} locale={locale} initialIndex={initialChart} onOpenRecord={active.id === "heart" ? undefined : () => onOpenRecord(active.id as Exclude<HealthReportCategory, "heart">)} />
    </div>
    {showAll && <BottomSheet label={locale === "zh" ? "全部图表" : "All charts"} closeLabel={locale === "zh" ? "关闭，也可以向下拖动" : "Close, or drag down"} onClose={() => setShowAll(false)} className="health-explorer-sheet">
      <h2>{locale === "zh" ? "想看看哪一项？" : "What would you like to explore?"}</h2>
      <label className="health-explorer-date"><span>{locale === "zh" ? "报告日期" : "Report date"}</span><input type="date" value={date} max={maxDate} onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }} /></label>
      {overview && <p className="health-explorer-overview">{overview}</p>}
      <div className="health-explorer-chart-list">{available.map(({ id, zh, en, icon: Icon }) => <section key={id}><h3><Icon size={20} />{locale === "zh" ? zh : en}</h3>{charts[id].map((chart, index) => <button type="button" key={chart.id} data-select-chart={chart.id} onClick={() => { select(id, index); setShowAll(false); }}><span>{chart.title}</span><ChevronRight size={17} /></button>)}</section>)}</div>
      {onOpenWeekly && <button type="button" className="health-explorer-weekly" data-health-weekly onClick={() => { setShowAll(false); onOpenWeekly(); }}><ChartNoAxesCombined size={19} /><span>{locale === "zh" ? "本周回顾" : "Weekly review"}</span><ChevronRight size={17} /></button>}
    </BottomSheet>}
  </section>;
}
