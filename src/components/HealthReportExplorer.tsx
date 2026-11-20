import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BedDouble, ChevronRight, ClipboardPlus, HeartPulse, ImageOff, RotateCw, ScanFace, SmilePlus, Timer, Utensils, Dumbbell, Zap } from "lucide-react";
import type { TrendBundle } from "../types";
import { buildHealthReportCharts, type HealthReportCategory, type HealthReportChart } from "../services/healthReportExplorer";
import { buildHealthReportDishes, type HealthReportDish } from "../services/healthReportMeals";
import { resolveDietPhotoUrl } from "../services/media";
import { isDemoMode } from "../services/demo";
import { getFoodRenderJobs, resolveFoodRenderUrl, type FoodRenderJob } from '../services/foodRenderJobs';
import { shiftDateISO } from '../services/date';
import LineTrendChart from "./LineTrendChart";
import "../styles/health-report-explorer.css";

const categories = [
  { id: "mood", zh: "情绪", en: "Mood", icon: SmilePlus },
  { id: "face", zh: "面部", en: "Face", icon: ScanFace },
  { id: "focus", zh: "专注", en: "Focus", icon: Timer },
  { id: "sleep", zh: "睡眠", en: "Sleep", icon: BedDouble },
  { id: "exercise", zh: "运动", en: "Activity", icon: Dumbbell },
  { id: "diet", zh: "饮食", en: "Diet", icon: Utensils },
  { id: "energy", zh: "能量", en: "Energy", icon: Zap },
  { id: "heart", zh: "心率", en: "Heart", icon: HeartPulse },
] as const;

function CategoryImage({ category }: { category: typeof categories[number] }) {
  const [failed, setFailed] = useState(false);
  if (category.id === "heart" || failed) return <category.icon size={30} strokeWidth={1.7} aria-hidden="true" />;
  return <img src={`${import.meta.env.BASE_URL}assets/health-report/${category.id}.webp`} alt="" draggable={false} onError={() => setFailed(true)} />;
}

type CardInteractionProps = { locale: "zh" | "en"; active: boolean; flipped: boolean; onFlip: () => void; onSelect: () => void; onOpenRecord?: () => void };

function FlipCard({ id, title, kind = "chart", locale, active, flipped, onFlip, onSelect, onOpenRecord, front, details }: CardInteractionProps & {
  id: string; title: string; kind?: "chart" | "meal" | "empty-meal"; front: ReactNode; details: ReactNode;
}) {
  return <article className="health-explorer-card" data-chart-id={id} data-card-kind={kind} data-active={active} data-side={flipped ? "back" : "front"} aria-hidden={!active} aria-label={title}>
    {!active && <button type="button" tabIndex={-1} className="health-explorer-neighbor" data-target-id={id} aria-label={title} onClick={onSelect} />}
    <button type="button" className="health-explorer-flip" aria-label={flipped ? (locale === "zh" ? "回到正面" : "Back to front") : (locale === "zh" ? "查看明细" : "View details")} aria-pressed={flipped} disabled={!active} onClick={(event) => { event.stopPropagation(); onFlip(); }}><RotateCw size={21} /></button>
    <div className="health-explorer-card-turn">
      <div className="health-explorer-front" aria-hidden={!active || flipped} ref={(node) => { if (node) node.inert = !active || flipped; }}>
        <h3><span>{title}</span></h3>
        {front}
      </div>
      <div className="health-explorer-back" aria-hidden={!active || !flipped} ref={(node) => { if (node) node.inert = !active || !flipped; }}>
        <h3><span>{title}</span></h3>
        <div className="health-explorer-details">{details}</div>
        {onOpenRecord && <button type="button" className="health-explorer-record" onClick={onOpenRecord}>{locale === "zh" ? "查看 / 补充记录" : "View / add entries"}<ChevronRight size={17} /></button>}
      </div>
    </div>
  </article>;
}

