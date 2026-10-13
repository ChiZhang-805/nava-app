import baseMascot from "../assets/figma/home-option2/home-mascot-v5.png";
import bellCollar from "../assets/wardrobe/accessory-bell-collar.png";
import cloudScarf from "../assets/wardrobe/accessory-cloud-scarf.png";
import mistBeret from "../assets/wardrobe/accessory-mist-beret.png";
import mistGrayMascot from "../assets/wardrobe/mascot-mist-gray.png";
import nightInkMascot from "../assets/wardrobe/mascot-night-ink.png";
import warmOrangeMascot from "../assets/wardrobe/mascot-warm-orange.png";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type WardrobeCategory = "skin" | "accessory" | "background";
export type WardrobeSkinId = "skin-cream" | "skin-warm-orange" | "skin-night-ink" | "skin-mist-gray";
export type WardrobeAccessoryId = "accessory-none" | "accessory-bell-collar" | "accessory-cloud-scarf" | "accessory-mist-beret";
export type WardrobeBackgroundId = "background-morning-room" | "background-night-window" | "background-cloud-garden" | "background-aurora-lake";
export type WardrobeItemId = WardrobeSkinId | WardrobeAccessoryId | WardrobeBackgroundId;

export type WardrobeSelection = {
  skinId: WardrobeSkinId;
  accessoryId: WardrobeAccessoryId;
  backgroundId: WardrobeBackgroundId;
};

export type MascotWardrobeItem = {
  id: WardrobeItemId;
  category: WardrobeCategory;
  zh: string;
  en: string;
  rarityZh: string;
  rarityEn: string;
  price: number;
  art?: string;
  previewClass?: string;
};

export type MascotWardrobeState = {
  equipped: WardrobeSelection;
  unlockedItemIds: WardrobeItemId[];
  balance: number;
};

export const WARDROBE_ITEMS: readonly MascotWardrobeItem[] = [
  { id: "skin-cream", category: "skin", zh: "奶霜", en: "Cream", rarityZh: "基础皮肤", rarityEn: "Base skin", price: 0, art: baseMascot },
  { id: "skin-warm-orange", category: "skin", zh: "暖橘", en: "Warm Apricot", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 300, art: warmOrangeMascot },
  { id: "skin-night-ink", category: "skin", zh: "夜墨", en: "Night Ink", rarityZh: "稀有皮肤", rarityEn: "Rare skin", price: 360, art: nightInkMascot },
  { id: "skin-mist-gray", category: "skin", zh: "雾灰", en: "Mist Gray", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 240, art: mistGrayMascot },
  { id: "accessory-none", category: "accessory", zh: "不佩戴", en: "No accessory", rarityZh: "原始造型", rarityEn: "Original look", price: 0 },
  { id: "accessory-bell-collar", category: "accessory", zh: "铃铛项圈", en: "Bell Collar", rarityZh: "基础饰品", rarityEn: "Base accessory", price: 0, art: bellCollar },
  { id: "accessory-cloud-scarf", category: "accessory", zh: "云蓝围巾", en: "Cloud Scarf", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 180, art: cloudScarf },
  { id: "accessory-mist-beret", category: "accessory", zh: "雾紫贝雷帽", en: "Mist Beret", rarityZh: "稀有饰品", rarityEn: "Rare accessory", price: 260, art: mistBeret },
  { id: "background-morning-room", category: "background", zh: "晨光房间", en: "Morning Room", rarityZh: "基础场景", rarityEn: "Base scene", price: 0, previewClass: "morning-room" },
  { id: "background-night-window", category: "background", zh: "夜灯窗边", en: "Night Window", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 420, previewClass: "night-window" },
  { id: "background-cloud-garden", category: "background", zh: "云上花园", en: "Cloud Garden", rarityZh: "普通场景", rarityEn: "Classic scene", price: 280, previewClass: "cloud-garden" },
  { id: "background-aurora-lake", category: "background", zh: "极光湖畔", en: "Aurora Lake", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 360, previewClass: "aurora-lake" },
] as const;

export const DEFAULT_WARDROBE_SELECTION: WardrobeSelection = {
  skinId: "skin-cream",
  accessoryId: "accessory-none",
  backgroundId: "background-morning-room",
};

const itemIds = new Set<WardrobeItemId>(WARDROBE_ITEMS.map((item) => item.id));
const freeIds = WARDROBE_ITEMS.filter((item) => item.price === 0).map((item) => item.id);
const DEMO_STORAGE_KEY = "nava.demo.mascot-wardrobe.v1";

