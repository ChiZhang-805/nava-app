export const APP_SKINS = [
  {
    id: "glacier-mist",
    name: "冰川晨雾",
    nameEn: "Glacier Mist",
    description: "清透冰蓝与深海导航",
    descriptionEn: "Icy glass with deep-ocean navigation",
  },
  {
    id: "violet-dusk",
    name: "星河暮紫",
    nameEn: "Violet Galaxy",
    description: "暮紫、星蓝与流光青",
    descriptionEn: "Violet dusk, starlight blue and cyan",
  },
  {
    id: "sky-ripple",
    name: "晴空微澜",
    nameEn: "Sky Ripples",
    description: "晴空浅蓝与柔和青绿",
    descriptionEn: "Airy sky blue with soft teal",
  },
] as const;

export type AppSkin = (typeof APP_SKINS)[number]["id"];

const storagePrefix = "nava.app-skin.v1";
export const defaultAppSkin: AppSkin = "glacier-mist";

export function normalizeAppSkin(value: string | null | undefined): AppSkin {
  return APP_SKINS.some((skin) => skin.id === value) ? value as AppSkin : defaultAppSkin;
}

export function appSkinStorageKey(userId?: string | null) {
  return `${storagePrefix}:${userId || "anonymous"}`;
}

export function readAppSkin(userId?: string | null): AppSkin {
  try {
    return normalizeAppSkin(window.localStorage.getItem(appSkinStorageKey(userId)));
  } catch {
    return defaultAppSkin;
  }
}

export function writeAppSkin(skin: AppSkin, userId?: string | null) {
  try {
    window.localStorage.setItem(appSkinStorageKey(userId), normalizeAppSkin(skin));
  } catch {
    // A private browser may reject storage; the in-memory selection still works.
  }
}
