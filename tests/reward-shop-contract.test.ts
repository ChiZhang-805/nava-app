import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609080001_reward_shop.sql", import.meta.url), "utf8");
const shop = readFileSync(new URL("../src/features/PointsShopExperience.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/features/OptionTwoHome.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/figma-v2.css", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/rewardShop.ts", import.meta.url), "utf8");

test("empty catalog presents explicit non-purchasable placeholders", () => {
  assert.match(service, /Array\.from\(\{ length: 4 \}/);
  assert.match(service, /name: locale === "zh" \? "商品待上架"/);
  assert.match(service, /pointPrice: null/);
  assert.match(service, /placeholder: true/);
  assert.match(shop, /定价：/);
  assert.match(shop, /待填写/);
  assert.match(shop, /disabled=\{disabled/);
});

test("shop navigation exposes catalog, product detail, carousel, and cart routes", () => {
  assert.match(home, /onViewChange\("points-shop"\)/);
  assert.match(shop, /points-shop-product-/);
  assert.match(shop, /points-shop-cart/);
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
});

test("checkout serializes users and locks products before decrementing inventory", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /FOR UPDATE OF p/);
  assert.match(migration, /inventory_remaining < line_item\.quantity/);
  assert.match(migration, /SET inventory_remaining = inventory_remaining - line_item\.quantity/);
  assert.match(migration, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(migration, /available_points < checkout_total/);
});

test("inventory quantity is not granted to authenticated clients", () => {
  const grant = migration.match(/GRANT SELECT \(([^)]+)\)\s*ON public\.reward_products TO authenticated/s)?.[1] ?? "";
  assert.ok(grant.length > 0);
  assert.doesNotMatch(grant, /inventory_remaining/);
  assert.match(grant, /sold_out/);
  assert.match(migration, /Users can view own reward cart/);
  assert.match(migration, /Users can view own reward orders/);
});
