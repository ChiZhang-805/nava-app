import assert from "node:assert/strict";
import test from "node:test";
import { filterShopProducts, productCategory, shopCategory } from "../src/services/rewardShopCatalog.ts";
const item = (name: string) => ({ name, slug: name, description: "A little gift" });
test("catalog groups real names without inventing catalog data", () => {
  assert.equal(productCategory(item("NAVA notebook")), "study");
  assert.equal(productCategory(item("小猫陶瓷杯")), "daily");
  assert.equal(productCategory(item("NAVA 毛绒小猫")), "cat");
  assert.equal(productCategory(item("新商品")), "all");
  assert.equal(shopCategory("unknown"), "all");
});
test("category and search compose, unknown items remain discoverable", () => {
  const items = [item("小猫书签"), item("小猫陶瓷杯"), item("新商品")];
  assert.deepEqual(filterShopProducts(items, "study", "小猫"), [items[0]]);
  assert.deepEqual(filterShopProducts(items, "all", "  GIFT "), items);
  assert.deepEqual(filterShopProducts(items, "daily", "不存在"), []);
  assert.deepEqual(filterShopProducts(items, "all", "新商品"), [items[2]]);
});
test("empty placeholders are never presented as a category's real inventory", () => {
  const items = [{ ...item("商品待上架"), placeholder: true }];
  assert.equal(filterShopProducts(items, "all", "").length, 1);
  assert.equal(filterShopProducts(items, "cat", "").length, 0);
  assert.equal(filterShopProducts(items, "all", "商品").length, 0);
});
