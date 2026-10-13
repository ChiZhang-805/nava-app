import type { CSSProperties } from "react";
import { useLocale } from "../i18n";
import homeMascot from "../assets/figma/home-option2/home-mascot-v5.png";
import idleMascot from "../assets/mascot/animated/home-idle.webp";
import loadingMascot from "../assets/mascot/animated/loading-spin.webp";
import MascotImage from "./MascotImage";
import homeSceneBackground from "../assets/figma/home-option2/home-scene-v3.png";

export type PageSkeletonVariant =
  | "auth"
  | "today"
  | "records"
  | "record-detail-mood"
  | "record-detail-sleep"
  | "record-detail-exercise"
  | "record-detail-diet"
  | "record-detail-focus"
  | "record-detail-face"
  | "record-editor-mood"
  | "record-editor-sleep"
  | "record-editor-exercise"
  | "record-editor-diet"
  | "record-editor-focus"
  | "record-editor-face"
  | "ai"
  | "growth"
  | "profile"
  | "calendar"
  | "daily-report"
  | "advanced-profile";

export function SkeletonBlock({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span className={["nava-skeleton-block", className].filter(Boolean).join(" ")} style={style} aria-hidden="true" />;
}

export function SkeletonLines({ count = 3, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <span className={["nava-skeleton-lines", compact ? "is-compact" : ""].filter(Boolean).join(" ")} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <SkeletonBlock className="nava-skeleton-line" key={index} style={{ width: index === count - 1 ? "64%" : index % 2 ? "88%" : "100%" }} />
      ))}
    </span>
  );
}

export function SkeletonBars({ count = 7 }: { count?: number }) {
  const heights = [46, 68, 55, 84, 62, 76, 50, 70];
  return (
    <span className="nava-skeleton-bars" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span className="nava-skeleton-bar-column" key={index}>
          <SkeletonBlock className="nava-skeleton-bar" style={{ height: `${heights[index % heights.length]}%` }} />
          <SkeletonBlock className="nava-skeleton-date" />
        </span>
      ))}
    </span>
  );
}

function RecordsSkeleton() {
  return <>
    <section className="page-skeleton-tabs"><SkeletonBlock /><SkeletonBlock /></section>
    <SkeletonBlock className="page-skeleton-date" />
    <section className="page-skeleton-record-grid">
      {Array.from({ length: 6 }, (_, index) => <article className="page-skeleton-record-card" key={index}>
        <div><SkeletonBlock className="is-title" /><SkeletonBlock className="is-circle" /></div>
        <SkeletonLines count={4} compact />
      </article>)}
    </section>
  </>;
}

type RecordSkeletonModule = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";

function DetailHeading({ actions = 1 }: { actions?: number }) {
  return <div className="page-skeleton-detail-heading"><SkeletonBlock className="is-title" /><span>{Array.from({ length: actions }, (_, index) => <SkeletonBlock className="is-circle" key={index} />)}</span></div>;
}