function ReportCard({ chart, ...interaction }: CardInteractionProps & { chart: HealthReportChart }) {
  const { locale, active, flipped } = interaction;
  const recorded = chart.points.filter((point) => !point.missing);
  const latest = recorded[recorded.length - 1];
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return <FlipCard {...interaction} id={chart.id} title={chart.title} front={<>
    <div className="health-explorer-value"><strong>{latest ? format(latest.value) : "—"}</strong><span>{latest ? chart.unit : (locale === "zh" ? "还没有记录" : "No entries yet")}</span></div>
    <div className="health-explorer-plot">
      {latest ? <LineTrendChart points={chart.points} ariaLabel={chart.title} tone="rhythm" scale="auto" domain={chart.domain} presentation="report" showYAxis={false} animateReport={active && !flipped} curve="monotone" showValues={false} dateLabelEvery={2} showConfidenceBand={false} valueFormatter={format} /> : <div className="health-explorer-empty"><ClipboardPlus size={38} strokeWidth={1.4} /><p>{locale === "zh" ? "记下一笔，让趋势慢慢出现。" : "Add an entry to begin your trend."}</p></div>}
    </div>
  </>} details={<>
          <p className="health-explorer-description">{chart.description}</p>
          <p className="health-explorer-range">{chart.points[0]?.id} — {chart.points[chart.points.length - 1]?.id}<br />{locale === "zh" ? `${recorded.length} 天有数据` : `${recorded.length} ${recorded.length === 1 ? "day" : "days"} with data`}</p>
          <h4>{locale === "zh" ? "最近记录" : "Recent entries"}</h4>
          {recorded.length ? <dl>{recorded.slice(-5).reverse().map((point) => <div key={point.id} data-record-date={point.id} data-record-value={point.value}><dt>{point.id}</dt><dd>{format(point.value)} <span>{chart.unit}</span></dd></div>)}</dl> : <p>{locale === "zh" ? "这段时间还没有记录，缺失不会算作零。" : "No entries in this period. Missing values are not zero."}</p>}
  </>} />;
}

type ReportSlide = { kind: "chart"; id: string; title: string; chart: HealthReportChart }
  | { kind: "meal"; id: string; title: string; dish: HealthReportDish }
  | { kind: "empty-meal"; id: string; title: string };
type ResolvePhoto = (path: string) => Promise<string | null>;

function DishPhoto({ dish, active, locale, resolvePhoto }: { dish: HealthReportDish; active: boolean; locale: "zh" | "en"; resolvePhoto: ResolvePhoto }) {
  const [resolved, setResolved] = useState<{ path: string; url: string | null } | null>(null);
  const [failedIllustration, setFailedIllustration] = useState<string | null>(null);
  const displayPath = dish.renderPath ? `render:${dish.renderPath}` : dish.photoPath;
  useEffect(() => {
    if (!active || !displayPath) return;
    let current = true;
    const path = displayPath;
    void resolvePhoto(path).then(url => { if (current) setResolved({ path, url }); });
    return () => { current = false; };
  }, [active, displayPath, resolvePhoto]);
  const url = resolved?.path === displayPath ? resolved?.url : null;
  const photoFailed = Boolean(displayPath && resolved?.path === displayPath && !url);
  const illustration = !displayPath && dish.illustrationSrc && failedIllustration !== dish.illustrationSrc ? dish.illustrationSrc : null;
  const unavailable = photoFailed || Boolean(dish.illustrationSrc && failedIllustration === dish.illustrationSrc);
  const pending = dish.renderState === 'queued' || dish.renderState === 'processing';
  return <figure className="health-explorer-meal-visual" data-photo-kind={url ? dish.renderPath ? 'generated' : dish.photoKind : illustration ? "illustration" : "empty"}>
    {url ? <img src={url} alt={dish.title} draggable={false} onError={() => setResolved({ path: displayPath!, url: null })} /> : illustration ? <img src={`${import.meta.env.BASE_URL}${illustration}`} alt={locale === "zh" ? `${dish.title}示意图` : `Illustration of ${dish.title}`} draggable={false} onError={() => setFailedIllustration(illustration)} /> : <div className="health-explorer-photo-empty"><ImageOff size={30} strokeWidth={1.4} /><span>{unavailable ? (locale === "zh" ? "图片暂时没加载出来" : "Image is unavailable") : displayPath ? (locale === "zh" ? "图片加载中…" : "Loading image…") : pending ? (locale === "zh" ? "餐食已记好，配图准备中" : "Meal saved · image is on its way") : dish.renderState === 'failed' ? (locale === "zh" ? "餐食已记好，配图暂不可用" : "Meal saved · image unavailable") : (locale === "zh" ? "还没有餐食照片" : "No meal photo yet")}</span></div>}
    {(url || illustration) && <figcaption>{dish.renderPath ? (locale === 'zh' ? 'AI 餐食示意图' : 'AI meal illustration') : url ? (dish.photoKind === "meal" ? (locale === "zh" ? "这餐的照片" : "Photo of this meal") : (locale === "zh" ? "这道菜的照片" : "Photo of this dish")) : (locale === "zh" ? "食物示意图" : "Food illustration")}</figcaption>}
  </figure>;
}

