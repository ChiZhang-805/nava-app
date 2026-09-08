import type { PageSkeletonVariant } from "../components/PageSkeleton";

const recordModules = new Set(["mood", "sleep", "exercise", "diet", "focus", "face"]);

export function recordSkeletonVariant(module: string | null, editor: boolean | string | null): PageSkeletonVariant {
  if (!module || !recordModules.has(module)) return "records";
  if (editor === true || editor === "editor" || editor === "conditions") return `record-editor-${module}` as PageSkeletonVariant;
  return `record-detail-${module}` as PageSkeletonVariant;
}

export function currentSkeletonVariant(): PageSkeletonVariant {
  const query = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
  const tab = query.get("tab") ?? "today";
  const view = query.get("view") ?? "";
  if (tab === "record") return recordSkeletonVariant(query.get("module"), query.get("view"));
  if (tab === "ai") return "ai";
  if (tab === "trends") return "growth";
  if (tab === "profile") return "profile";
  if (view === "calendar") return "calendar";
  if (view.startsWith("day-")) return "daily-report";
  if (view === "profile-details") return "advanced-profile";
  return "today";
}