function RecordDetailSkeleton({ module }: { module: RecordSkeletonModule }) {
  if (module === "mood") return <>
    <section className="page-skeleton-card page-skeleton-mood-summary"><DetailHeading /><div className="page-skeleton-score-line"><SkeletonBlock className="is-score" /><SkeletonBlock /><SkeletonBlock /></div><SkeletonBlock className="is-track" /></section>
    <section className="page-skeleton-card page-skeleton-mood-entry"><DetailHeading actions={0} /><div className="page-skeleton-choice-row">{Array.from({ length: 5 }, (_, index) => <SkeletonBlock className="is-circle" key={index} />)}</div><SkeletonBlock className="is-track" /><div className="page-skeleton-chip-grid">{Array.from({ length: 9 }, (_, index) => <SkeletonBlock key={index} />)}</div><SkeletonBlock className="is-button" /></section>
    <section className="page-skeleton-card page-skeleton-chart-card"><DetailHeading /><SkeletonBars /></section>
  </>;

  if (module === "sleep") return <>
    <section className="page-skeleton-card page-skeleton-detail-alert"><SkeletonBlock className="is-circle" /><SkeletonLines count={2} compact /><SkeletonBlock className="is-circle" /></section>
    <section className="page-skeleton-card page-skeleton-sleep-summary"><DetailHeading /><SkeletonBlock className="is-track" /><div className="page-skeleton-orb-metrics"><SkeletonBlock className="is-orb" /><SkeletonLines count={3} /></div></section>
    <section className="page-skeleton-card page-skeleton-chart-card"><DetailHeading actions={2} /><SkeletonBars /></section>
    <section className="page-skeleton-card is-short"><SkeletonLines count={2} /></section>
  </>;

  if (module === "exercise") return <>
    <section className="page-skeleton-card page-skeleton-record-summary"><DetailHeading /><div className="page-skeleton-metric-row"><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div></section>
    <section className="page-skeleton-card page-skeleton-device-overview"><DetailHeading /><SkeletonBlock className="is-field" /><div className="page-skeleton-metric-row"><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div><SkeletonBlock className="is-button" /></section>
    <section className="page-skeleton-card page-skeleton-chart-card"><DetailHeading /><SkeletonBars /></section>
  </>;

  if (module === "diet") return <>
    <section className="page-skeleton-card page-skeleton-diet-summary"><DetailHeading /><div className="page-skeleton-metric-row is-four"><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div><div className="page-skeleton-energy-row"><SkeletonBlock className="is-orb" /><SkeletonLines count={2} compact /></div></section>
    <section className="page-skeleton-card page-skeleton-meal-card"><DetailHeading /><div className="page-skeleton-meal-grid">{Array.from({ length: 4 }, (_, index) => <SkeletonBlock key={index} />)}</div></section>
    <section className="page-skeleton-card page-skeleton-chart-card"><DetailHeading /><SkeletonBars /></section>
  </>;

  if (module === "focus") return <>
    <section className="page-skeleton-card page-skeleton-focus-summary"><span><SkeletonBlock className="is-title" /><SkeletonLines count={1} compact /></span><SkeletonBlock className="is-orb" /></section>
    <section className="page-skeleton-focus-controls">{Array.from({ length: 3 }, (_, index) => <SkeletonBlock key={index} />)}</section>
    <section className="page-skeleton-card page-skeleton-chart-card"><DetailHeading actions={3} /><SkeletonBars /></section>
    <section className="page-skeleton-card page-skeleton-focus-todos"><DetailHeading actions={2} /><SkeletonBlock className="is-field" /><div className="page-skeleton-metric-row"><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div></section>
  </>;

  return <>
    <section className="page-skeleton-card page-skeleton-face-notice"><SkeletonBlock className="is-circle" /><SkeletonLines count={2} compact /></section>
    <section className="page-skeleton-card page-skeleton-face-summary"><DetailHeading actions={2} /><div className="page-skeleton-orb-metrics"><SkeletonBlock className="is-orb" /><SkeletonLines count={3} /></div><div className="page-skeleton-face-feedback"><SkeletonBlock className="is-circle" /><SkeletonLines count={1} compact /></div></section>
    <section className="page-skeleton-card page-skeleton-chart-card"><DetailHeading /><SkeletonBars /></section>
    <section className="page-skeleton-card is-short"><SkeletonLines count={2} /></section>
  </>;
}

type RecordEditorSkeletonModule = RecordSkeletonModule;

function EditorSkeletonHeader({ actions = 0 }: { actions?: number }) {
  return <div className="page-skeleton-editor-heading"><span className="is-heading-title"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-title" /></span>{actions > 0 && <span className="is-heading-actions">{Array.from({ length: actions }, (_, index) => <SkeletonBlock className="is-circle" key={index} />)}</span>}</div>;
}

function EditorSkeletonFields({ count, twoColumn = false }: { count: number; twoColumn?: boolean }) {
  return <div className={twoColumn ? "page-skeleton-editor-fields is-two-column" : "page-skeleton-editor-fields"}>{Array.from({ length: count }, (_, index) => <span key={index}><SkeletonBlock className="is-label" /><SkeletonBlock className="is-field" /></span>)}</div>;
}

