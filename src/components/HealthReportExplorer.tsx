import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BedDouble, ChevronLeft, ChevronRight, ClipboardPlus, HeartPulse, ScanFace, SmilePlus, Timer, Utensils, Dumbbell } from "lucide-react";
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

function ChartDeck({ charts, locale, initialIndex, onOpenRecord }: {
  charts: HealthReportChart[]; locale: "zh" | "en"; initialIndex: number; onOpenRecord?: () => void;
}) {
  const [page, setPage] = useState(Math.min(initialIndex, charts.length - 1));
  const track = useRef<HTMLDivElement | null>(null);
  const initialScroll = useCallback((node: HTMLDivElement | null) => {
    track.current = node;
    if (node && initialIndex > 0) {
      const card = node.children[Math.min(initialIndex, charts.length - 1)] as HTMLElement | undefined;
      if (card) node.scrollLeft = card.offsetLeft - (node.firstElementChild as HTMLElement).offsetLeft;
    }
  }, [initialIndex, charts.length]);
  const go = (index: number) => {
    const node = track.current;
    const card = node?.children[index] as HTMLElement | undefined;
    if (!node || !card) return;
    node.scrollTo({ left: card.offsetLeft - (node.firstElementChild as HTMLElement).offsetLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    go(Math.max(0, Math.min(charts.length - 1, page + (event.key === "ArrowLeft" ? -1 : 1))));
  };
  return <div className="health-explorer-deck">
    <div ref={initialScroll} className="health-explorer-track" role="region" aria-roledescription={locale === "zh" ? "轮播图表" : "carousel"} aria-label={locale === "zh" ? "左右滑动查看图表" : "Swipe to explore charts"} tabIndex={0} onKeyDown={onKeyDown} onScroll={(event) => {
      const node = event.currentTarget;
      const first = node.firstElementChild as HTMLElement | null;
      if (!first) return;
      const positions = Array.from(node.children, (child) => Math.abs((child as HTMLElement).offsetLeft - first.offsetLeft - node.scrollLeft));
      setPage(positions.indexOf(Math.min(...positions)));
    }}>
      {charts.map((chart, index) => {
        const recorded = chart.points.filter((point) => !point.missing);
        const latest = recorded[recorded.length - 1];
        return <article key={chart.id} className="health-explorer-card" data-chart-id={chart.id} aria-hidden={index !== page} ref={(node) => { if (node) node.inert = index !== page; }} aria-label={`${chart.title}, ${index + 1}/${charts.length}`}>
          <header><span>{chart.title}</span><small>{locale === "zh" ? "近 7 天" : "Past 7 days"}</small></header>
          <div className="health-explorer-value"><strong>{latest ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(latest.value) : "—"}</strong><span>{latest ? chart.unit : (locale === "zh" ? "等你记下第一笔" : "Your first entry awaits")}</span></div>
          <div className="health-explorer-plot">
            {latest ? <LineTrendChart points={chart.points} ariaLabel={chart.title} tone="rhythm" scale="auto" curve="monotone" showValues={false} dateLabelEvery={2} readableLabels showConfidenceBand={false} valueFormatter={(value) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} /> : <div className="health-explorer-empty"><ClipboardPlus size={32} strokeWidth={1.4} /><p>{locale === "zh" ? "记下一笔，让趋势慢慢出现。" : "Add an entry to begin your trend."}</p></div>}
          </div>
          <p className="health-explorer-description">{chart.description}</p>
          <footer><span>{locale === "zh" ? `${recorded.length} 天有数据` : `${recorded.length} ${recorded.length === 1 ? "day" : "days"} with data`}</span><span>{latest ? (locale === "zh" ? `最近 ${latest.label}` : `Latest ${latest.label}`) : (locale === "zh" ? "缺失不计为零" : "Missing ≠ zero")}</span></footer>
        </article>;
      })}
    </div>
    <div className="health-explorer-pagination" aria-label={locale === "zh" ? "图表分页" : "Chart pages"}>
      <button type="button" aria-label={locale === "zh" ? "上一张图表" : "Previous chart"} disabled={page === 0} onClick={() => go(page - 1)}><ChevronLeft size={20} /></button>
      <div>{charts.map((chart, index) => <button key={chart.id} type="button" aria-label={chart.title} aria-current={page === index ? "true" : undefined} onClick={() => go(index)}><span /></button>)}</div>
      <button type="button" aria-label={locale === "zh" ? "下一张图表" : "Next chart"} disabled={page === charts.length - 1} onClick={() => go(page + 1)}><ChevronRight size={20} /></button>
    </div>
    <div className="health-explorer-bottom"><span aria-live="polite">{charts[page]?.title}</span>{onOpenRecord && <button type="button" className="health-explorer-record" onClick={onOpenRecord}>{locale === "zh" ? "查看 / 补充记录" : "View / add entries"}<ChevronRight size={17} /></button>}</div>
  </div>;
}

export default function HealthReportExplorer({ bundle, date, maxDate, locale, onDateChange, onOpenRecord, overview }: {
  bundle: TrendBundle | null; date: string; maxDate: string; locale: "zh" | "en";
  onDateChange: (date: string) => void; onOpenRecord: (category: Exclude<HealthReportCategory, "heart">) => void;
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
    const track = categoryTrack.current;
    const tab = track?.querySelector<HTMLElement>(`[data-health-category="${active.id}"]`);
    if (!track || !tab) return;
    const bounds = track.getBoundingClientRect(), target = tab.getBoundingClientRect();
    if (target.left < bounds.left) track.scrollLeft += target.left - bounds.left;
    else if (target.right > bounds.right) track.scrollLeft += target.right - bounds.right;
  }, [active.id]);
  return <section className="health-report-explorer" data-health-explorer data-category={active.id}>
    <div className="health-explorer-toolbar"><label><span>{locale === "zh" ? "截至" : "Through"}</span><input type="date" aria-label={locale === "zh" ? "报告日期" : "Report date"} value={date} max={maxDate} onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }} /></label><button type="button" className="health-explorer-all" onClick={() => setShowAll(true)}>{locale === "zh" ? "查看全部" : "See all"}<ChevronRight size={16} /></button></div>
    <div ref={categoryTrack} className="health-explorer-categories" role="tablist" aria-label={locale === "zh" ? "健康类别" : "Health categories"}>
      {available.map(({ id, zh, en, icon: Icon }, index) => <button type="button" role="tab" aria-selected={active.id === id} aria-controls="health-explorer-panel" tabIndex={active.id === id ? 0 : -1} key={id} data-health-category={id} onClick={(event) => { select(id); event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" }); }} onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + available.length) % available.length;
        select(available[next].id);
        (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
      }}><span><Icon size={31} strokeWidth={1.65} /></span><strong>{locale === "zh" ? zh : en}</strong></button>)}
    </div>
    <div id="health-explorer-panel" className="health-explorer-panel" role="tabpanel" aria-label={locale === "zh" ? active.zh : active.en}>
      <div className="health-explorer-heading"><h2>{locale === "zh" ? `${active.zh}小趋势` : `${active.en} trends`}</h2><span>{locale === "zh" ? "左右滑动看看" : "Swipe to explore"}</span></div>
      <ChartDeck key={`${active.id}-${date}-${selection.revision}-${initialChart}-${charts[active.id].map((chart) => chart.id).join(",")}`} charts={charts[active.id]} locale={locale} initialIndex={initialChart} onOpenRecord={active.id === "heart" ? undefined : () => onOpenRecord(active.id as Exclude<HealthReportCategory, "heart">)} />
    </div>
    {showAll && <BottomSheet label={locale === "zh" ? "全部图表" : "All charts"} closeLabel={locale === "zh" ? "关闭，也可以向下拖动" : "Close, or drag down"} onClose={() => setShowAll(false)} className="health-explorer-sheet">
      <h2>{locale === "zh" ? "想看看哪一项？" : "What would you like to explore?"}</h2>
      {overview && <p className="health-explorer-overview">{overview}</p>}
      <div className="health-explorer-chart-list">{available.map(({ id, zh, en, icon: Icon }) => <section key={id}><h3><Icon size={20} />{locale === "zh" ? zh : en}</h3>{charts[id].map((chart, index) => <button type="button" key={chart.id} data-select-chart={chart.id} onClick={() => { select(id, index); setShowAll(false); }}><span>{chart.title}</span><ChevronRight size={17} /></button>)}</section>)}</div>
    </BottomSheet>}
  </section>;
}
