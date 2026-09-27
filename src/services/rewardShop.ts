import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

export type RewardProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  pointPrice: number | null;
  imageUrls: string[];
  soldOut: boolean;
  placeholder?: boolean;
};

export type RewardCartLine = {
  product: RewardProduct;
  quantity: number;
};

export type RewardCheckoutResult = {
  orderId: string;
  totalPoints: number;
  balance: number;
  replayed: boolean;
};

type ProductRow = {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  point_price?: unknown;
  image_urls?: unknown;
  sold_out?: unknown;
};

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

function normalizeProduct(row: ProductRow): RewardProduct | null {
  if (typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.name !== "string") return null;
  const pointPrice = Number(row.point_price);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: typeof row.description === "string" ? row.description : "",
    pointPrice: Number.isFinite(pointPrice) && pointPrice > 0 ? Math.round(pointPrice) : null,
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls.filter((url): url is string => typeof url === "string" && /^https:\/\//i.test(url)) : [],
    soldOut: row.sold_out === true,
  };
}

export function placeholderRewardProducts(locale: "zh" | "en"): RewardProduct[] {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `placeholder-${index + 1}`,
    slug: `placeholder-${index + 1}`,
    name: locale === "zh" ? "商品待上架" : "Product coming soon",
    description: locale === "zh" ? "商品图片与详细说明将在正式上架后显示。" : "Product images and details will appear when this item is listed.",
    pointPrice: null,
    imageUrls: [],
    soldOut: false,
    placeholder: true,
  }));
}

export async function loadRewardProducts(): Promise<RewardProduct[]> {
  if (isDemoMode()) return [];
  const result = await supabase
    .from("reward_products")
    .select("id,slug,name,description,point_price,image_urls,sold_out")
    .eq("published", true)
    .order("created_at", { ascending: false });
  assertNoError(result.error);
  return (result.data ?? []).flatMap((row) => {
    const product = normalizeProduct(row as ProductRow);
    return product ? [product] : [];
  });
}

export async function loadRewardCart(userId: string, products?: RewardProduct[]): Promise<RewardCartLine[]> {
  if (isDemoMode()) return [];
  const cartResult = await supabase
    .from("reward_cart_items")
    .select("product_id,quantity")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  assertNoError(cartResult.error);
  const productList = products ?? await loadRewardProducts();
  const byId = new Map(productList.map((product) => [product.id, product]));
  return (cartResult.data ?? []).flatMap((row) => {
    const product = byId.get(String(row.product_id ?? ""));
    const quantity = Number(row.quantity);
    return product && Number.isInteger(quantity) && quantity > 0 ? [{ product, quantity }] : [];
  });
}

export async function setRewardCartItem(productId: string, quantity: number) {
  if (isDemoMode()) throw new Error("公开演示没有可购买的真实商品。");
  const result = await supabase.rpc("nava_set_reward_cart_item", {
    target_product: productId,
    target_quantity: Math.max(0, Math.min(5, Math.trunc(quantity))),
  });
  assertNoError(result.error);
}

export async function checkoutRewardCart(requestKey: string = crypto.randomUUID()): Promise<RewardCheckoutResult> {
  if (isDemoMode()) throw new Error("公开演示不会创建真实订单。");
  const result = await supabase.rpc("nava_checkout_reward_cart", { request_key: requestKey });
  assertNoError(result.error);
  const value = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const orderId = typeof value.orderId === "string" ? value.orderId : "";
  const totalPoints = Number(value.totalPoints);
  const balance = Number(value.balance);
  if (!orderId || !Number.isFinite(totalPoints) || !Number.isFinite(balance)) throw new Error("积分订单没有返回完整的结算结果。");
  return { orderId, totalPoints: Math.round(totalPoints), balance: Math.round(balance), replayed: value.replayed === true };
}

export async function loadRewardPointsBalance() {
  if (isDemoMode()) return null;
  const result = await supabase.rpc("nava_reward_points_balance");
  assertNoError(result.error);
  const points = Number(result.data);
  if (!Number.isFinite(points) || points < 0) throw new Error("积分余额服务没有返回有效结果。");
  return Math.round(points);
}