function RecordEditorSkeleton({ module }: { module: RecordEditorSkeletonModule }) {
  let body;
  if (module === "mood") body = <>
    <EditorSkeletonHeader actions={1} />
    <div className="page-skeleton-editor-score"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-score" /></div>
    <SkeletonBlock className="is-track" />
    <div className="page-skeleton-editor-chips">{Array.from({ length: 9 }, (_, index) => <SkeletonBlock key={index} />)}</div>
    <div className="page-skeleton-editor-note"><SkeletonBlock className="is-label" /><SkeletonBlock className="is-field" /></div>
    <SkeletonBlock className="is-button" />
  </>;
  else if (module === "sleep") body = <>
    <EditorSkeletonHeader actions={4} />
    <EditorSkeletonFields count={6} twoColumn />
    <SkeletonBlock className="is-track" />
    <div className="page-skeleton-editor-note"><SkeletonBlock className="is-label" /><SkeletonBlock className="is-field" /></div>
    <SkeletonBlock className="is-button" />
  </>;
  else if (module === "exercise") body = <>
    <EditorSkeletonHeader actions={1} />
    <EditorSkeletonFields count={5} twoColumn />
    <div className="page-skeleton-editor-note"><SkeletonBlock className="is-label" /><SkeletonBlock className="is-field" /></div>
    <SkeletonBlock className="is-button" />
  </>;
  else if (module === "diet") body = <>
    <EditorSkeletonHeader actions={5} />
    <SkeletonBlock className="page-skeleton-editor-photo" />
    <div className="page-skeleton-editor-photo-actions"><SkeletonBlock /><SkeletonBlock /></div>
    <EditorSkeletonFields count={2} twoColumn />
    <div className="page-skeleton-editor-food"><SkeletonBlock className="is-label" /><SkeletonLines count={2} compact /></div>
    <EditorSkeletonFields count={4} twoColumn />
    <SkeletonBlock className="is-button" />
  </>;
  else if (module === "focus") body = <>
    <EditorSkeletonHeader actions={3} />
    <EditorSkeletonFields count={2} />
    <div className="page-skeleton-editor-note is-large"><SkeletonBlock className="is-label" /><SkeletonBlock className="is-field" /></div>
    <SkeletonBlock className="is-button" />
  </>;
  else body = <>
    <EditorSkeletonHeader actions={3} />
    <SkeletonBlock className="page-skeleton-editor-photo is-face" />
    <div className="page-skeleton-editor-photo-actions"><SkeletonBlock /><SkeletonBlock /></div>
    <section className="page-skeleton-editor-ai"><span><SkeletonBlock className="is-title" /><SkeletonLines count={3} compact /></span><SkeletonBlock className="is-orb" /></section>
  </>;

  return <section className={`page-skeleton-card page-skeleton-editor-card is-${module}`}>{body}</section>;
}

function AiSkeleton() {
  return <>
    <section className="page-skeleton-chat-list">
      <div className="page-skeleton-message assistant"><SkeletonBlock className="is-circle" /><span><SkeletonLines count={3} /></span></div>
      <div className="page-skeleton-message user"><span><SkeletonLines count={2} compact /></span><SkeletonBlock className="is-circle" /></div>
      <div className="page-skeleton-message assistant"><SkeletonBlock className="is-circle" /><span><SkeletonLines count={4} /></span></div>
    </section>
    <section className="page-skeleton-composer"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-input" /><SkeletonBlock className="is-circle" /></section>
  </>;
}

function GrowthSkeleton() {
  return <>
    <section className="page-skeleton-card page-skeleton-growth-summary"><SkeletonBlock className="is-orb" /><span className="page-skeleton-growth-copy"><SkeletonBlock className="is-title" /><SkeletonBlock className="is-score" /><SkeletonBlock className="is-track" /></span><SkeletonBlock className="is-circle" /></section>
    <div className="page-skeleton-heading"><span className="page-skeleton-heading-copy"><SkeletonBlock className="is-kicker" /><SkeletonBlock className="is-heading" /></span><SkeletonBlock className="is-circle" /></div>
    <section className="page-skeleton-task-group"><SkeletonBlock className="is-label" />{Array.from({ length: 2 }, (_, index) => <article key={index}><SkeletonBlock className="is-circle" /><SkeletonLines count={2} compact /><SkeletonBlock className="is-meta" /></article>)}</section>
    <section className="page-skeleton-task-group"><SkeletonBlock className="is-label" />{Array.from({ length: 4 }, (_, index) => <article key={index}><SkeletonBlock className="is-circle" /><SkeletonLines count={2} compact /><SkeletonBlock className="is-meta" /></article>)}</section>
  </>;
}

