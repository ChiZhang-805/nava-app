import baseMascot from "../assets/wardrobe/mascot-cream.png";
import auroraScarf from "../assets/wardrobe/accessory-aurora-scarf.png";
import bellCollar from "../assets/wardrobe/accessory-bell-collar.png";
import cherryBow from "../assets/wardrobe/accessory-cherry-bow.png";
import cloudBackpack from "../assets/wardrobe/accessory-cloud-backpack.png";
import cloudScarf from "../assets/wardrobe/accessory-cloud-scarf.png";
import fishBrooch from "../assets/wardrobe/accessory-fish-brooch.png";
import honeyNeckWarmer from "../assets/wardrobe/accessory-honey-neck-warmer.png";
import laurelCrown from "../assets/wardrobe/accessory-laurel-crown.png";
import lilyGarland from "../assets/wardrobe/accessory-lily-garland.png";
import mintEarmuffs from "../assets/wardrobe/accessory-mint-earmuffs.png";
import mistBeret from "../assets/wardrobe/accessory-mist-beret.png";
import nightVoyageCap from "../assets/wardrobe/accessory-night-voyage-cap.png";
import pearlBow from "../assets/wardrobe/accessory-pearl-bow.png";
import raindropCape from "../assets/wardrobe/accessory-raindrop-cape.png";
import sailorHat from "../assets/wardrobe/accessory-sailor-hat.png";
import starGlasses from "../assets/wardrobe/accessory-star-glasses.png";
import starMoonClip from "../assets/wardrobe/accessory-star-moon-clip.png";
import backgroundCherryCourtyard from "../assets/wardrobe/background-cherry-courtyard.jpg";
import backgroundCloudStation from "../assets/wardrobe/background-cloud-station.jpg";
import backgroundCreamKitchen from "../assets/wardrobe/background-cream-kitchen.jpg";
import backgroundForestMist from "../assets/wardrobe/background-forest-mist.jpg";
import backgroundGlasshouse from "../assets/wardrobe/background-glasshouse.jpg";
import backgroundHoneySunset from "../assets/wardrobe/background-honey-sunset.jpg";
import backgroundMilkyWayBedroom from "../assets/wardrobe/background-milky-way-bedroom.jpg";
import backgroundMoonlitLakeshore from "../assets/wardrobe/background-moonlit-lakeshore.jpg";
import backgroundRainyStudy from "../assets/wardrobe/background-rainy-study.jpg";
import backgroundSeaSaltBath from "../assets/wardrobe/background-sea-salt-bath.jpg";
import backgroundSeasideAfternoon from "../assets/wardrobe/background-seaside-afternoon.jpg";
import backgroundSnowyFireplace from "../assets/wardrobe/background-snowy-fireplace.jpg";
import backgroundStarTerrace from "../assets/wardrobe/background-star-terrace.jpg";
import auroraTealMascot from "../assets/wardrobe/mascot-aurora-teal.png";
import cherryBlossomMascot from "../assets/wardrobe/mascot-cherry-blossom.png";
import coralRedMascot from "../assets/wardrobe/mascot-coral-red.png";
import forestDewMascot from "../assets/wardrobe/mascot-forest-dew.png";
import honeyGoldMascot from "../assets/wardrobe/mascot-honey-gold.png";
import lakeBlueMascot from "../assets/wardrobe/mascot-lake-blue.png";
import lavenderCloudMascot from "../assets/wardrobe/mascot-lavender-cloud.png";
import micaSilverMascot from "../assets/wardrobe/mascot-mica-silver.png";
import milkTeaMascot from "../assets/wardrobe/mascot-milk-tea.png";
import mistGrayMascot from "../assets/wardrobe/mascot-mist-gray.png";
import mintMistMascot from "../assets/wardrobe/mascot-mint-mist.png";
import moonlightPurpleMascot from "../assets/wardrobe/mascot-moonlight-purple.png";
import nightInkMascot from "../assets/wardrobe/mascot-night-ink.png";
import seaSaltMascot from "../assets/wardrobe/mascot-sea-salt.png";
import starSandMascot from "../assets/wardrobe/mascot-star-sand.png";
import warmOrangeMascot from "../assets/wardrobe/mascot-warm-orange.png";
import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type WardrobeCategory = "skin" | "accessory" | "background";
export type WardrobeSkinId = "skin-cream" | "skin-warm-orange" | "skin-night-ink" | "skin-mist-gray" | "skin-cherry-blossom" | "skin-lake-blue" | "skin-mint-mist" | "skin-honey-gold" | "skin-lavender-cloud" | "skin-mica-silver" | "skin-forest-dew" | "skin-sea-salt" | "skin-milk-tea" | "skin-coral-red" | "skin-moonlight-purple" | "skin-aurora-teal" | "skin-star-sand";
export type WardrobeAccessoryId = "accessory-none" | "accessory-bell-collar" | "accessory-cloud-scarf" | "accessory-mist-beret" | "accessory-star-moon-clip" | "accessory-pearl-bow" | "accessory-mint-earmuffs" | "accessory-honey-neck-warmer" | "accessory-cloud-backpack" | "accessory-fish-brooch" | "accessory-laurel-crown" | "accessory-sailor-hat" | "accessory-cherry-bow" | "accessory-star-glasses" | "accessory-raindrop-cape" | "accessory-aurora-scarf" | "accessory-lily-garland" | "accessory-night-voyage-cap";
export type WardrobeBackgroundId = "background-morning-room" | "background-night-window" | "background-cloud-garden" | "background-aurora-lake" | "background-seaside-afternoon" | "background-cherry-courtyard" | "background-rainy-study" | "background-star-terrace" | "background-forest-mist" | "background-cream-kitchen" | "background-glasshouse" | "background-snowy-fireplace" | "background-moonlit-lakeshore" | "background-cloud-station" | "background-honey-sunset" | "background-sea-salt-bath" | "background-milky-way-bedroom";
export type WardrobeItemId = WardrobeSkinId | WardrobeAccessoryId | WardrobeBackgroundId;

