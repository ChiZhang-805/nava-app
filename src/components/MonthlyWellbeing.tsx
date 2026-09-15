import { useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import LineTrendChart from "./LineTrendChart";
import { supabase } from "../services/supabaseClient";
import { isDemoMode } from "../services/demo";
import { getTrends } from "../services/records";
import { monthDates, monthlyWellbeing } from "../services/monthlyWellbeing";
import type { MoodRecord, SleepRecord } from "../types";
import "../styles/wellbeing-tools.css";

export default function MonthlyWellbeing({ userId, module, deviceDate, revision, locale, factorLabels = {} }: {
  userId: string; module: "mood" | "sleep"; deviceDate: string; revision: unknown; locale: "zh" | "en"; factorLabels?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [chosenMonth, setMonth] = useState<string | null>(null);
  const month = chosenMonth ?? deviceDate.slice(0, 7);
  const [state, setState] = useState<{ key: string; rows: Array<MoodRecord | SleepRecord>; error?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [selectedDate, setDate] = useState("");
  const key = `${userId}:${module}:${month}:${deviceDate}`;
  const zh = locale === "zh";
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const dates = monthDates(month);
    if (!dates.length || month > deviceDate.slice(0, 7)) return;
    setState(null);
    const lastDate = dates[dates.length - 1];
    const end = lastDate > deviceDate ? deviceDate : lastDate;
    void (async () => {
      try {
        let rows: Array<MoodRecord | SleepRecord>;
        if (isDemoMode()) {
          const bundle = await getTrends(userId, end);
          rows = module === "mood" ? bundle.moods : bundle.sleeps;
        } else {
          // One scoped read, rather than loading all nine domains to draw a single month.
          const result = await supabase.from(module === "mood" ? "mood_records" : "sleep_records")
            .select("*").eq("user_id", userId).gte("record_date", dates[0]).lte("record_date", end)
            .order("record_date").abortSignal(controller.signal);
          if (result.error) throw result.error;
          rows = result.data as Array<MoodRecord | SleepRecord>;
        }
        if (!controller.signal.aborted) setState({ key, rows });
      } catch {
        if (!controller.signal.aborted) setState({ key, rows: [], error: true });
      }
    })();
    return () => controller.abort();
  }, [open, month, deviceDate, module, userId, key, retry, revision]);
  const loaded = state?.key === key ? state : null;
  const summary = useMemo(() => monthlyWellbeing(module, loaded?.rows ?? [], month, deviceDate), [module, loaded, month, deviceDate]);
  const selected = summary.records.find((row) => row.record_date === selectedDate) ?? summary.records[0];
  const valueText = (value: number) => module === "sleep" ? `${(value / 60).toFixed(1)} ${zh ? "小时" : "h"}` : `${Math.round(value)} ${zh ? "分" : "pts"}`;
  return <section className="figma-module-card wellbeing-tool" data-monthly-wellbeing={module}>
    <button type="button" className="wellbeing-heading" aria-expanded={open} onClick={() => setOpen(!open)}><CalendarDays size={20} /><strong>{zh ? "月度回顾" : "Monthly review"}</strong><span>{open ? "−" : "+"}</span></button>
    {open && <div className="wellbeing-body">
      <label className="wellbeing-month">{zh ? "查看月份" : "Month"}<input type="month" min="2000-01" max={deviceDate.slice(0, 7)} value={month} onChange={(event) => { if (monthDates(event.target.value).length && event.target.value <= deviceDate.slice(0, 7)) { setMonth(event.target.value); setDate(""); } }} /></label>
      {!loaded ? <p role="status">{zh ? "正在读取这个月的记录…" : "Loading this month's records…"}</p> : loaded.error ? <div role="alert"><p>{zh ? "月度记录未能读取，请重试。" : "Couldn't load this month. Please retry."}</p><button type="button" className="wellbeing-retry" onClick={() => setRetry(retry + 1)}><RefreshCw size={18} />{zh ? "重新读取" : "Retry"}</button></div> : <>
        <div className="wellbeing-summary"><span>{zh ? "有效记录" : "Recorded"}<strong>{summary.count} {zh ? "天" : "days"}</strong></span><span>{zh ? "有记录日均值" : "Recorded-day average"}<strong>{summary.average === null ? "—" : valueText(summary.average)}</strong></span></div>
        {summary.count > 0 ? <LineTrendChart points={summary.points} scale={module === "mood" ? "score" : "auto"} curve="monotone" showValues={false} dateLabelEvery={5} showArea={false} showConfidenceBand={false} valueFormatter={valueText} ariaLabel={`${month} ${zh ? (module === "mood" ? "情绪月趋势，缺失日留空" : "睡眠时长月趋势，缺失日留空") : `${module} monthly trend, gaps are unrecorded days`}`} /> : <p>{zh ? "这个月还没有可用于趋势的记录。" : "No trend records for this month yet."}</p>}
        <p className="wellbeing-note">{zh ? "空缺和未来日期不计作零；这里只呈现记录，不是预测或 AI 月报。" : "Missing and future days are not zero. These are recorded values, not predictions or an AI monthly report."}</p>
        {module === "mood" && <div className="wellbeing-factors"><strong>{zh ? "常见影响因素" : "Recorded factors"}</strong>{summary.factors.length ? <><p className="wellbeing-note">{zh ? `按 ${summary.count} 个有记录日统计；多选可重叠，不代表因果。` : `Across ${summary.count} recorded days; factors can overlap and do not establish causation.`}</p>{summary.factors.map(([factor, count]) => <div className="wellbeing-factor" key={factor}><span>{factorLabels[factor] ?? factor}</span><meter min={0} max={Math.max(1, summary.count)} value={count} aria-label={`${factorLabels[factor] ?? factor}: ${count}`} /><b>{count} {zh ? "天" : "d"}</b></div>)}</> : <p className="wellbeing-note">{zh ? "没有已记录的影响因素。" : "No factors recorded."}</p>}</div>}
        {selected && <div className="wellbeing-entry"><label>{zh ? "查看当天记录" : "Review a day"}<select value={selected.record_date} onChange={(event) => setDate(event.target.value)}>{summary.records.map((row) => <option key={row.record_date} value={row.record_date}>{row.record_date}</option>)}</select></label>
          <strong>{summary.points.find((point) => point.id === selected.record_date && !point.missing) ? valueText(summary.points.find((point) => point.id === selected.record_date)!.value) : (zh ? "数值未记录" : "Value not recorded")}</strong>
          {module === "mood" ? <p>{(selected as MoodRecord).diary_content || (zh ? "当天未写日记。" : "No journal for this day.")}</p> : <><p>{zh ? "入睡 / 醒来" : "Bedtime / waking"}：{(selected as SleepRecord).sleep_start ?? "—"} / {(selected as SleepRecord).sleep_end ?? "—"}</p><p>{(selected as SleepRecord).self_note || (zh ? "当天没有备注。" : "No note for this day.")}</p></>}
        </div>}
      </>}
    </div>}
  </section>;
}
