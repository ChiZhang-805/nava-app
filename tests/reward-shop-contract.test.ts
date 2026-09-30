import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/202609080001_reward_shop.sql", import.meta.url), "utf8");
const shop = readFileSync(new URL("../src/features/PointsShopExperience.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../src/features/OptionTwoHome.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/figma-v2.css", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/rewardShop.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../src/components/ShopCheckoutExperience.tsx", import.meta.url), "utf8");
const terminal = readFileSync(new URL("../src/components/ShopPaymentTerminal.tsx", import.meta.url), "utf8");
const checkoutStyles = readFileSync(new URL("../src/components/shop-checkout-experience.css", import.meta.url), "utf8");
const cardMigration = readFileSync(new URL("../supabase/migrations/202609280001_reward_card_skins.sql", import.meta.url), "utf8");
const cards = readFileSync(new URL("../src/services/rewardCards.ts", import.meta.url), "utf8");
const gallery = readFileSync(new URL("../src/components/PointsCardGallery.tsx", import.meta.url), "utf8");

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
  assert.match(shop, /points-shop-cards/);
  assert.match(shop, /管理我的积分卡/);
  assert.match(styles, /scroll-snap-type:\s*x mandatory/);
});

test("shop navigation returns home explicitly and replaces internal shop history", () => {
  assert.match(home, /onHome=\{\(\) => onViewChange\(null, true\)\}/);
  assert.match(shop, /<Home size=\{21\}/);
  assert.match(shop, /返回首页/);
  assert.match(shop, /onViewChange\(nextView, true\)/);
  assert.doesNotMatch(shop, /const back = activeRoute/);
  assert.match(shop, /activeRoute === "add-card" \? <button[^\n]+onClick=\{\(\) => openItem\("points-shop-cards"\)\}/);
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
  assert.match(shop, /setCheckoutSession\(\{ lines, expectedTotal, result: null, started: false, selectedCardId: cardState\?\.selectedCardId \?\? "mint-growth" \}\)/);
  assert.match(shop, /async function checkout\(selectedCardId: PointsCardSkinId\)/);
  assert.match(shop, /started: true, selectedCardId/);
  assert.match(shop, /setCheckoutSession\(\(current\) => current \? \{ \.\.\.current, result \}/);
  assert.match(shop, /classList\.toggle\("has-shop-checkout", Boolean\(checkoutSession\)\)/);
  assert.doesNotMatch(styles, /:has\(\.shop-checkout-experience\)/);
  assert.doesNotMatch(shop, /points-shop-success/);
});

test("checkout requires a card choice and uses an animated printer cat", () => {
  assert.match(checkout, /"select" \| "confirm" \| "checking" \| "card" \| "placed" \| "printing" \| "receipt"/);
  assert.match(cards, /mint-growth\.webp/);
  assert.match(cards, /warm-companion\.webp/);
  assert.match(cards, /starlit-ideas\.webp/);
  assert.match(cards, /lavender-reading\.webp/);
  assert.match(cards, /seaside-studio\.webp/);
  assert.match(cards, /sunset-garden\.webp/);
  assert.match(checkout, /printer-cat-press-sprite\.png/);
  assert.match(checkout, /role="radiogroup"/);
  assert.match(checkout, /横向滑动选择积分卡卡面/);
  assert.match(checkout, /onScroll=\{syncCardFromScroll\}/);
  assert.match(checkout, /今天，想让哪张卡陪你？/);
  assert.match(checkout, /使用这张卡片/);
  assert.match(checkout, /"Choose Card"/);
  assert.match(checkout, /"Confirm Order"/);
  assert.match(checkout, /"Order Placed"/);
  assert.match(checkout, /"Continue"/);
  assert.doesNotMatch(checkout, /可用总积分|挑一张今天想带上的卡面|第 \$\{chosenCardIndex \+ 1\} 张/);
  assert.match(checkout, /shop-card-picker-pages/);
  assert.match(checkout, /shop-order-confirmation/);
  assert.match(checkout, /shop-order-details/);
  assert.doesNotMatch(checkout, /shop-card-picker-current|shop-card-picker-balance/);
  assert.match(checkout, /setPhase\("confirm"\)/);
  assert.match(checkout, /setPhase\("checking"\);\s*onConfirmCard\(chosenCard\.id\)/);
  assert.match(checkout, /onConfirmCard\(chosenCard\.id\)/);
  assert.match(checkout, /className="shop-receipt"/);
  assert.match(terminal, /className="shop-payment-terminal"/);
  assert.match(checkout, /className="shop-receipt-printer"/);
  assert.match(checkout, /className="shop-checkout-cat"/);
  assert.doesNotMatch(checkout, /animatedSrc=/);
  assert.doesNotMatch(checkout, /setPhase\("complete"\)|phase === "receipt" && settled|查看兑换凭证/);
  assert.match(checkout, /placed:\s*3200/);
  assert.match(checkout, /receipt:\s*4700/);
  assert.match(checkout, /phase === "placed"/);
  assert.match(checkout, /phase === "receipt"/);
  assert.match(checkoutStyles, /\[data-checkout-phase="printing"\] \.shop-checkout-cat/);
  assert.match(checkoutStyles, /\[data-checkout-phase="receipt"\] \.shop-checkout-cat/);
  assert.match(checkoutStyles, /@keyframes shop-cat-paw-press/);
  assert.match(checkoutStyles, /@keyframes shop-cat-breathe/);
  assert.match(checkoutStyles, /@keyframes shop-machine-button/);
  assert.match(checkoutStyles, /\.shop-card-picker-list \{[^}]*overflow-x:\s*auto/);
  assert.match(checkoutStyles, /\.shop-card-picker-list \{[^}]*scroll-snap-type:\s*x mandatory/);
  assert.match(checkoutStyles, /\.shop-card-picker-list button \{[^}]*aspect-ratio:\s*\.6/);
  assert.match(checkoutStyles, /\.shop-card-picker-pages button\[aria-current="true"\]/);
  assert.match(checkoutStyles, /\.shop-card-picker-list button \{[^}]*border-radius:\s*25px/);
  assert.match(checkoutStyles, /\.shop-order-card \{[^}]*aspect-ratio:\s*1\.62/);
  assert.match(checkoutStyles, /\[data-checkout-phase="placed"\] \.shop-terminal-summary/);
  assert.match(checkoutStyles, /\.shop-card-chip/);
  assert.match(checkoutStyles, /\.shop-card-contactless/);
  assert.doesNotMatch(checkoutStyles, /\.shop-complete-card/);
  assert.match(checkoutStyles, /\.shop-checkout-copy h1[^}]*clamp\(28px/);
  assert.match(checkoutStyles, /\.shop-receipt dl div[^}]*font-size:\s*16px/);
  assert.match(checkoutStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("points-card skins share one balance and additional cards cost ten points atomically", () => {
  assert.match(cardMigration, /reward_card_skins/);
  assert.match(cardMigration, /user_reward_card_unlocks/);
  assert.match(cardMigration, /points_spent integer not null default 10 check \(points_spent = 10\)/i);
  assert.match(cardMigration, /pg_advisory_xact_lock/);
  assert.match(cardMigration, /if available_points < 10 then raise exception 'insufficient points'/i);
  assert.match(cardMigration, /earned - order_spend - card_spend/);
  assert.match(cardMigration, /unique \(user_id, skin_id\)/i);
  assert.match(cardMigration, /unique \(user_id, idempotency_key\)/i);
  assert.match(cards, /nava_reward_card_state/);
  assert.match(cards, /nava_select_reward_card_skin/);
  assert.match(cards, /nava_unlock_reward_card_skin/);
  assert.match(shop, /共享总额度/);
  assert.match(shop, /所有卡片共用这一份积分/);
  assert.match(cards, /EXTRA_POINTS_CARD_COST = 10/);
  assert.match(shop, /cardState.balance < EXTRA_POINTS_CARD_COST/);
  assert.match(shop, /points-shop-add-card/);
  assert.match(home, /points-shop-add-card/);
  assert.doesNotMatch(shop, /points-card-add-grid|points-card-unlock-confirm/);
  assert.match(gallery, /主题创作 · 张驰/);
  assert.match(gallery, /onAdd\(card.id\)/);
});

test("confirmation and receipt are aligned, legible and free of explanatory subtitles", () => {
  assert.doesNotMatch(checkout, /确认卡片、商品和需要使用的积分|兑换已经确认，接下来打印凭证|凭证出来啦/);
  assert.match(checkout, /<time dateTime=\{checkoutTime.toISOString\(\)\}/);
  assert.match(checkoutStyles, /\.shop-order-card \{[^}]*width: min\(100%, 356px\)[^}]*transform: none/);
  assert.match(checkoutStyles, /\.shop-order-details \{[^}]*width: min\(100%, 356px\)/);
  assert.match(checkoutStyles, /\.shop-order-details div \{[^}]*font-size: 16px/);
  assert.doesNotMatch(checkoutStyles, /rotate\(-1\.[25]deg\)/);
  assert.match(checkoutStyles, /@keyframes shop-paper-feed/);
  assert.match(checkout, /className="shop-receipt-feed"/);
  assert.match(terminal, /matrix\(\.9 \.38 -\.70 \.43/);
  assert.match(checkoutStyles, /shop-terminal-approve .55s ease 2.2s/);
});