function ProfileSkeleton() {
  const quarterWeekCount = 14;
  return <>
    <section className="section-card profile-overview-account page-skeleton-profile-account">
      <div className="section-heading page-skeleton-profile-heading"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-section-title" /></div>
      <div className="profile-account-entry page-skeleton-profile-account-entry"><SkeletonBlock className="is-avatar" /><SkeletonLines count={2} compact /><SkeletonBlock className="is-circle" /></div>
    </section>
    <section className="section-card profile-quarter-card page-skeleton-profile-quarter">
      <header className="profile-quarter-header page-skeleton-profile-quarter-header">
        <h2><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-section-title" /></h2>
        <nav aria-hidden="true"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-value" /><SkeletonBlock className="is-circle" /></nav>
      </header>
      <div className="profile-quarter-heatmap page-skeleton-profile-quarter-heatmap" style={{ "--profile-quarter-week-count": quarterWeekCount } as CSSProperties}>
        <div className="profile-quarter-months page-skeleton-profile-quarter-months" aria-hidden="true">
          {[1, 2, 3].map((month, index) => <SkeletonBlock key={month} style={{ gridColumn: `${index * 5 + 1} / span ${index === 2 ? 4 : 5}` }} />)}
        </div>
        <div className="profile-quarter-weekdays page-skeleton-profile-quarter-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <SkeletonBlock key={index} />)}</div>
        <div className="profile-quarter-weeks page-skeleton-profile-quarter-grid" aria-hidden="true">
          {Array.from({ length: quarterWeekCount * 7 }, (_, index) => <SkeletonBlock className="profile-quarter-day page-skeleton-profile-quarter-day" key={index} />)}
        </div>
      </div>
    </section>
    <section className="section-card profile-entry-card page-skeleton-profile-entries">
      <header className="profile-entry-header page-skeleton-profile-entry-header"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-section-title" /></header>
      {Array.from({ length: 8 }, (_, index) => <div className="profile-nav-row page-skeleton-profile-entry-row" key={index}><SkeletonBlock className="is-title" /><span><SkeletonBlock className="is-value" /><SkeletonBlock className="is-circle" /></span></div>)}
    </section>
  </>;
}

function TodaySkeleton() {
  return <>
    <img className="page-skeleton-home-background" src={homeSceneBackground} alt="" aria-hidden="true" />
    <section className="page-skeleton-home-scores">{Array.from({ length: 2 }, (_, index) => <span key={index}><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-value" /></span>)}</section>
    <section className="page-skeleton-home-actions"><SkeletonBlock className="is-circle" /></section>
    <section className="home-widget-grid page-skeleton-home-widget-grid">
      {Array.from({ length: 4 }, (_, index) => <SkeletonBlock className={`home-widget-skeleton home-widget-skeleton--position-${index + 1}`} key={index} />)}
    </section>
    <SkeletonBlock className="page-skeleton-home-guidance" />
    <div className="page-skeleton-home-life-stage"><MascotImage animatedSrc={idleMascot} staticSrc={homeMascot} alt="" aria-hidden="true" /></div>
  </>;
}

function AuthSkeleton() {
  return <>
    <section className="page-skeleton-auth-hero"><MascotImage className="page-skeleton-auth-loading-cat" animatedSrc={loadingMascot} staticSrc={homeMascot} alt="" aria-hidden="true" /><SkeletonBlock className="is-wordmark" /><SkeletonLines count={2} compact /></section>
    <section className="page-skeleton-auth-form"><SkeletonBlock className="is-heading" /><SkeletonBlock className="is-field" /><SkeletonBlock className="is-field" /><SkeletonBlock className="is-button" /><SkeletonBlock className="is-consent" /></section>
  </>;
}

function CalendarSkeleton({ weekCount }: { weekCount: number }) {
  const quarterWeekCount = 14;
  return <>
    <section className="page-skeleton-calendar-overview"><SkeletonBlock /><SkeletonBlock /></section>
    <section className="home-calendar-card page-skeleton-calendar-card">
      <div className="home-calendar-month-switcher page-skeleton-calendar-title"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-title" /><SkeletonBlock className="is-circle" /></div>
      <div className="home-calendar-weekdays page-skeleton-calendar-weekdays">{Array.from({ length: 7 }, (_, index) => <SkeletonBlock key={index} />)}</div>
      <div className="home-calendar-grid page-skeleton-calendar-grid">{Array.from({ length: weekCount * 7 }, (_, index) => <SkeletonBlock className="home-calendar-day page-skeleton-calendar-day" key={index} />)}</div>
    </section>
    <section className="home-year-card page-skeleton-calendar-year">
      <header className="home-year-header page-skeleton-calendar-year-header">
        <div><SkeletonBlock className="is-title" /></div>
        <nav aria-hidden="true"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-value" /><SkeletonBlock className="is-circle" /></nav>
      </header>
      <div className="home-year-heatmap page-skeleton-calendar-year-heatmap" style={{ "--year-week-count": quarterWeekCount } as CSSProperties}>
        <div className="home-year-months page-skeleton-calendar-year-months" aria-hidden="true">
          {[1, 2, 3].map((month, index) => <SkeletonBlock key={month} style={{ gridColumn: `${index * 5 + 1} / span ${index === 2 ? 4 : 5}` }} />)}
        </div>
        <div className="home-year-weekdays page-skeleton-calendar-year-weekdays" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <SkeletonBlock key={index} />)}</div>
        <div className="home-year-weeks page-skeleton-calendar-year-grid" aria-hidden="true">
          {Array.from({ length: quarterWeekCount * 7 }, (_, index) => <SkeletonBlock className="home-year-day page-skeleton-calendar-year-day" key={index} />)}
        </div>
      </div>
      <footer className="home-year-legend page-skeleton-calendar-year-legend"><SkeletonBlock />{Array.from({ length: 5 }, (_, index) => <SkeletonBlock key={index} />)}<SkeletonBlock /></footer>
    </section>
  </>;
}

