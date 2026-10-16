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
  const occupied = new Set<WardrobeAccessorySlot>();
  const selected: WardrobeAccessoryId[] = [];
  // Last selection wins, including when restoring outfits saved by older clients.
  for (let index = values.length - 1; index >= 0; index--) {
    const value = values[index];
    if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(wardrobeAccessorySlots, value)) continue;
    const id = value as keyof typeof wardrobeAccessorySlots;
    const slot = wardrobeAccessorySlots[id];
    if (!occupied.has(slot)) { occupied.add(slot); selected.push(id); }
  }
  return selected.reverse();
}

export function toggleWardrobeAccessory(values: readonly WardrobeAccessoryId[], id: WardrobeAccessoryId) {
  const current = normalizeWardrobeAccessories(values);
  return current.includes(id)
    ? current.filter((selected) => selected !== id)
    : normalizeWardrobeAccessories([...current, id]);
}
