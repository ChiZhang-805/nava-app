import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWardrobeAccessories, toggleWardrobeAccessory, wardrobeAccessorySlots } from "../src/services/wardrobeAccessorySlots.ts";

const component = readFileSync(new URL("../src/features/MascotWardrobe.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/features/mascot-wardrobe.css", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/mascotWardrobe.ts", import.meta.url), "utf8");
const wornModels = readFileSync(new URL("../src/services/wardrobeWornModels.ts", import.meta.url), "utf8");
const flatFronts = readFileSync(new URL("../src/services/wardrobe2d.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/features/ProfileScreen.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610130001_mascot_wardrobe.sql", import.meta.url), "utf8");
const multiAccessoryMigration = readFileSync(new URL("../supabase/migrations/202610130002_mascot_wardrobe_multi_accessories.sql", import.meta.url), "utf8");
const expandedCatalogMigration = readFileSync(new URL("../supabase/migrations/202610130003_expand_mascot_wardrobe_catalog.sql", import.meta.url), "utf8");

test("profile quick access and the app shell expose the cat wardrobe", () => {
  assert.match(profile, /id: "wardrobe", zh: "小猫衣橱"/);
  assert.match(profile, /data-profile-view="wardrobe"/);
  assert.match(profile, /lazy\(\(\) => import\("\.\/MascotWardrobe"\)\)/);
});

test("wardrobe artwork is layered instead of relying on fixed composites", () => {
  assert.match(component, /className="mascot-wardrobe-skin"/);
  assert.match(component, /className="mascot-wardrobe-accessory"/);
  assert.match(component, /className="mascot-wardrobe-background"/);
  assert.match(component, /is-\$\{background\.previewClass\}/);
  assert.match(service, /accessory-cloud-scarf\.png/);
  assert.match(service, /accessory-mist-beret\.png/);
  assert.match(service, /accessory-bell-collar\.png/);
  assert.doesNotMatch(service, /id: "accessory-none", category: "accessory"/);
  assert.match(component, /accessories\.map/);
});

test("wardrobe exposes exactly 17 visual choices in every category", () => {
  assert.equal((service.match(/category: "skin"/g) ?? []).length, 17);
  assert.equal((service.match(/category: "accessory"/g) ?? []).length, 17);
  assert.equal((service.match(/category: "background"/g) ?? []).length, 17);
  assert.equal((expandedCatalogMigration.match(/\('skin-/g) ?? []).length, 13);
  assert.equal((expandedCatalogMigration.match(/\('accessory-/g) ?? []).length, 14);
  assert.equal((expandedCatalogMigration.match(/\('background-/g) ?? []).length, 13);
  assert.match(service, /background-milky-way-bedroom\.jpg/);
  assert.match(service, /accessory-night-voyage-cap\.png/);
  assert.match(service, /mascot-star-sand\.png/);
});

test("the eight Figma wardrobe states have working interaction counterparts", () => {
  assert.match(component, /skin: \{ zh: "皮肤"/);
  assert.match(component, /accessory: \{ zh: "饰品"/);
  assert.match(component, /background: \{ zh: "背景"/);
  assert.match(component, /"confirm" \| "success" \| "insufficient"/);
  assert.match(component, /当前搭配/);
  assert.doesNotMatch(component, /正在试穿|未拥有/);
  assert.match(component, /切换到二维正面/);
  assert.match(component, /wardrobe2dFrontImage/);
  assert.doesNotMatch(component, /captureFrontFrames|toDataURL/);
  assert.match(component, /确认兑换/);
  assert.match(component, /立即穿戴/);
  assert.match(component, /代币还差一点/);
  assert.match(component, /disabled=\{busy !== null \|\| exactCurrentLook\}/);
});

test("2D mode maps the approved base and 17 accessory fronts", () => {
  assert.equal((flatFronts.match(/\.\.\/assets\/wardrobe\/front\/accessory-/g) ?? []).length, 18);
  assert.equal((flatFronts.match(/^ {2}"accessory-[^"]+":/gm) ?? []).length, 18);
  assert.match(flatFronts, /"accessory-none": baseFront/);
  assert.match(flatFronts, /"accessory-bell-collar": bellCollarFront/);
  assert.match(flatFronts, /accessoryIds\[accessoryIds\.length - 1\]/);
  assert.match(flatFronts, /wardrobe2dBaseMotionLayers/);
  assert.match(component, /className="mascot-wardrobe-flat-rig"/);
  assert.match(component, /className="mascot-wardrobe-flat-paw"/);
  assert.match(component, /setPlayingMotion\("wave"\)/);
  assert.match(styles, /@keyframes wardrobe-2d-double-wave/);
  assert.match(styles, /@keyframes wardrobe-2d-ambient-wave/);
});

test("wardrobe layout retains touch targets and responsive phone states", () => {
  assert.match(styles, /\.mascot-wardrobe-tabs button \{[^}]*min-height: 40px/s);
  assert.match(styles, /\.mascot-wardrobe-action button,[^{]+\{[^}]*min-height: 48px/s);
  assert.match(styles, /@container wardrobe-page \(max-width: 342px\)/);
  assert.match(styles, /@container wardrobe-page \(min-width: 388px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /grid-template-rows: repeat\(2,/);
  assert.match(styles, /overflow-x: auto/);
  assert.match(styles, /\.mascot-wardrobe-page \{[^}]*grid-template-columns: repeat\(2,/s);
  assert.match(component, /Math\.ceil\(currentItems\.length \/ 4\)/);
  assert.match(component, /currentItems\.slice\(index \* 4, index \* 4 \+ 4\)/);
  assert.match(component, /className="mascot-wardrobe-preview-frame"/);
  assert.match(styles, /\.mascot-wardrobe-preview-frame \{[^}]*border: 1px dashed[^}]*pointer-events: none;/s);
  assert.match(styles, /data-app-skin="glacier-mist"[^}]+\.mascot-wardrobe-preview/s);
  assert.match(styles, /data-app-skin="violet-dusk"[^}]+\.mascot-wardrobe-preview/s);
  assert.match(styles, /data-app-skin="sky-ripple"[^}]+\.mascot-wardrobe-preview/s);
  assert.match(component, /className="mascot-wardrobe-pagination"/);
  assert.match(component, /onScroll=\{\(event\) =>/);
  assert.match(component, /scrollToPage\(pageIndex\)/);
  assert.match(styles, /\.mascot-wardrobe-pagination button\.is-active/);
  assert.match(component, /page\?\.offsetLeft/);
});

test("wardrobe catalog uses exactly one white card layer and a flat bottom action", () => {
  assert.match(styles, /\.mascot-wardrobe-item \{[^}]*background: rgba\(255,255,255,\.72\);[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-item\[data-selected="true"\] \{[^}]*border: 2px solid #7479f3;[^}]*background: rgba\(255,255,255,\.78\);[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-item-art \{[^}]*background: transparent;/s);
  assert.match(styles, /\.mascot-wardrobe-action \{[^}]*margin-top: auto;[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-action button,[^{]+\{[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-status > strong \{[^}]*color: #fff !important;/s);
});

test("every accessory choice maps to one complete worn-cat GLB", () => {
  assert.match(component, /accessoryIds: toggleWardrobeAccessory\(preview\.accessoryIds, accessoryId\)/);
  assert.match(component, /equipMascotWardrobeLook\(preview\)/);
  assert.match(service, /accessoryIds: WardrobeAccessoryId\[\]/);
  assert.match(service, /nava_select_mascot_wardrobe_look/);
  assert.match(multiAccessoryMigration, /add column accessory_ids text\[\]/i);
  const ids = [...service.matchAll(/id: "(accessory-[^"]+)", category: "accessory"/g)].map((match) => match[1]);
  assert.equal((wornModels.match(/\.glb", import\.meta\.url/g) ?? []).length, 17);
  for (const id of ids) assert.match(wornModels, new RegExp(`"${id}"`));
});

test("wardrobe redemption is authenticated, idempotent and shares reward balance", () => {
  assert.match(migration, /user_mascot_wardrobe_unlocks/);
  assert.match(migration, /user_mascot_wardrobe_preferences/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /unique \(user_id, idempotency_key\)/i);
  assert.match(migration, /available_points < item_record\.point_price/);
  assert.match(migration, /earned - order_spend - card_spend - wardrobe_spend/);
  assert.match(migration, /auth\.uid\(\) = user_id/);
  assert.match(service, /nava_mascot_wardrobe_state/);
  assert.match(service, /nava_select_mascot_wardrobe_look/);
  assert.match(service, /nava_unlock_mascot_wardrobe_item/);
  assert.match(service, /if \(isDemoMode\(\)\)/);
});

test("every catalog accessory has exactly one internal fitting slot", () => {
  const ids = [...service.matchAll(/id: "(accessory-[^"]+)", category: "accessory"/g)].map((match) => match[1]);
  assert.deepEqual(Object.keys(wardrobeAccessorySlots).sort(), ids.sort());
});

test("choosing any accessory replaces the previous complete worn model", () => {
  const original = ["accessory-mist-beret", "accessory-cloud-scarf", "accessory-star-glasses"] as const;
  const changed = toggleWardrobeAccessory(original, "accessory-cherry-bow");
  assert.deepEqual(changed, ["accessory-cherry-bow"]);
  assert.deepEqual(toggleWardrobeAccessory(changed, "accessory-cherry-bow"), []);
  assert.deepEqual(toggleWardrobeAccessory(changed, "accessory-pearl-bow"), ["accessory-pearl-bow"]);
  assert.deepEqual(original, ["accessory-mist-beret", "accessory-cloud-scarf", "accessory-star-glasses"]);
});

test("legacy outfits restore only the last valid accessory", () => {
  const legacy = ["accessory-cloud-scarf", "accessory-mist-beret", "accessory-bell-collar", "accessory-sailor-hat", "accessory-none", null, "toString", "invalid", "accessory-fish-brooch"];
  const restored = normalizeWardrobeAccessories(legacy);
  assert.deepEqual(restored, ["accessory-fish-brooch"]);
  assert.deepEqual(normalizeWardrobeAccessories(restored), restored);
  assert.deepEqual(normalizeWardrobeAccessories([]), []);
  assert.deepEqual(toggleWardrobeAccessory(restored, "accessory-cloud-scarf"), ["accessory-cloud-scarf"]);
});

test("all 17 accessories normalize individually and a sequence keeps the latest", () => {
  const ids = Object.keys(wardrobeAccessorySlots) as (keyof typeof wardrobeAccessorySlots)[];
  assert.equal(ids.length, 17);
  for (const id of ids) assert.deepEqual(normalizeWardrobeAccessories([id]), [id]);
  assert.deepEqual(normalizeWardrobeAccessories(ids), [ids.at(-1)]);
});
