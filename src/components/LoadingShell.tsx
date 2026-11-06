import PageSkeleton from "./PageSkeleton";

export default function LoadingShell() {
  return (
    <div className="phone-frame phone-frame--option2 page-loading-shell" data-shell-page="today">
      <div className="safe-top" />
      <main className="app-content app-content--today" aria-label="正在准备首页">
        <div className="screen-panel"><PageSkeleton variant="today" /></div>
      </main>
    </div>
  );
}
