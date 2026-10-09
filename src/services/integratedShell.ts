import type { AppTab } from "../types";

/**
 * The 25 route-level surfaces that share NAVA's continuous app canvas.
 *
 * Dynamic dates, product ids and category ids are templates of one visual
 * page, not separate pages. Record journals, first-run screens and completion
 * stories intentionally keep their immersive shells.
 */
export const INTEGRATED_SHELL_PAGES = [
  "home",
  "records",
  "chat",
  "growth",
  "profile",
  "profile-personal",
  "profile-skin",
  "profile-account",
  "profile-health",
  "profile-watch",
  "profile-privacy",
  "calendar",
  "daily-record",
  "body-profile",
  "notifications",
  "reminder-settings",
  "home-widgets",
  "today-todos",
  "admin-console",
  "points-shop",
  "points-shop-category",
  "points-shop-product",
  "points-shop-cart",
  "points-shop-cards",
  "points-shop-add-card",
] as const;

export type IntegratedShellPage = (typeof INTEGRATED_SHELL_PAGES)[number];

const rootPages: Partial<Record<AppTab, IntegratedShellPage>> = {
  today: "home",
  record: "records",
  ai: "chat",
  trends: "growth",
  profile: "profile",
};

const profilePages: Record<string, IntegratedShellPage> = {
  personal: "profile-personal",
  skin: "profile-skin",
  account: "profile-account",
  health: "profile-health",
  watch: "profile-watch",
  privacy: "profile-privacy",
};

const todayPages: Record<string, IntegratedShellPage> = {
  calendar: "calendar",
  "profile-details": "body-profile",
  notifications: "notifications",
  "reminder-settings": "reminder-settings",
  "home-widgets": "home-widgets",
  "today-todos": "today-todos",
  "admin-console": "admin-console",
  "points-shop": "points-shop",
  "points-shop-cart": "points-shop-cart",
  "points-shop-cards": "points-shop-cards",
  "points-shop-add-card": "points-shop-add-card",
};

export function integratedShellPage(
  tab: AppTab,
  module: string | null,
  view: string | null,
): IntegratedShellPage | null {
  if (!module && !view) return rootPages[tab] ?? null;
  if (tab === "profile" && view) return profilePages[view] ?? null;
  if (tab !== "today" || !view) return null;
  if (view.startsWith("day-")) return "daily-record";
  if (view.startsWith("points-shop-category-")) return "points-shop-category";
  if (view.startsWith("points-shop-product-")) return "points-shop-product";
  return todayPages[view] ?? null;
}