function MealNutrients({ nutrients, locale, front = false }: { nutrients: HealthReportDish["nutrients"]; locale: "zh" | "en"; front?: boolean }) {
  const t = (zh: string, en: string) => locale === "zh" ? zh : en;
  const rows = [
    { id: "calories", label: t("热量", "Energy"), value: nutrients.calories, unit: "kcal" },
    { id: "protein", label: t("蛋白质", "Protein"), value: nutrients.protein, unit: "g" },
    { id: "carbs", label: t(front ? "碳水" : "碳水化合物", "Carbohydrate"), value: nutrients.carbs, unit: "g" },
    { id: "fat", label: t("脂肪", "Fat"), value: nutrients.fat, unit: "g" },
  ].filter(item => front || item.value !== null);
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return <dl className={front ? "health-explorer-front-nutrition" : "health-explorer-nutrients"}>{rows.map(item => <div key={item.id} data-front-nutrient={front ? item.id : undefined} data-front-nutrient-value={front ? item.value ?? undefined : undefined} data-nutrient={!front ? item.id : undefined} data-nutrient-value={!front ? item.value ?? undefined : undefined} data-missing={item.value === null}><dt>{item.label}</dt><dd aria-label={item.value === null ? t("未记录", "Not recorded") : undefined}>{item.value === null ? "—" : <>{format(item.value)} <span>{item.unit}</span></>}</dd></div>)}</dl>;
}

function MealCard({ slide, resolvePhoto, ...interaction }: CardInteractionProps & { slide: Extract<ReportSlide, { kind: "meal" | "empty-meal" }>; resolvePhoto: ResolvePhoto }) {
  const { locale, active } = interaction;
  const dish = slide.kind === "meal" ? slide.dish : null;
  const t = (zh: string, en: string) => locale === "zh" ? zh : en;
  const hasNutrients = dish && Object.values(dish.nutrients).some(value => value !== null);
  return <FlipCard {...interaction} id={slide.id} title={slide.title} kind={slide.kind} front={dish ? <>
    <DishPhoto dish={dish} active={active} locale={locale} resolvePhoto={resolvePhoto} />
    <MealNutrients nutrients={dish.nutrients} locale={locale} front />
    <div className="health-explorer-meal-meta"><p className="health-explorer-meal-date">{dish.date} · {dish.meal}{dish.time ? ` · ${dish.time}` : ""}</p>{dish.estimated && <span className="health-explorer-meal-estimate">{t("含估算", "Estimated")}</span>}</div>
  </> : <div className="health-explorer-empty health-explorer-empty-meal"><ImageOff size={30} strokeWidth={1.4} /><p>{t("还没有饮食记录", "No meals logged yet")}</p></div>} details={dish ? <>
    <p className="health-explorer-dish-name">{dish.title}</p>
    <p className="health-explorer-range">{dish.date} · {dish.meal}{dish.time ? ` · ${dish.time}` : ""}</p>
    {dish.amount && <p>{t("份量", "Amount")}：{dish.amount}</p>}
    {hasNutrients ? <><h4>{t("营养记录", "Logged nutrition")}</h4><MealNutrients nutrients={dish.nutrients} locale={locale} /><p className="health-explorer-nutrition-note">{dish.estimated ? t("这条记录包含估算值。", "This entry includes estimates.") : t("仅显示这条记录中已有的数值。", "Only values saved in this entry are shown.")}</p></> : <p>{t("这条记录还没有营养数值。", "Nutrition values have not been logged for this entry.")}</p>}
    {dish.notes && <p className="health-explorer-meal-notes">{dish.notes}</p>}
  </> : <p>{t("这里会放你实际记录的餐食，未填写的营养数值不会当作零。", "Your logged meals will appear here. Missing nutrition values are not counted as zero.")}</p>} />;
}

