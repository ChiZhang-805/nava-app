export const SHOP_CATEGORIES = [
  { id: "all", zh: "全部好物", en: "All gifts", icon: "gift" },
  { id: "cat", zh: "小猫周边", en: "Cat things", icon: "cat" },
  { id: "study", zh: "专注文具", en: "Stationery", icon: "notebook" },
  { id: "daily", zh: "生活好物", en: "Everyday", icon: "cup" },
] as const;
export type ShopCategory = typeof SHOP_CATEGORIES[number]["id"];
type CatalogItem = { name: string; slug: string; description: string; placeholder?: boolean };
export function shopCategory(value: string): ShopCategory {
  return SHOP_CATEGORIES.find((category) => category.id === value)?.id ?? "all";
}
/** Browsing groups for the existing catalog, which has no category column.
 * Explicit name/slug keywords only; unclassified products remain under All.
 * These groups never imply stock, prices, or popularity. */
export function productCategory(product: CatalogItem): ShopCategory {
  const name = `${product.name} ${product.slug}`.toLowerCase();
  if (/笔|本子|笔记|文具|书签|手账|便签|notebook|stationery|bookmark|journal|pencil|\bpen\b/.test(name)) return "study";
  if (/杯|水壶|毛巾|靠垫|收纳|袋|cup|mug|bottle|towel|cushion|bag/.test(name)) return "daily";
  if (/猫|nava|cat|mascot/.test(name)) return "cat";
  return "all";
}
export function filterShopProducts<T extends CatalogItem>(products: readonly T[], category: ShopCategory, query: string): T[] {
  const term = query.trim().toLocaleLowerCase();
  return products.filter((product) =>
    (category === "all" || (!product.placeholder && productCategory(product) === category))
    && (!term || (!product.placeholder && `${product.name} ${product.description}`.toLocaleLowerCase().includes(term))));
}
