import baseFront from "../assets/wardrobe/front/accessory-none.png";
import baseMotionBody from "../assets/wardrobe/motion/cat-body-base.png";
import baseMotionRightPaw from "../assets/wardrobe/motion/cat-right-paw.png";
import auroraScarfFront from "../assets/wardrobe/front/accessory-aurora-scarf.png";
import bellCollarFront from "../assets/wardrobe/front/accessory-bell-collar.png";
import cherryBowFront from "../assets/wardrobe/front/accessory-cherry-bow.png";
import cloudBackpackFront from "../assets/wardrobe/front/accessory-cloud-backpack.png";
import cloudScarfFront from "../assets/wardrobe/front/accessory-cloud-scarf.png";
import fishBroochFront from "../assets/wardrobe/front/accessory-fish-brooch.png";
import honeyNeckWarmerFront from "../assets/wardrobe/front/accessory-honey-neck-warmer.png";
import laurelCrownFront from "../assets/wardrobe/front/accessory-laurel-crown.png";
import lilyGarlandFront from "../assets/wardrobe/front/accessory-lily-garland.png";
import mintEarmuffsFront from "../assets/wardrobe/front/accessory-mint-earmuffs.png";
import mistBeretFront from "../assets/wardrobe/front/accessory-mist-beret.png";
import nightVoyageCapFront from "../assets/wardrobe/front/accessory-night-voyage-cap.png";
import pearlBowFront from "../assets/wardrobe/front/accessory-pearl-bow.png";
import raindropCapeFront from "../assets/wardrobe/front/accessory-raindrop-cape.png";
import sailorHatFront from "../assets/wardrobe/front/accessory-sailor-hat.png";
import starGlassesFront from "../assets/wardrobe/front/accessory-star-glasses.png";
import starMoonClipFront from "../assets/wardrobe/front/accessory-star-moon-clip.png";
import type { WardrobeAccessoryId } from "./mascotWardrobe";

export const wardrobe2dFrontImages: Readonly<Record<WardrobeAccessoryId, string>> = {
  "accessory-none": baseFront,
  "accessory-bell-collar": bellCollarFront,
  "accessory-cloud-scarf": cloudScarfFront,
  "accessory-mist-beret": mistBeretFront,
  "accessory-star-moon-clip": starMoonClipFront,
  "accessory-pearl-bow": pearlBowFront,
  "accessory-mint-earmuffs": mintEarmuffsFront,
  "accessory-honey-neck-warmer": honeyNeckWarmerFront,
  "accessory-cloud-backpack": cloudBackpackFront,
  "accessory-fish-brooch": fishBroochFront,
  "accessory-laurel-crown": laurelCrownFront,
  "accessory-sailor-hat": sailorHatFront,
  "accessory-cherry-bow": cherryBowFront,
  "accessory-star-glasses": starGlassesFront,
  "accessory-raindrop-cape": raindropCapeFront,
  "accessory-aurora-scarf": auroraScarfFront,
  "accessory-lily-garland": lilyGarlandFront,
  "accessory-night-voyage-cap": nightVoyageCapFront,
};

export const wardrobe2dBaseMotionLayers = {
  body: baseMotionBody,
  rightPaw: baseMotionRightPaw,
} as const;

export function wardrobe2dFrontImage(accessoryIds: WardrobeAccessoryId[]) {
  const selected = accessoryIds.length ? accessoryIds[accessoryIds.length - 1] : "accessory-none";
  return wardrobe2dFrontImages[selected];
}
