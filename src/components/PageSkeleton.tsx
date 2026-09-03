import type { CSSProperties } from "react";
import { useLocale } from "../i18n";

export type PageSkeletonVariant =
  | "auth"
  | "today"
  | "records"
  | "record-detail"
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

function RecordDetailSkeleton() {
  return <>
    <section className="page-skeleton-card page-skeleton-record-summary">
      <div><SkeletonBlock className="is-title" /><SkeletonBlock className="is-circle" /></div>
      <div className="page-skeleton-metric-row"><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div>
    </section>
    <section className="page-skeleton-card page-skeleton-chart-card"><SkeletonBlock className="is-title" /><SkeletonBars /></section>
    <section className="page-skeleton-card"><SkeletonBlock className="is-title" /><SkeletonLines count={4} /></section>
    <section className="page-skeleton-card is-short"><SkeletonLines count={2} /></section>
  </>;
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
  return <>
    <section className="page-skeleton-card page-skeleton-profile-account"><SkeletonBlock className="is-section-title" /><div><SkeletonBlock className="is-avatar" /><SkeletonLines count={2} compact /></div></section>
    <section className="page-skeleton-card page-skeleton-profile-form"><div><SkeletonBlock className="is-section-title" /><SkeletonBlock className="is-circle" /></div><SkeletonBlock className="is-field" /><div className="page-skeleton-two-col"><SkeletonBlock className="is-field" /><SkeletonBlock className="is-field" /></div><SkeletonBlock className="is-button" /></section>
    {Array.from({ length: 2 }, (_, index) => <section className="page-skeleton-card page-skeleton-device" key={index}><SkeletonBlock className="is-section-title" /><div><SkeletonBlock className="is-device-icon" /><SkeletonLines count={2} compact /></div></section>)}
  </>;
}

function TodaySkeleton() {
  return <>
    <section className="page-skeleton-home-scores"><SkeletonBlock /><SkeletonBlock /></section>
    <section className="page-skeleton-home-actions">{Array.from({ length: 4 }, (_, index) => <SkeletonBlock className="is-circle" key={index} />)}</section>
    <SkeletonBlock className="page-skeleton-home-aura" />
    <SkeletonBlock className="page-skeleton-home-mascot" />
  </>;
}

function AuthSkeleton() {
  return <>
    <section className="page-skeleton-auth-hero"><SkeletonBlock className="is-wordmark" /><SkeletonLines count={2} compact /></section>
    <section className="page-skeleton-auth-form"><SkeletonBlock className="is-heading" /><SkeletonBlock className="is-field" /><SkeletonBlock className="is-field" /><SkeletonBlock className="is-button" /><SkeletonBlock className="is-consent" /></section>
  </>;
}

function CalendarSkeleton() {
  return <>
    <section className="page-skeleton-calendar-overview"><SkeletonBlock /><SkeletonBlock /></section>
    <section className="page-skeleton-card page-skeleton-calendar-card"><div className="page-skeleton-calendar-title"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-title" /><SkeletonBlock className="is-circle" /></div><div className="page-skeleton-calendar-grid">{Array.from({ length: 35 }, (_, index) => <SkeletonBlock key={index} />)}</div></section>
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

export default function PageSkeleton({ variant, className = "" }: { variant: PageSkeletonVariant; className?: string }) {
  const { locale } = useLocale();
  const content = variant === "auth" ? <AuthSkeleton />
    : variant === "records" ? <RecordsSkeleton />
    : variant === "record-detail" ? <RecordDetailSkeleton />
      : variant === "ai" ? <AiSkeleton />
        : variant === "growth" ? <GrowthSkeleton />
          : variant === "profile" ? <ProfileSkeleton />
            : variant === "calendar" ? <CalendarSkeleton />
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