function DailyReportSkeleton() {
  return <>
    <section className="page-skeleton-card page-skeleton-daily-hero"><SkeletonBlock className="is-orb" /><span className="page-skeleton-daily-copy"><SkeletonBlock className="is-title" /><SkeletonBlock className="is-track" /><SkeletonLines count={2} compact /></span></section>
    <section className="page-skeleton-daily-metrics">{Array.from({ length: 6 }, (_, index) => <article key={index}><div><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-title" /><SkeletonBlock className="is-score" /></div><SkeletonBlock className="is-track" /><SkeletonLines count={2} compact /></article>)}</section>
    <section className="page-skeleton-card is-short"><SkeletonLines count={3} /></section>
  </>;
}

function AdvancedProfileSkeleton() {
  return <>
    <section className="page-skeleton-profile-identity"><SkeletonBlock className="is-avatar" /><SkeletonLines count={2} compact /><SkeletonBlock className="is-orb" /></section>
    {Array.from({ length: 3 }, (_, index) => <section className="page-skeleton-card page-skeleton-advanced-section" key={index}><div><SkeletonBlock className="is-circle" /><SkeletonLines count={2} compact /></div><SkeletonBlock className="is-field" /><SkeletonBlock className="is-field" /><SkeletonBlock className="is-field" /></section>)}
  </>;
}

export default function PageSkeleton({ variant, className = "", calendarWeekCount = 5 }: { variant: PageSkeletonVariant; className?: string; calendarWeekCount?: number }) {
  const { locale } = useLocale();
  const editorModule = variant.startsWith("record-editor-") ? variant.slice("record-editor-".length) as RecordEditorSkeletonModule : null;
  const detailModule = variant.startsWith("record-detail-") ? variant.slice("record-detail-".length) as RecordSkeletonModule : null;
  const content = variant === "auth" ? <AuthSkeleton />
    : variant === "records" ? <RecordsSkeleton />
    : detailModule ? <RecordDetailSkeleton module={detailModule} />
      : editorModule ? <RecordEditorSkeleton module={editorModule} />
      : variant === "ai" ? <AiSkeleton />
        : variant === "growth" ? <GrowthSkeleton />
          : variant === "profile" ? <ProfileSkeleton />
            : variant === "calendar" ? <CalendarSkeleton weekCount={calendarWeekCount} />
              : variant === "daily-report" ? <DailyReportSkeleton />
                : variant === "advanced-profile" ? <AdvancedProfileSkeleton />
                  : <TodaySkeleton />;

  return (
    <div
      className={["page-skeleton", `page-skeleton--${variant}`, className].filter(Boolean).join(" ")}
      data-page-skeleton={variant}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={locale === "zh" ? "正在加载页面内容" : "Loading page content"}
    >
      {content}
    </div>
  );
}
