import type { WardrobeAccessoryId } from "./mascotWardrobe";

export type WardrobeAccessorySlot = "head" | "neck" | "face" | "chest" | "body" | "back";

// Internal fitting regions; the catalog keeps its existing presentation.
export const wardrobeAccessorySlots = {
  "accessory-bell-collar": "neck",
  "accessory-cloud-scarf": "neck",
  "accessory-mist-beret": "head",
  "accessory-star-moon-clip": "head",
  "accessory-pearl-bow": "neck",
  "accessory-mint-earmuffs": "head",
  "accessory-honey-neck-warmer": "neck",
  "accessory-cloud-backpack": "back",
  "accessory-fish-brooch": "chest",
  "accessory-laurel-crown": "head",
  "accessory-sailor-hat": "head",
  "accessory-cherry-bow": "head",
  "accessory-star-glasses": "face",
  "accessory-raindrop-cape": "body",
  "accessory-aurora-scarf": "neck",
  "accessory-lily-garland": "head",
  "accessory-night-voyage-cap": "head",
} as const satisfies Record<Exclude<WardrobeAccessoryId, "accessory-none">, WardrobeAccessorySlot>;

export function normalizeWardrobeAccessories(values: readonly unknown[]): WardrobeAccessoryId[] {
  // Temporary full-model review mode: every choice is a complete cat wearing
  // one accessory, so the last valid choice replaces every earlier one.
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index];
    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(wardrobeAccessorySlots, value)) continue;
    return [value as keyof typeof wardrobeAccessorySlots];
  }
  return [];
}

export function toggleWardrobeAccessory(values: readonly WardrobeAccessoryId[], id: WardrobeAccessoryId) {
  const current = normalizeWardrobeAccessories(values);
  return current.includes(id)
    ? current.filter((selected) => selected !== id)
    : normalizeWardrobeAccessories([...current, id]);
}
