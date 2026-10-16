import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWardrobeAccessories, toggleWardrobeAccessory, wardrobeAccessorySlots } from "../src/services/wardrobeAccessorySlots.ts";

const component = readFileSync(new URL("../src/features/MascotWardrobe.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/features/mascot-wardrobe.css", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/mascotWardrobe.ts", import.meta.url), "utf8");
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
  assert.match(component, /正在试穿/);
  assert.match(component, /确认兑换/);
  assert.match(component, /立即穿戴/);
  assert.match(component, /代币还差一点/);
  assert.match(component, /disabled=\{busy !== null \|\| exactCurrentLook\}/);
});

test("wardrobe layout retains touch targets and responsive phone states", () => {
  assert.match(styles, /\.mascot-wardrobe-tabs button \{[^}]*min-height: 40px/s);
  assert.match(styles, /\.mascot-wardrobe-action button,[^{]+\{[^}]*min-height: 48px/s);
  assert.match(styles, /@container wardrobe-page \(max-width: 342px\)/);
  assert.match(styles, /@container wardrobe-page \(min-width: 388px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /grid-template-rows: repeat\(2,/);
  assert.match(styles, /overflow-x: auto/);
  assert.match(styles, /grid-template-columns: repeat\(3,/);
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

test("different fitting slots can be selected together and persisted as one look", () => {
  assert.match(component, /accessoryIds: toggleWardrobeAccessory\(preview\.accessoryIds, accessoryId\)/);
  assert.match(component, /equipMascotWardrobeLook\(preview\)/);
  assert.match(service, /accessoryIds: WardrobeAccessoryId\[\]/);
  assert.match(service, /nava_select_mascot_wardrobe_look/);
  assert.match(multiAccessoryMigration, /add column accessory_ids text\[\]/i);
  assert.match(multiAccessoryMigration, /nava_select_mascot_wardrobe_look/);
  assert.match(multiAccessoryMigration, /wardrobe look contains unavailable or locked item/);
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

test("changing headwear replaces it immediately while retaining the scarf and glasses", () => {
  const original = ["accessory-mist-beret", "accessory-cloud-scarf", "accessory-star-glasses"] as const;
  const changed = toggleWardrobeAccessory(original, "accessory-cherry-bow");
  assert.deepEqual(changed, ["accessory-cloud-scarf", "accessory-star-glasses", "accessory-cherry-bow"]);
  assert.deepEqual(toggleWardrobeAccessory(changed, "accessory-cherry-bow"), ["accessory-cloud-scarf", "accessory-star-glasses"]);
  assert.deepEqual(original, ["accessory-mist-beret", "accessory-cloud-scarf", "accessory-star-glasses"]);
});

test("legacy outfits restore the last item per slot without inventing a selection", () => {
  const legacy = ["accessory-cloud-scarf", "accessory-mist-beret", "accessory-bell-collar", "accessory-sailor-hat", "accessory-none", null, "toString", "invalid", "accessory-fish-brooch"];
  const restored = normalizeWardrobeAccessories(legacy);
  assert.deepEqual(restored, ["accessory-bell-collar", "accessory-sailor-hat", "accessory-fish-brooch"]);
  assert.deepEqual(normalizeWardrobeAccessories(restored), restored);
  assert.deepEqual(normalizeWardrobeAccessories([]), []);
  assert.deepEqual(toggleWardrobeAccessory(restored, "accessory-cloud-scarf"), ["accessory-sailor-hat", "accessory-fish-brooch", "accessory-cloud-scarf"]);
});

test("all 863 non-empty six-slot combinations normalize without conflicts", () => {
  const slots = ["head", "neck", "face", "chest", "body", "back"] as const;
  const choices = slots.map((slot) => Object.entries(wardrobeAccessorySlots)
    .filter(([, itemSlot]) => itemSlot === slot)
    .map(([id]) => id));
  let visited = 0;
  const walk = (slotIndex: number, selected: string[]) => {
    if (slotIndex === choices.length) {
      if (selected.length === 0) return;
      const normalized = normalizeWardrobeAccessories(selected);
      assert.deepEqual(normalized, selected);
      assert.equal(new Set(normalized.map((id) => wardrobeAccessorySlots[id])).size, normalized.length);
      visited++;
      return;
    }
    walk(slotIndex + 1, selected);
    for (const id of choices[slotIndex]) walk(slotIndex + 1, [...selected, id]);
  };
  walk(0, []);
  assert.equal(visited, 863);
});

test("the catalog contains exactly 40 distinct headwear and neckwear pairs", () => {
  const head = Object.entries(wardrobeAccessorySlots).filter(([, slot]) => slot === "head").map(([id]) => id);
  const neck = Object.entries(wardrobeAccessorySlots).filter(([, slot]) => slot === "neck").map(([id]) => id);
  const pairs = head.flatMap((headId) => neck.map((neckId) => normalizeWardrobeAccessories([headId, neckId])));
  assert.equal(head.length, 8);
  assert.equal(neck.length, 5);
  assert.equal(pairs.length, 40);
  assert.equal(new Set(pairs.map((pair) => pair.join("+"))).size, 40);
  assert.ok(pairs.every((pair) => pair.length === 2));
});