function ChartDeck({ cards, locale, initialIndex, onOpenRecord }: {
  cards: ReportSlide[]; locale: "zh" | "en"; initialIndex: number; onOpenRecord?: () => void;
}) {
  const count = cards.length;
  const repeated = count > 1;
  const slides = repeated ? [...cards, ...cards, ...cards] : cards;
  const firstPosition = (repeated ? count : 0) + Math.min(initialIndex, count - 1);
  const [position, setPosition] = useState(firstPosition);
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const activeChartId = useRef(slides[firstPosition].id);
  const track = useRef<HTMLDivElement | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocus = useRef<{ index: number; selector: string } | null>(null);
  const photoRequests = useRef(new Map<string, Promise<string | null>>());
  const resolvePhoto = useCallback((path: string) => {
    const cached = photoRequests.current.get(path);
    if (cached) return cached;
    const request = (path.startsWith('render:') ? resolveFoodRenderUrl(path.slice(7)) : resolveDietPhotoUrl(path)).catch(() => null);
    photoRequests.current.set(path, request);
    return request;
  }, []);
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
    <div ref={initialScroll} className="health-explorer-track" role="region" aria-roledescription={locale === "zh" ? "轮播卡片" : "carousel"} aria-label={locale === "zh" ? "左右滑动查看记录" : "Swipe to explore records"} tabIndex={0} onKeyDown={onKeyDown} onScroll={(event) => {
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
      {slides.map((slide, index) => {
        const interaction = { locale, active: index === position, flipped: index === position && flippedId === slide.id, onFlip: () => setFlippedId(id => id === slide.id ? null : slide.id), onSelect: () => go(index), onOpenRecord };
        return slide.kind === "chart" ? <ReportCard key={`${slide.id}-${index}`} chart={slide.chart} {...interaction} /> : <MealCard key={`${slide.id}-${index}`} slide={slide} resolvePhoto={resolvePhoto} {...interaction} />;
      })}
    </div>
    <span className="sr-only" aria-live="polite">{slides[position]?.title} · {position % count + 1}/{count}</span>
  </div>;
}

export default function HealthReportExplorer({ bundle, date, locale, userId, onOpenRecord, onOpenWeekly, onCloseWeekly, showWeekly = false, weeklyContent }: {
  bundle: TrendBundle | null; date: string; locale: "zh" | "en";
  userId?: string;
  onOpenRecord: (category: Exclude<HealthReportCategory, "heart" | "energy">) => void;
  onOpenWeekly?: () => void;
  onCloseWeekly?: () => void; showWeekly?: boolean; weeklyContent?: ReactNode;
}) {
  const charts = useMemo(() => buildHealthReportCharts(bundle, date, locale), [bundle, date, locale]);
  const [liveRenders, setLiveRenders] = useState<{ owner: string; date: string; rows: FoodRenderJob[] } | null>(null);
  useEffect(() => {
    if (!userId || isDemoMode()) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    // Poll only already-persisted metadata. A report can never enqueue or retry a job.
    const read = async () => {
      try {
        const rows = await getFoodRenderJobs(userId, shiftDateISO(date, -6), date);
        if (!alive) return;
        setLiveRenders({ owner: userId, date, rows });
        if (rows.some(row => row.state === 'queued' || row.state === 'processing')) timer = setTimeout(() => void read(), 8000);
      } catch { /* Keep saved evidence visible when metadata cannot be refreshed. */ }
    };
    void read();
    return () => { alive = false; clearTimeout(timer); };
  }, [userId, date, bundle]);
  const dishes = useMemo(() => buildHealthReportDishes(bundle ? { ...bundle, foodRenders: liveRenders?.owner === userId && liveRenders?.date === date ? liveRenders.rows : bundle.foodRenders } : bundle, date, locale, { demoIllustrations: isDemoMode() }), [bundle, date, locale, liveRenders, userId]);
  const [selection, setSelection] = useState<{ category: HealthReportCategory; chart: number; revision: number }>({ category: "mood", chart: -1, revision: 0 });
  const categoryTrack = useRef<HTMLDivElement>(null);
  const available = categories.filter((category) => category.id !== "heart" || charts.heart.length > 0);
  const active = available.find((category) => category.id === selection.category) ?? available[0];
  const select = (category: HealthReportCategory, chart = -1) => {
    onCloseWeekly?.();
    setSelection((current) => ({ category, chart, revision: current.revision + 1 }));
  };
  const tabIds: (HealthReportCategory | "all")[] = [...(onOpenWeekly ? ["all" as const] : []), ...available.map((category) => category.id)];
  const onCategoryKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: HealthReportCategory | "all") => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = tabIds.indexOf(id);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabIds.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabIds.length) % tabIds.length;
    const target = tabIds[next];
    if (target === "all") onOpenWeekly?.(); else select(target);
    (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
  };
  const cards: ReportSlide[] = active.id === "diet"
    ? dishes.length ? dishes.map(dish => ({ kind: "meal", id: dish.id, title: dish.title, dish })) : [{ kind: "empty-meal", id: "diet-empty", title: locale === "zh" ? "饮食记录" : "Meal records" }]
    : charts[active.id].map(chart => ({ kind: "chart", id: chart.id, title: chart.title, chart }));
  const initialChart = selection.chart < 0 ? Math.max(0, cards.findIndex(card => card.kind !== "chart" || card.chart.points.some(point => !point.missing))) : selection.chart;
  useEffect(() => {
    const node = categoryTrack.current;
    const tab = node?.querySelector<HTMLElement>(`[data-health-category="${showWeekly ? "all" : active.id}"]`);
    if (!node || !tab) return;
    const bounds = node.getBoundingClientRect(), target = tab.getBoundingClientRect();
    if (target.left < bounds.left) node.scrollLeft += target.left - bounds.left;
    else if (target.right > bounds.right) node.scrollLeft += target.right - bounds.right;
  }, [active.id, showWeekly]);
  return <section className="health-report-explorer" data-health-explorer data-category={showWeekly ? "all" : active.id}>
    <div className="health-explorer-toolbar"><h2><img src={`${import.meta.env.BASE_URL}assets/health-report/rhythm.webp`} alt="" draggable={false} />{locale === "zh" ? "我的节律" : "My rhythm"}</h2></div>
    <div ref={categoryTrack} className="health-explorer-categories" role="tablist" aria-label={locale === "zh" ? "健康类别" : "Health categories"}>
      {onOpenWeekly && <button type="button" role="tab" aria-selected={showWeekly} aria-controls="health-explorer-panel" tabIndex={showWeekly ? 0 : -1} data-health-category="all" aria-label={locale === "zh" ? "全部，本周记录" : "All, this week's entries"} onClick={onOpenWeekly} onKeyDown={(event) => onCategoryKeyDown(event, "all")}><span><img src={`${import.meta.env.BASE_URL}assets/health-report/all.webp`} alt="" draggable={false} /></span><strong>{locale === "zh" ? "全部" : "All"}</strong></button>}
      {available.map((category) => <button type="button" role="tab" aria-selected={!showWeekly && active.id === category.id} aria-controls="health-explorer-panel" tabIndex={!showWeekly && active.id === category.id ? 0 : -1} key={category.id} data-health-category={category.id} onClick={() => select(category.id)} onKeyDown={(event) => onCategoryKeyDown(event, category.id)}><span><CategoryImage category={category} /></span><strong>{locale === "zh" ? category.zh : category.en}</strong></button>)}
    </div>
    <div id="health-explorer-panel" className="health-explorer-panel" role="tabpanel" aria-label={showWeekly ? (locale === "zh" ? "本周记录" : "This week's entries") : (locale === "zh" ? active.zh : active.en)}>
      {showWeekly ? <div className="health-explorer-weekly-content">{weeklyContent}</div> : <><div className="health-explorer-heading"><h2><CategoryImage key={active.id} category={active} />{locale === "zh" ? `${active.zh}记录` : `${active.en} records`}</h2></div>
      <ChartDeck key={`${active.id}-${date}-${selection.revision}-${initialChart}-${cards.map(card => card.id).join(",")}`} cards={cards} locale={locale} initialIndex={initialChart} onOpenRecord={active.id === "heart" ? undefined : () => onOpenRecord(active.id === "energy" ? "diet" : active.id)} />
      </>}
    </div>
  </section>;
}
