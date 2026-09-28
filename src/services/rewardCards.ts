import lavenderReading from "../assets/shop/points-cards/lavender-reading.webp";
import mintGrowth from "../assets/shop/points-cards/mint-growth.webp";
import seasideStudio from "../assets/shop/points-cards/seaside-studio.webp";
import starlitIdeas from "../assets/shop/points-cards/starlit-ideas.webp";
import sunsetGarden from "../assets/shop/points-cards/sunset-garden.webp";
import warmCompanion from "../assets/shop/points-cards/warm-companion.webp";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type PointsCardSkinId =
  | "mint-growth"
  | "warm-companion"
  | "starlit-ideas"
  | "lavender-reading"
  | "seaside-studio"
  | "sunset-garden";

export type PointsCardSkin = {
  id: PointsCardSkinId;
  art: string;
  zh: string;
  en: string;
  free: boolean;
  lastFour: string;
};

export type RewardCardState = {
  selectedCardId: PointsCardSkinId;
  unlockedCardIds: PointsCardSkinId[];
  balance: number;
};

export const POINTS_CARD_SKINS: readonly PointsCardSkin[] = [
  { id: "mint-growth", art: mintGrowth, zh: "薄荷成长卡", en: "Mint Growth", free: true, lastFour: "0427" },
  { id: "warm-companion", art: warmCompanion, zh: "暖光陪伴卡", en: "Warm Companion", free: true, lastFour: "0916" },
  { id: "starlit-ideas", art: starlitIdeas, zh: "星夜灵感卡", en: "Starlit Ideas", free: true, lastFour: "1224" },
  { id: "lavender-reading", art: lavenderReading, zh: "薰衣草阅读卡", en: "Lavender Reading", free: false, lastFour: "0718" },
  { id: "seaside-studio", art: seasideStudio, zh: "海风画室卡", en: "Seaside Studio", free: false, lastFour: "0612" },
  { id: "sunset-garden", art: sunsetGarden, zh: "晚霞花园卡", en: "Sunset Garden", free: false, lastFour: "1023" },
] as const;

export const DEFAULT_POINTS_CARD_IDS = POINTS_CARD_SKINS.filter((card) => card.free).map((card) => card.id);

const skinIds = new Set<PointsCardSkinId>(POINTS_CARD_SKINS.map((card) => card.id));

function isSkinId(value: unknown): value is PointsCardSkinId {
  return typeof value === "string" && skinIds.has(value as PointsCardSkinId);
}

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

function normalizeState(value: unknown): RewardCardState {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const unlocked = Array.isArray(row.unlockedCardIds)
    ? row.unlockedCardIds.filter(isSkinId)
    : [...DEFAULT_POINTS_CARD_IDS];
  const unlockedCardIds = POINTS_CARD_SKINS.map((card) => card.id).filter((id) => unlocked.includes(id));
  const selectedCardId = isSkinId(row.selectedCardId) && unlockedCardIds.includes(row.selectedCardId)
    ? row.selectedCardId
    : "mint-growth";
  const balance = Number(row.balance);
  if (!Number.isFinite(balance) || balance < 0) throw new Error("积分卡服务没有返回有效余额。");
  return { selectedCardId, unlockedCardIds, balance: Math.round(balance) };
}

export function defaultRewardCardState(balance: number): RewardCardState {
  return { selectedCardId: "mint-growth", unlockedCardIds: [...DEFAULT_POINTS_CARD_IDS], balance };
}

export async function loadRewardCardState(): Promise<RewardCardState> {
  if (isDemoMode()) return defaultRewardCardState(0);
  const result = await supabase.rpc("nava_reward_card_state");
  assertNoError(result.error);
  return normalizeState(result.data);
}

export async function selectRewardCardSkin(cardId: PointsCardSkinId): Promise<RewardCardState> {
  if (isDemoMode()) throw new Error("公开演示不会修改积分卡。");
  const result = await supabase.rpc("nava_select_reward_card_skin", { target_skin: cardId });
  assertNoError(result.error);
  return normalizeState(result.data);
}

export async function unlockRewardCardSkin(cardId: PointsCardSkinId, requestKey: string = crypto.randomUUID()): Promise<RewardCardState> {
  if (isDemoMode()) throw new Error("公开演示不会扣除积分或新增卡片。");
  const result = await supabase.rpc("nava_unlock_reward_card_skin", {
    target_skin: cardId,
    request_key: requestKey,
  });
  assertNoError(result.error);
  return normalizeState(result.data);
}