export type WardrobeSelection = {
  skinId: WardrobeSkinId;
  accessoryIds: WardrobeAccessoryId[];
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
  { id: "skin-cherry-blossom", category: "skin", zh: "樱粉", en: "Cherry Pink", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 320, art: cherryBlossomMascot },
  { id: "skin-lake-blue", category: "skin", zh: "湖蓝", en: "Lake Blue", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 280, art: lakeBlueMascot },
  { id: "skin-mint-mist", category: "skin", zh: "薄荷雾", en: "Mint Mist", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 260, art: mintMistMascot },
  { id: "skin-honey-gold", category: "skin", zh: "蜜糖金", en: "Honey Gold", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 300, art: honeyGoldMascot },
  { id: "skin-lavender-cloud", category: "skin", zh: "薰衣云", en: "Lavender Cloud", rarityZh: "稀有皮肤", rarityEn: "Rare skin", price: 340, art: lavenderCloudMascot },
  { id: "skin-mica-silver", category: "skin", zh: "云母银", en: "Mica Silver", rarityZh: "稀有皮肤", rarityEn: "Rare skin", price: 380, art: micaSilverMascot },
  { id: "skin-forest-dew", category: "skin", zh: "森林露", en: "Forest Dew", rarityZh: "稀有皮肤", rarityEn: "Rare skin", price: 360, art: forestDewMascot },
  { id: "skin-sea-salt", category: "skin", zh: "海盐蓝", en: "Sea Salt", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 320, art: seaSaltMascot },
  { id: "skin-milk-tea", category: "skin", zh: "奶茶棕", en: "Milk Tea", rarityZh: "普通皮肤", rarityEn: "Classic skin", price: 280, art: milkTeaMascot },
  { id: "skin-coral-red", category: "skin", zh: "珊瑚红", en: "Coral Red", rarityZh: "稀有皮肤", rarityEn: "Rare skin", price: 350, art: coralRedMascot },
  { id: "skin-moonlight-purple", category: "skin", zh: "月光紫", en: "Moonlight Purple", rarityZh: "稀有皮肤", rarityEn: "Rare skin", price: 420, art: moonlightPurpleMascot },
  { id: "skin-aurora-teal", category: "skin", zh: "极光青", en: "Aurora Teal", rarityZh: "典藏皮肤", rarityEn: "Premium skin", price: 460, art: auroraTealMascot },
  { id: "skin-star-sand", category: "skin", zh: "星砂黑", en: "Star Sand", rarityZh: "典藏皮肤", rarityEn: "Premium skin", price: 520, art: starSandMascot },
  { id: "accessory-bell-collar", category: "accessory", zh: "铃铛项圈", en: "Bell Collar", rarityZh: "基础饰品", rarityEn: "Base accessory", price: 0, art: bellCollar },
  { id: "accessory-cloud-scarf", category: "accessory", zh: "云蓝围巾", en: "Cloud Scarf", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 180, art: cloudScarf },
  { id: "accessory-mist-beret", category: "accessory", zh: "雾紫贝雷帽", en: "Mist Beret", rarityZh: "稀有饰品", rarityEn: "Rare accessory", price: 260, art: mistBeret },
  { id: "accessory-star-moon-clip", category: "accessory", zh: "星月发夹", en: "Star Moon Clip", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 220, art: starMoonClip },
  { id: "accessory-pearl-bow", category: "accessory", zh: "珍珠领结", en: "Pearl Bow", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 200, art: pearlBow },
  { id: "accessory-mint-earmuffs", category: "accessory", zh: "薄荷耳罩", en: "Mint Earmuffs", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 260, art: mintEarmuffs },
  { id: "accessory-honey-neck-warmer", category: "accessory", zh: "蜂蜜围脖", en: "Honey Warmer", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 240, art: honeyNeckWarmer },
  { id: "accessory-cloud-backpack", category: "accessory", zh: "云朵背包", en: "Cloud Backpack", rarityZh: "稀有饰品", rarityEn: "Rare accessory", price: 300, art: cloudBackpack },
  { id: "accessory-fish-brooch", category: "accessory", zh: "小鱼胸针", en: "Fish Brooch", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 180, art: fishBrooch },
  { id: "accessory-laurel-crown", category: "accessory", zh: "月桂花冠", en: "Laurel Crown", rarityZh: "典藏饰品", rarityEn: "Premium accessory", price: 420, art: laurelCrown },
  { id: "accessory-sailor-hat", category: "accessory", zh: "海盐水手帽", en: "Sailor Hat", rarityZh: "稀有饰品", rarityEn: "Rare accessory", price: 280, art: sailorHat },
  { id: "accessory-cherry-bow", category: "accessory", zh: "樱桃蝴蝶结", en: "Cherry Bow", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 220, art: cherryBow },
  { id: "accessory-star-glasses", category: "accessory", zh: "星星眼镜", en: "Star Glasses", rarityZh: "普通饰品", rarityEn: "Classic accessory", price: 260, art: starGlasses },
  { id: "accessory-raindrop-cape", category: "accessory", zh: "雨滴斗篷", en: "Raindrop Cape", rarityZh: "稀有饰品", rarityEn: "Rare accessory", price: 360, art: raindropCape },
  { id: "accessory-aurora-scarf", category: "accessory", zh: "极光围巾", en: "Aurora Scarf", rarityZh: "典藏饰品", rarityEn: "Premium accessory", price: 400, art: auroraScarf },
  { id: "accessory-lily-garland", category: "accessory", zh: "晨露铃兰", en: "Lily Garland", rarityZh: "稀有饰品", rarityEn: "Rare accessory", price: 380, art: lilyGarland },
  { id: "accessory-night-voyage-cap", category: "accessory", zh: "夜航小帽", en: "Night Voyage Cap", rarityZh: "稀有饰品", rarityEn: "Rare accessory", price: 340, art: nightVoyageCap },
  { id: "background-morning-room", category: "background", zh: "晨光房间", en: "Morning Room", rarityZh: "基础场景", rarityEn: "Base scene", price: 0, previewClass: "morning-room" },
  { id: "background-night-window", category: "background", zh: "夜灯窗边", en: "Night Window", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 420, previewClass: "night-window" },
  { id: "background-cloud-garden", category: "background", zh: "云上花园", en: "Cloud Garden", rarityZh: "普通场景", rarityEn: "Classic scene", price: 280, previewClass: "cloud-garden" },
  { id: "background-aurora-lake", category: "background", zh: "极光湖畔", en: "Aurora Lake", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 360, previewClass: "aurora-lake" },
  { id: "background-seaside-afternoon", category: "background", zh: "海边午后", en: "Seaside Afternoon", rarityZh: "普通场景", rarityEn: "Classic scene", price: 320, art: backgroundSeasideAfternoon, previewClass: "seaside-afternoon" },
  { id: "background-cherry-courtyard", category: "background", zh: "樱花庭院", en: "Cherry Courtyard", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 380, art: backgroundCherryCourtyard, previewClass: "cherry-courtyard" },
  { id: "background-rainy-study", category: "background", zh: "雨夜书房", en: "Rainy Study", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 400, art: backgroundRainyStudy, previewClass: "rainy-study" },
  { id: "background-star-terrace", category: "background", zh: "星空露台", en: "Star Terrace", rarityZh: "典藏场景", rarityEn: "Premium scene", price: 480, art: backgroundStarTerrace, previewClass: "star-terrace" },
  { id: "background-forest-mist", category: "background", zh: "森林晨雾", en: "Forest Mist", rarityZh: "普通场景", rarityEn: "Classic scene", price: 300, art: backgroundForestMist, previewClass: "forest-mist" },
  { id: "background-cream-kitchen", category: "background", zh: "奶油厨房", en: "Cream Kitchen", rarityZh: "普通场景", rarityEn: "Classic scene", price: 280, art: backgroundCreamKitchen, previewClass: "cream-kitchen" },
  { id: "background-glasshouse", category: "background", zh: "温室花房", en: "Glasshouse", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 420, art: backgroundGlasshouse, previewClass: "glasshouse" },
  { id: "background-snowy-fireplace", category: "background", zh: "雪夜壁炉", en: "Snowy Fireplace", rarityZh: "典藏场景", rarityEn: "Premium scene", price: 460, art: backgroundSnowyFireplace, previewClass: "snowy-fireplace" },
  { id: "background-moonlit-lakeshore", category: "background", zh: "月光湖岸", en: "Moonlit Lake", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 440, art: backgroundMoonlitLakeshore, previewClass: "moonlit-lakeshore" },
  { id: "background-cloud-station", category: "background", zh: "云端车站", en: "Cloud Station", rarityZh: "典藏场景", rarityEn: "Premium scene", price: 520, art: backgroundCloudStation, previewClass: "cloud-station" },
  { id: "background-honey-sunset", category: "background", zh: "蜜糖黄昏", en: "Honey Sunset", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 360, art: backgroundHoneySunset, previewClass: "honey-sunset" },
  { id: "background-sea-salt-bath", category: "background", zh: "海盐浴室", en: "Sea Salt Bath", rarityZh: "稀有场景", rarityEn: "Rare scene", price: 340, art: backgroundSeaSaltBath, previewClass: "sea-salt-bath" },
  { id: "background-milky-way-bedroom", category: "background", zh: "星河卧室", en: "Milky Way Bedroom", rarityZh: "典藏场景", rarityEn: "Premium scene", price: 500, art: backgroundMilkyWayBedroom, previewClass: "milky-way-bedroom" },
] as const;

