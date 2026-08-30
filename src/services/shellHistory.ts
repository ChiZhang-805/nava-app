import type { AppTab } from "../types";

export type ShellRecordModule = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";

export type ShellRoute = {
  tab: AppTab;
  module: ShellRecordModule | null;
  view: string | null;
};

export type ShellHistoryState = {
  navaShell: true;
  depth: number;
  route: ShellRoute;
};

export function normalizeShellRoute(tab: AppTab, module: ShellRecordModule | null = null, view: string | null = null): ShellRoute {
  const normalizedModule = tab === "record" ? module : null;
  const normalizedView = tab === "today"
    ? view || null
    : normalizedModule && view && view !== "overview"
      ? view
      : null;
  return { tab, module: normalizedModule, view: normalizedView };
}

export function shellRoutesEqual(left: ShellRoute, right: ShellRoute) {
  return left.tab === right.tab && left.module === right.module && left.view === right.view;
}

export function shellHistoryDepth(state: unknown) {
  if (!state || typeof state !== "object") return 0;
  const candidate = state as Partial<ShellHistoryState>;
  return candidate.navaShell === true && Number.isInteger(candidate.depth) && Number(candidate.depth) >= 0
    ? Number(candidate.depth)
    : 0;
}

export function hasPreviousShellRoute(state: unknown) {
  return shellHistoryDepth(state) > 0;
}

export function nextShellHistoryState(currentState: unknown, route: ShellRoute, replace = false): ShellHistoryState {
  const currentDepth = shellHistoryDepth(currentState);
  return { navaShell: true, depth: replace ? currentDepth : currentDepth + 1, route };
}

export function fallbackShellRoute(route: ShellRoute): ShellRoute {
  if (route.tab === "today" && route.view?.startsWith("day-")) return normalizeShellRoute("today", null, "calendar");
  if (route.tab === "today" && route.view) return normalizeShellRoute("today");
  if (route.tab === "record" && route.module && route.view) return normalizeShellRoute("record", route.module);
  if (route.tab === "record" && route.module) return normalizeShellRoute("record");
  return normalizeShellRoute("today");
}
