import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609080001_reward_shop.sql", import.meta.url), "utf8");
const shop = readFileSync(new URL("../src/features/PointsShopExperience.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/features/OptionTwoHome.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/figma-v2.css", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/rewardShop.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../src/components/ShopCheckoutExperience.tsx", import.meta.url), "utf8");
const checkoutStyles = readFileSync(new URL("../src/components/shop-checkout-experience.css", import.meta.url), "utf8");

test("empty catalog presents explicit non-purchasable placeholders", () => {
  assert.match(service, /Array\.from\(\{ length: 4 \}/);
  assert.match(service, /name: locale === "zh" \? "商品待上架"/);
  assert.match(service, /pointPrice: null/);
  assert.match(service, /placeholder: true/);
  assert.match(shop, /定价：/);
  assert.match(shop, /待填写/);
  assert.match(shop, /disabled=\{cannotAdd\(item\)\}/);
  assert.match(shop, /points-shop-category-/);
  assert.match(styles, /\.points-shop-list \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
});

test("shop navigation exposes catalog, product detail, carousel, and cart routes", () => {
  assert.match(home, /onViewChange\("points-shop"\)/);
  assert.match(shop, /points-shop-product-/);
  assert.match(shop, /points-shop-cart/);
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
});

test("shop navigation returns home explicitly and replaces internal shop history", () => {
  assert.match(home, /onHome=\{\(\) => onViewChange\(null, true\)\}/);
  assert.match(shop, /<Home size=\{21\}/);
  assert.match(shop, /返回首页/);
  assert.match(shop, /onViewChange\(nextView, true\)/);
  assert.doesNotMatch(shop, /const back = activeRoute/);
  assert.doesNotMatch(shop, /<ArrowLeft/);
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

test("checkout reuses one request key and only celebrates a confirmed server result", () => {
  assert.match(service, /checkoutRewardCart\(requestKey: string = crypto\.randomUUID\(\)\)/);
  assert.match(service, /request_key: requestKey/);
  assert.match(shop, /checkoutRequestRef/);
  assert.match(shop, /setCheckoutSession\(\{ lines, expectedTotal, result: null \}\)/);
  assert.match(shop, /setCheckoutSession\(\(current\) => current \? \{ \.\.\.current, result \}/);
  assert.match(shop, /classList\.toggle\("has-shop-checkout", Boolean\(checkoutSession\)\)/);
  assert.doesNotMatch(styles, /:has\(\.shop-checkout-experience\)/);
  assert.doesNotMatch(shop, /points-shop-success/);
});

test("receipt leads into one persistent animated mascot completion scene", () => {
  assert.match(checkout, /"checking" \| "card" \| "printing" \| "receipt" \| "complete"/);
  assert.match(checkout, /className="shop-receipt"/);
  assert.match(checkout, /className="shop-payment-terminal"/);
  assert.match(checkout, /className="shop-receipt-printer"/);
  assert.match(checkout, /className="shop-checkout-cat"/);
  assert.match(checkout, /setPhase\("complete"\)/);
  assert.match(checkout, /complete:\s*14500/);
  assert.match(checkout, /printing:\s*3300/);
  assert.match(checkout, /receipt:\s*8100/);
  assert.match(checkout, /phase === "receipt" && settled/);
  assert.match(checkout, /查看兑换凭证/);
  assert.doesNotMatch(checkout, /phase === "receipt" && \(\s*<button[^>]*>\s*\{locale === "zh" \? "继续"/);
  assert.match(checkoutStyles, /\[data-checkout-phase="checking"\] \.shop-checkout-cat/);
  assert.match(checkoutStyles, /\[data-checkout-phase="card"\] \.shop-checkout-cat/);
  assert.match(checkoutStyles, /\[data-checkout-phase="printing"\] \.shop-checkout-cat/);
  assert.match(checkoutStyles, /\[data-checkout-phase="receipt"\] \.shop-checkout-cat/);
  assert.match(checkoutStyles, /\[data-checkout-phase="complete"\] \.shop-checkout-cat/);
  assert.match(checkoutStyles, /\.shop-checkout-copy h1[^}]*clamp\(28px/);
  assert.match(checkoutStyles, /\.shop-receipt dl div[^}]*font-size:\s*14px/);
  assert.match(checkoutStyles, /@media \(prefers-reduced-motion: reduce\)/);
});
