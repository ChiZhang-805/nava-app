import PageSkeleton, { SkeletonBlock } from "./PageSkeleton";
import { currentSkeletonVariant } from "../services/loadingRoute";

export default function LoadingShell() {
  const variant = currentSkeletonVariant();
  const query = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
  const isTodayTab = (query.get("tab") ?? "today") === "today";
  const contentModifier = isTodayTab ? "today" : variant === "ai" ? "chat" : variant === "growth" ? "trends" : variant === "records" || variant.startsWith("record-detail-") ? "record" : variant;
  const nestedTodayView = isTodayTab && variant !== "today";
  const profileDetailsSubpage = nestedTodayView && variant === "advanced-profile";
  return (
    <div className={["phone-frame", "page-loading-shell", isTodayTab ? "phone-frame--option2" : "", profileDetailsSubpage ? "phone-frame--subpage-no-nav" : ""].filter(Boolean).join(" ")}>
      <div className="safe-top" />
      {!isTodayTab && <header className="app-header figma-app-header page-loading-header" aria-hidden="true"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-title" /><SkeletonBlock className="is-circle" /></header>}
      <main className={["app-content", `app-content--${contentModifier}`].join(" ")}>
        <div className="screen-panel">
          {nestedTodayView ? <section className={["home-experience", "page-loading-home-experience", profileDetailsSubpage ? "advanced-profile-screen" : ""].filter(Boolean).join(" ")}><header className="home-experience-header page-loading-subheader" aria-hidden="true"><SkeletonBlock className="is-circle" /><SkeletonBlock className="is-title" /><SkeletonBlock className="is-circle" /></header><PageSkeleton variant={variant} /></section> : <PageSkeleton variant={variant} />}
        </div>
      </main>
      {!profileDetailsSubpage && <nav className="bottom-nav page-loading-nav" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <SkeletonBlock className={index === 2 ? "is-ai" : "is-circle"} key={index} />)}
      </nav>}
    </div>
  );
}