export const DEFAULT_WARDROBE_SELECTION: WardrobeSelection = {
  skinId: "skin-cream",
  accessoryIds: [],
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
  const legacyAccessory = itemInCategory(row.accessoryId, "accessory") && row.accessoryId !== "accessory-none" ? [row.accessoryId as WardrobeAccessoryId] : [];
  const accessoryIds = (Array.isArray(row.accessoryIds) ? row.accessoryIds : legacyAccessory)
    .filter((item, index, values): item is WardrobeAccessoryId => itemInCategory(item, "accessory") && item !== "accessory-none" && values.indexOf(item) === index);
  return {
    skinId: itemInCategory(row.skinId, "skin") ? row.skinId as WardrobeSkinId : DEFAULT_WARDROBE_SELECTION.skinId,
    accessoryIds,
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
  for (const itemId of [equipped.skinId, ...equipped.accessoryIds, equipped.backgroundId]) {
    if (!unlockedItemIds.includes(itemId)) return { equipped: DEFAULT_WARDROBE_SELECTION, unlockedItemIds, balance: Math.round(balance) };
  }
  return { equipped, unlockedItemIds, balance: Math.round(balance) };
}

function readDemoState(): MascotWardrobeState {
  const fallback: MascotWardrobeState = {
    equipped: DEFAULT_WARDROBE_SELECTION,
    unlockedItemIds: [...freeIds, "skin-night-ink", "accessory-mist-beret", "accessory-star-moon-clip", "accessory-pearl-bow"],
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
    if (item.category === "accessory") equipped.accessoryIds = [item.id as WardrobeAccessoryId];
    if (item.category === "background") equipped.backgroundId = item.id as WardrobeBackgroundId;
    return writeDemoState({ ...current, equipped });
  }
  const result = await supabase.rpc("nava_select_mascot_wardrobe_item", { target_item: itemId });
  assertNoError(result.error);
  return normalizeState(result.data);
}

export async function equipMascotWardrobeLook(selection: WardrobeSelection): Promise<MascotWardrobeState> {
  const normalized = normalizeSelection(selection);
  if (isDemoMode()) {
    const current = readDemoState();
    const selectedIds = [normalized.skinId, ...normalized.accessoryIds, normalized.backgroundId];
    if (selectedIds.some((itemId) => !current.unlockedItemIds.includes(itemId))) throw new Error("这套搭配中还有尚未拥有的内容。");
    return writeDemoState({ ...current, equipped: normalized });
  }
  const result = await supabase.rpc("nava_select_mascot_wardrobe_look", {
    target_skin: normalized.skinId,
    target_accessories: normalized.accessoryIds,
    target_background: normalized.backgroundId,
  });
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
