import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/features/MascotWardrobe.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/features/mascot-wardrobe.css", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/mascotWardrobe.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/features/ProfileScreen.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/202610130001_mascot_wardrobe.sql", import.meta.url), "utf8");
const multiAccessoryMigration = readFileSync(new URL("../supabase/migrations/202610130002_mascot_wardrobe_multi_accessories.sql", import.meta.url), "utf8");

test("profile quick access and the app shell expose the cat wardrobe", () => {
  assert.match(profile, /id: "wardrobe", zh: "小猫衣橱"/);
  assert.match(profile, /data-profile-view="wardrobe"/);
  assert.match(profile, /lazy\(\(\) => import\("\.\/MascotWardrobe"\)\)/);
});

test("wardrobe artwork is layered instead of relying on fixed composites", () => {
  assert.match(component, /className="mascot-wardrobe-skin"/);
  assert.match(component, /className="mascot-wardrobe-accessory"/);
  assert.match(component, /is-\$\{background\.previewClass\}/);
  assert.match(service, /accessory-cloud-scarf\.png/);
  assert.match(service, /accessory-mist-beret\.png/);
  assert.match(service, /accessory-bell-collar\.png/);
  assert.doesNotMatch(service, /id: "accessory-none", category: "accessory"/);
  assert.match(component, /accessories\.map/);
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
  assert.match(styles, /@media \(max-width: 374px\)/);
  assert.match(styles, /@media \(min-width: 420px\) and \(min-height: 860px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /grid-template-rows: repeat\(2,/);
  assert.match(styles, /overflow-x: auto/);
  assert.match(styles, /grid-template-columns: repeat\(3,/);
});

test("wardrobe catalog uses exactly one white card layer and a flat bottom action", () => {
  assert.match(styles, /\.mascot-wardrobe-item \{[^}]*background: rgba\(255,255,255,\.72\);[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-item\[data-selected="true"\] \{[^}]*border: 2px solid #7479f3;[^}]*background: rgba\(255,255,255,\.78\);[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-item-art \{[^}]*background: transparent;/s);
  assert.match(styles, /\.mascot-wardrobe-action \{[^}]*margin-top: auto;[^}]*border: 0;[^}]*background: transparent;[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-action button,[^{]+\{[^}]*box-shadow: none;/s);
  assert.match(styles, /\.mascot-wardrobe-status > strong \{[^}]*color: #fff !important;/s);
});

test("accessories can be selected together and persisted as one look", () => {
  assert.match(component, /accessoryIds: preview\.accessoryIds\.includes/);
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
  assert.match(service, /nava_select_mascot_wardrobe_item/);
  assert.match(service, /nava_unlock_mascot_wardrobe_item/);
  assert.match(service, /if \(isDemoMode\(\)\)/);
});