function isItemId(value: unknown): value is WardrobeItemId {
  return typeof value === "string" && itemIds.has(value as WardrobeItemId);
}

function itemInCategory<C extends WardrobeCategory>(value: unknown, category: C) {
  return isItemId(value) && WARDROBE_ITEMS.some((item) => item.id === value && item.category === category);
}

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

function normalizeSelection(value: unknown): WardrobeSelection {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    skinId: itemInCategory(row.skinId, "skin") ? row.skinId as WardrobeSkinId : DEFAULT_WARDROBE_SELECTION.skinId,
    accessoryId: itemInCategory(row.accessoryId, "accessory") ? row.accessoryId as WardrobeAccessoryId : DEFAULT_WARDROBE_SELECTION.accessoryId,
    backgroundId: itemInCategory(row.backgroundId, "background") ? row.backgroundId as WardrobeBackgroundId : DEFAULT_WARDROBE_SELECTION.backgroundId,
  };
}

function normalizeState(value: unknown): MascotWardrobeState {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const unlocked = Array.isArray(row.unlockedItemIds) ? row.unlockedItemIds.filter(isItemId) : [];
  const unlockedItemIds = WARDROBE_ITEMS.map((item) => item.id).filter((id) => freeIds.includes(id) || unlocked.includes(id));
  const equipped = normalizeSelection(row.equipped);
  const balance = Number(row.balance);
  if (!Number.isFinite(balance) || balance < 0) throw new Error("小猫衣橱没有返回有效积分余额。");
  for (const itemId of Object.values(equipped)) {
    if (!unlockedItemIds.includes(itemId)) return { equipped: DEFAULT_WARDROBE_SELECTION, unlockedItemIds, balance: Math.round(balance) };
  }
  return { equipped, unlockedItemIds, balance: Math.round(balance) };
}

function readDemoState(): MascotWardrobeState {
  const fallback: MascotWardrobeState = {
    equipped: DEFAULT_WARDROBE_SELECTION,
    unlockedItemIds: [...freeIds, "skin-night-ink", "accessory-mist-beret"],
    balance: 860,
  };
  try {
    const stored = window.sessionStorage.getItem(DEMO_STORAGE_KEY);
    return stored ? normalizeState(JSON.parse(stored)) : fallback;
  } catch {
    return fallback;
  }
}

function writeDemoState(state: MascotWardrobeState) {
  window.sessionStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function wardrobeItem(itemId: WardrobeItemId) {
  return WARDROBE_ITEMS.find((item) => item.id === itemId)!;
}

export function wardrobeItems(category: WardrobeCategory) {
  return WARDROBE_ITEMS.filter((item) => item.category === category);
}

export async function loadMascotWardrobeState(): Promise<MascotWardrobeState> {
  if (isDemoMode()) return readDemoState();
  const result = await supabase.rpc("nava_mascot_wardrobe_state");
  assertNoError(result.error);
  return normalizeState(result.data);
}

export async function equipMascotWardrobeItem(itemId: WardrobeItemId): Promise<MascotWardrobeState> {
  if (isDemoMode()) {
    const current = readDemoState();
    if (!current.unlockedItemIds.includes(itemId)) throw new Error("这件搭配尚未拥有。");
    const item = wardrobeItem(itemId);
    const equipped = { ...current.equipped };
    if (item.category === "skin") equipped.skinId = item.id as WardrobeSkinId;
    if (item.category === "accessory") equipped.accessoryId = item.id as WardrobeAccessoryId;
    if (item.category === "background") equipped.backgroundId = item.id as WardrobeBackgroundId;
    return writeDemoState({ ...current, equipped });
  }
  const result = await supabase.rpc("nava_select_mascot_wardrobe_item", { target_item: itemId });
  assertNoError(result.error);
  return normalizeState(result.data);
}

export async function unlockMascotWardrobeItem(itemId: WardrobeItemId, requestKey: string = crypto.randomUUID()): Promise<MascotWardrobeState> {
  if (isDemoMode()) {
    const current = readDemoState();
    if (current.unlockedItemIds.includes(itemId)) return current;
    const item = wardrobeItem(itemId);
    if (current.balance < item.price) throw new Error("insufficient points");
    return writeDemoState({ ...current, balance: current.balance - item.price, unlockedItemIds: [...current.unlockedItemIds, itemId] });
  }
  const result = await supabase.rpc("nava_unlock_mascot_wardrobe_item", { target_item: itemId, request_key: requestKey });
  assertNoError(result.error);
  return normalizeState(result.data);
}
