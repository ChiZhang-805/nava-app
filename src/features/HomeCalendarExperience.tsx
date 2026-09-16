import type { User } from "@supabase/supabase-js";
import {
  Activity,
  ArrowLeft,
  Brain,
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Dumbbell,
  Frown,
  MoonStar,
  MoreHorizontal,
  ScanFace,
  Target,
  Utensils,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import AnimatedNumber from "../components/AnimatedNumber";
import PageSkeleton from "../components/PageSkeleton";
import { useLocale } from "../i18n";
import {
  buildDailyCoverage,
  buildMonthCells,
  buildYearHeatmap,
  dailyMetrics,
  monthEndISO,
  rhythmScoresByDate,
  shiftMonth,
  type DailyMetric,
} from "../services/homeExperience";
import { getRecordCoverageRange, getTodaySnapshot, getTrends, type RecordCoverage } from "../services/records";
import { buildHealthModuleProgress } from "../services/healthReportPresentation";
import type { TodaySnapshot, TrendBundle } from "../types";

const metricMeta: Record<DailyMetric["key"], { zh: string; en: string; icon: ReactNode }> = {
  mood: { zh: "情绪", en: "Mood", icon: <Frown size={18} /> },
  sleep: { zh: "睡眠", en: "Sleep", icon: <MoonStar size={18} /> },
  exercise: { zh: "运动", en: "Activity", icon: <Dumbbell size={18} /> },
  diet: { zh: "饮食", en: "Diet", icon: <Utensils size={18} /> },
  focus: { zh: "专注", en: "Focus", icon: <Target size={18} /> },
  face: { zh: "面部", en: "Face", icon: <ScanFace size={18} /> },
};

function localDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthTitle(month: string, locale: "zh" | "en") {
  const [year, monthNumber] = month.split("-").map(Number);
  return locale === "zh"
    ? `${year} 年 ${monthNumber} 月`
    : new Date(year, monthNumber - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function dateTitle(date: string, locale: "zh" | "en") {
  return localDate(date).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function CalendarScreen({
  user,
  deviceDate,
  displayMonth,
  setDisplayMonth,
  onOpenDate,
  onBack,
}: {
  user: User;
  deviceDate: string;
  displayMonth: string;
  setDisplayMonth: (month: string) => void;
  onOpenDate: (date: string) => void;
  onBack: () => void;
}) {
  const { locale } = useLocale();
  const [trends, setTrends] = useState<TrendBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayYear, setDisplayYear] = useState(Number(deviceDate.slice(0, 4)));
  const [yearCoverage, setYearCoverage] = useState<RecordCoverage>({});
  const [yearLoading, setYearLoading] = useState(true);
  const [yearError, setYearError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const cells = useMemo(() => buildMonthCells(displayMonth), [displayMonth]);
  const coverage = useMemo(() => trends ? buildDailyCoverage(trends) : {}, [trends]);
  const rhythms = useMemo(() => trends ? rhythmScoresByDate(trends) : {}, [trends]);
  const weekdays = locale === "zh" ? ["一", "二", "三", "四", "五", "六", "日"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const yearHeatmap = useMemo(() => buildYearHeatmap(displayYear), [displayYear]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getTrends(user.id, monthEndISO(displayMonth))
      .then((result) => {
        if (active) setTrends(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [displayMonth, user.id]);

  useEffect(() => {
    let active = true;
    setYearLoading(true);
    setYearError(null);
    getRecordCoverageRange(user.id, `${displayYear}-01-01`, `${displayYear}-12-31`)
      .then((result) => { if (active) setYearCoverage(result); })
      .catch((reason) => {
        if (active) setYearError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (active) setYearLoading(false); });
    return () => { active = false; };
  }, [displayYear, user.id]);

  const monthDates = Object.keys(coverage).filter((date) => date.startsWith(`${displayMonth}-`) && coverage[date].length > 0);
  const monthScores = Object.entries(rhythms).filter(([date]) => date.startsWith(`${displayMonth}-`)).map(([, score]) => score);
  const averageRhythm = monthScores.length > 0 ? Math.round(monthScores.reduce((sum, score) => sum + score, 0) / monthScores.length) : null;
  const yearRecordedDays = Object.values(yearCoverage).filter((domains) => domains.length > 0).length;
  const currentYear = Number(deviceDate.slice(0, 4));

  return (
    <section className="home-experience home-calendar-screen" data-home-view="calendar">
      <header className="home-experience-header">
        <button className="home-experience-back" type="button" onClick={onBack} aria-label={locale === "zh" ? "返回首页" : "Back home"}><ArrowLeft size={22} /></button>
        <div><h1>{locale === "zh" ? "我的月历" : "My calendar"}</h1></div>
        <div className="home-calendar-menu-wrap" ref={menuRef} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
        }}>
          <button ref={menuButtonRef} className="home-calendar-more" type="button" aria-label={locale === "zh" ? "更多月历操作" : "More calendar actions"} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? "home-calendar-menu" : undefined} onClick={() => setMenuOpen((open) => !open)} onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setMenuOpen(true); }
          }}><MoreHorizontal size={23} aria-hidden="true" /></button>
          {menuOpen && <div className="app-utility-popover home-calendar-menu" id="home-calendar-menu" role="menu" aria-label={locale === "zh" ? "月历操作" : "Calendar actions"}>
            <button className="home-calendar-today" type="button" role="menuitem" onClick={() => {
              setDisplayMonth(deviceDate.slice(0, 7));
              setMenuOpen(false);
              menuButtonRef.current?.focus();
            }}><CalendarDays size={18} aria-hidden="true" />{locale === "zh" ? "回到本月" : "Back to this month"}</button>
          </div>}
        </div>
      </header>

      {loading ? <PageSkeleton variant="calendar" calendarWeekCount={cells.length / 7} /> : <><section className="home-calendar-overview">
        <div><CalendarDays size={22} aria-hidden="true" /><span>{locale === "zh" ? "本月记录" : "Recorded"}</span><strong><AnimatedNumber value={monthDates.length} /><small>{locale === "zh" ? " 天" : " days"}</small></strong></div>
        <div><CircleGauge size={22} aria-hidden="true" /><span>{locale === "zh" ? "平均节律" : "Avg. rhythm"}</span><strong>{averageRhythm == null ? "--" : <AnimatedNumber value={averageRhythm} />}<small>{averageRhythm == null ? "" : (locale === "zh" ? " 分" : " pts")}</small></strong></div>
      </section>

      <section className="home-calendar-card">
        <header className="home-calendar-month-switcher">
          <button type="button" onClick={() => setDisplayMonth(shiftMonth(displayMonth, -1))} aria-label={locale === "zh" ? "上个月" : "Previous month"}><ChevronLeft size={22} /></button>
          <h2>{monthTitle(displayMonth, locale)}</h2>
          <button type="button" onClick={() => setDisplayMonth(shiftMonth(displayMonth, 1))} aria-label={locale === "zh" ? "下个月" : "Next month"}><ChevronRight size={22} /></button>
        </header>
        <div className="home-calendar-weekdays">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="home-calendar-grid">
          {cells.map((cell, index) => {
            if (!cell.date || !cell.day) return <span className="home-calendar-spacer" key={`empty-${index}`} aria-hidden="true" />;
            const count = coverage[cell.date]?.length ?? 0;
            const score = rhythms[cell.date];
            return (
              <button
                className={["home-calendar-day", cell.date === deviceDate ? "is-today" : "", count > 0 ? "is-recorded" : ""].filter(Boolean).join(" ")}
                key={cell.date}
                type="button"
                onClick={() => onOpenDate(cell.date as string)}
                data-date={cell.date}
                data-record-count={count}
                aria-label={`${dateTitle(cell.date, locale)} · ${count > 0 ? `${count}${locale === "zh" ? " 项记录" : " records"}` : (locale === "zh" ? "暂无记录" : "No records")}`}
                style={{ "--calendar-day-score": `${score ?? count / 6 * 100}%` } as CSSProperties}
              >
                <b>{cell.day}</b>
                <i aria-hidden="true" />
                <small>{score != null ? score : count > 0 ? `${count}${locale === "zh" ? "项" : ""}` : ""}</small>
              </button>
            );
          })}
        </div>
        <footer className="home-calendar-legend"><span><i />{locale === "zh" ? "已有记录" : "Recorded"}</span><span>{locale === "zh" ? "点击日期查看当日综合报告" : "Tap a date for its daily report"}</span></footer>
      </section>

      <section className="home-year-card" aria-label={locale === "zh" ? `${displayYear} 年年度打卡` : `${displayYear} annual check-ins`} data-year={displayYear} data-week-count={yearHeatmap.weeks.length}>
        <header className="home-year-header">
          <div><strong><CalendarCheck2 size={18} aria-hidden="true" />{locale === "zh" ? "年度打卡" : "Year in review"}</strong><small>{yearLoading ? (locale === "zh" ? "读取中" : "Loading") : `${yearRecordedDays}${locale === "zh" ? " 天有记录" : " recorded days"}`}</small></div>
          <nav aria-label={locale === "zh" ? "切换年份" : "Change year"}>
            <button type="button" onClick={() => setDisplayYear((year) => year - 1)} aria-label={locale === "zh" ? "上一年" : "Previous year"}><ChevronLeft size={15} /></button>
            <b>{displayYear}</b>
            <button type="button" disabled={displayYear >= currentYear} onClick={() => setDisplayYear((year) => Math.min(currentYear, year + 1))} aria-label={locale === "zh" ? "下一年" : "Next year"}><ChevronRight size={15} /></button>
          </nav>
        </header>
        {yearError
          ? <p className="home-year-error" role="alert">{yearError}</p>
          : <div className={yearLoading ? "home-year-heatmap is-loading" : "home-year-heatmap"} style={{ "--year-week-count": yearHeatmap.weeks.length } as CSSProperties}>
              <div className="home-year-months" aria-hidden="true">
                {yearHeatmap.monthLabels.map(({ month, weekIndex }) => <span key={month} style={{ gridColumn: `${weekIndex + 1} / span 4` }}>{locale === "zh" ? `${month}月` : new Date(2024, month - 1, 1).toLocaleDateString("en-US", { month: "short" })}</span>)}
              </div>
              <div className="home-year-weekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
              <div className="home-year-weeks" role="img" aria-label={locale === "zh" ? `${displayYear} 年共 ${yearRecordedDays} 天有记录` : `${yearRecordedDays} recorded days in ${displayYear}`}>
                {yearHeatmap.weeks.map((week, weekIndex) => <div className="home-year-week" key={weekIndex}>
                  {week.map((cell) => {
                    const count = cell.inYear ? (yearCoverage[cell.date]?.length ?? 0) : 0;
                    const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
                    return <span className={cell.inYear ? "home-year-day" : "home-year-day is-outside"} data-date={cell.inYear ? cell.date : undefined} data-level={level} title={cell.inYear ? `${cell.date} · ${count}${locale === "zh" ? " 项记录" : " records"}` : undefined} aria-hidden="true" key={cell.date} />;
                  })}
                </div>)}
              </div>
            </div>}
        <footer className="home-year-legend"><span>{locale === "zh" ? "少" : "Less"}</span>{[0, 1, 2, 3, 4].map((level) => <i data-level={level} key={level} />)}<span>{locale === "zh" ? "多" : "More"}</span></footer>
      </section></>}
      {error && <p className="home-experience-error" role="alert">{error}</p>}
    </section>
  );
}

function DailyReportScreen({ user, date, onBack }: { user: User; date: string; onBack: () => void }) {
  const { locale } = useLocale();
  const [snapshot, setSnapshot] = useState<TodaySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getTodaySnapshot(user.id, date)
      .then((result) => { if (active) setSnapshot(result); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date, user.id]);

  const metrics = snapshot ? dailyMetrics(snapshot, locale) : [];
  const completed = snapshot
    ? Object.values(buildHealthModuleProgress(snapshot)).filter((metric) => metric.completed).length
    : 0;
  const rhythmScore = snapshot?.rhythmScore ?? null;

  return (
    <section className="home-experience home-daily-report" data-home-view="daily" data-report-date={date}>
      <header className="home-experience-header">
        <button className="home-experience-back" type="button" onClick={onBack} aria-label={locale === "zh" ? "返回月历" : "Back to calendar"}><ArrowLeft size={22} /></button>
        <div><h1>{locale === "zh" ? "当日综合报告" : "Daily health report"}</h1></div>
        <span className="home-report-date-icon"><CalendarDays size={21} /></span>
      </header>

      {loading && <PageSkeleton variant="daily-report" />}
      {!loading && snapshot && <>
        <section className="home-report-hero">
          <div className="home-report-rhythm" style={{ "--daily-rhythm-score": `${rhythmScore ?? 0}%` } as CSSProperties}>
            <Activity size={24} />
            <strong>{rhythmScore == null ? "--" : <AnimatedNumber value={rhythmScore} />}</strong>
            <small>{locale === "zh" ? "节律分" : "Rhythm"}</small>
          </div>
          <div className="home-report-summary">
            <span>{locale === "zh" ? "数据完整度" : "Data coverage"}<b>{completed}/6</b></span>
            <div><i style={{ width: `${completed / 6 * 100}%` }} /></div>
            <p>{snapshot.nextAction}</p>
          </div>
        </section>

        <section className="home-report-metrics" aria-label={locale === "zh" ? "六项健康指标" : "Six health metrics"}>
          {metrics.map((metric) => {
            const meta = metricMeta[metric.key];
            return <article className={`home-report-metric is-${metric.key}`} key={metric.key} data-metric={metric.key} data-missing={!metric.recorded}>
              <header><span>{meta.icon}</span><strong>{locale === "zh" ? meta.zh : meta.en}</strong><b>{metric.score == null ? "--" : Math.round(metric.score)}</b></header>
              <div><i style={{ width: `${metric.score ?? 0}%` }} /></div>
              <p>{metric.primary}</p><small>{metric.secondary}</small>
            </article>;
          })}
        </section>

        <section className="home-report-insight">
          <span><Brain size={20} /></span>
          <div><strong>{locale === "zh" ? "NAVA 当日洞察" : "NAVA daily insight"}</strong><p>{completed === 0 ? (locale === "zh" ? "这一天还没有健康记录。补充任意一项后，这里会生成基于当日数据的综合判断。" : "There are no health records for this date yet. Add any record to generate a daily summary.") : snapshot.nextAction}</p></div>
        </section>
      </>}
      {error && <p className="home-experience-error" role="alert">{error}</p>}
    </section>
  );
}

export default function HomeCalendarExperience({
  user,
  deviceDate,
  view,
  onOpenDate,
  onBack,
}: {
  user: User;
  deviceDate: string;
  view: string;
  onOpenDate: (date: string) => void;
  onBack: (fallbackView: string | null) => void;
}) {
  const [displayMonth, setDisplayMonth] = useState(deviceDate.slice(0, 7));
  const selectedDate = view.startsWith("day-") ? view.slice(4) : null;
  if (selectedDate) return <DailyReportScreen user={user} date={selectedDate} onBack={() => onBack("calendar")} />;
  return <CalendarScreen user={user} deviceDate={deviceDate} displayMonth={displayMonth} setDisplayMonth={setDisplayMonth} onOpenDate={onOpenDate} onBack={() => onBack(null)} />;
}
