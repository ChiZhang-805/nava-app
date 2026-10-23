import type { WardrobeAccessoryId } from "./mascotWardrobe";

type WornAccessoryId = Exclude<WardrobeAccessoryId, "accessory-none">;

// Each file contains the same canonical v9 cat and one fitted accessory,
// with local skeletal actions. One shared lossless fur atlas serves every look.
export const wardrobeWornModelUrls = {
  "accessory-bell-collar": new URL("../assets/mascot/models/worn/bell-collar.glb", import.meta.url).href,
  "accessory-cloud-scarf": new URL("../assets/mascot/models/worn/cloud-scarf.glb", import.meta.url).href,
  "accessory-mist-beret": new URL("../assets/mascot/models/worn/mist-beret.glb", import.meta.url).href,
  "accessory-star-moon-clip": new URL("../assets/mascot/models/worn/star-moon-clip.glb", import.meta.url).href,
  "accessory-pearl-bow": new URL("../assets/mascot/models/worn/pearl-bow.glb", import.meta.url).href,
  "accessory-mint-earmuffs": new URL("../assets/mascot/models/worn/mint-earmuffs.glb", import.meta.url).href,
  "accessory-honey-neck-warmer": new URL("../assets/mascot/models/worn/honey-neck-warmer.glb", import.meta.url).href,
  "accessory-cloud-backpack": new URL("../assets/mascot/models/worn/cloud-backpack.glb", import.meta.url).href,
  "accessory-fish-brooch": new URL("../assets/mascot/models/worn/fish-brooch.glb", import.meta.url).href,
  "accessory-laurel-crown": new URL("../assets/mascot/models/worn/laurel-crown.glb", import.meta.url).href,
  "accessory-sailor-hat": new URL("../assets/mascot/models/worn/sailor-hat.glb", import.meta.url).href,
  "accessory-cherry-bow": new URL("../assets/mascot/models/worn/cherry-bow.glb", import.meta.url).href,
  "accessory-star-glasses": new URL("../assets/mascot/models/worn/star-glasses.glb", import.meta.url).href,
  "accessory-raindrop-cape": new URL("../assets/mascot/models/worn/raindrop-cape.glb", import.meta.url).href,
  "accessory-aurora-scarf": new URL("../assets/mascot/models/worn/aurora-scarf.glb", import.meta.url).href,
  "accessory-lily-garland": new URL("../assets/mascot/models/worn/lily-garland.glb", import.meta.url).href,
  "accessory-night-voyage-cap": new URL("../assets/mascot/models/worn/night-voyage-cap.glb", import.meta.url).href,
} as const satisfies Record<WornAccessoryId, string>;

export function isWornAccessoryId(value: string): value is WornAccessoryId {
  return Object.prototype.hasOwnProperty.call(wardrobeWornModelUrls, value);
}
