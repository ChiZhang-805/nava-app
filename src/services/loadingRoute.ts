import type { PageSkeletonVariant } from "../components/PageSkeleton";

export function currentSkeletonVariant(): PageSkeletonVariant {
  const query = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
  const tab = query.get("tab") ?? "today";
  const view = query.get("view") ?? "";
  if (tab === "record") return query.get("module") ? "record-detail" : "records";
  if (tab === "ai") return "ai";
  if (tab === "trends") return "growth";
  if (tab === "profile") return "profile";
  if (view === "calendar") return "calendar";
  if (view.startsWith("day-")) return "daily-report";
  if (view === "profile-details") return "advanced-profile";
  return "today";
}
