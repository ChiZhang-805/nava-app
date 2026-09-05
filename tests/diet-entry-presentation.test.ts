import assert from "node:assert/strict";
import test from "node:test";
import { formatDetectedDishList } from "../src/services/dietEntryPresentation.ts";
import { dietRecognitionPrompt } from "../supabase/functions/_shared/diet-prompt.ts";

test("formats one detected dish without an unnecessary numeric prefix", () => {
  assert.equal(formatDetectedDishList([{ name: "鸡胸肉沙拉" }]), "鸡胸肉沙拉");
});

test("formats multiple dishes as one editable line per dish", () => {
  assert.equal(
    formatDetectedDishList([
      { name: "1. 沙拉（可见配料：西红柿、青菜）" },
      { name: "蓝莓酸奶" },
      { name: "烤面包" },
    ]),
    "1. 沙拉（可见配料：西红柿、青菜）\n2. 蓝莓酸奶\n3. 烤面包",
  );
});

test("vision prompt requires dish-level grouping for composite food", () => {
  const chinese = dietRecognitionPrompt("zh", "lunch");
  const english = dietRecognitionPrompt("en", "lunch");
  assert.match(chinese, /最终菜品或饮品/);
  assert.match(chinese, /不能另列“西红柿”和“青菜”/);
  assert.match(chinese, /汉堡.*不必机械罗列原料/);
  assert.match(english, /dish level/);
  assert.match(english, /Do not split that salad/);
});
