import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";
import type { NavaNotificationCategory, NavaNotificationTarget } from "./notifications";

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  pointPrice: number;
  imageUrls: string[];
  inventory: number;
  soldOut: boolean;
  published: boolean;
  updatedAt: string;
};

export type AdminProductDraft = Omit<AdminProduct, "id" | "soldOut" | "updatedAt"> & { id?: string };

export type AdminPushCapability = {
  apns: boolean;
  fcm: boolean;
  hms: boolean;
  remotePush: boolean;
};

export type AdminNotificationBatch = {
  id: string;
  title: string;
  body: string;
  category: NavaNotificationCategory;
  deliveryMode: "in_app" | "in_app_and_push";
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedCount: number;
  pushStatus: "not_requested" | "queued" | "completed" | "partial" | "failed" | "no_devices";
  createdAt: string;
};

export type AdminAccount = {
  userId: string;
  email: string | null;
  phone: string | null;
  role: "member" | "admin";
  createdAt: string;
  updatedAt: string;
};

export type AdminPublishNotificationInput = {
  title: string;
  body: string;
  category: NavaNotificationCategory;
  target: NavaNotificationTarget;
};

export type AdminPublishNotificationResult = {
  batchId: string;
  notificationId: string;
  recipients: number;
  push: {
    status: AdminNotificationBatch["pushStatus"];
    delivered: number;
    failed: number;
    skipped: number;
    devices: number;
  };
};

type ProductRow = Record<string, unknown>;
type BatchRow = Record<string, unknown>;
type AccountRow = Record<string, unknown>;

function assertNoError(error: unknown) {
  if (!error) return;
  throw error instanceof Error ? error : new Error(JSON.stringify(error));
}

function normalizeProduct(row: ProductRow): AdminProduct | null {
  if (typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.name !== "string") return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: typeof row.description === "string" ? row.description : "",
    pointPrice: Math.max(0, Number(row.point_price ?? 0)),
    imageUrls: Array.isArray(row.image_urls) ? row.image_urls.filter((value): value is string => typeof value === "string") : [],
    inventory: Math.max(0, Number(row.inventory_remaining ?? 0)),
    soldOut: row.sold_out === true,
    published: row.published === true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

function normalizeBatch(row: BatchRow): AdminNotificationBatch | null {
  if (typeof row.id !== "string" || typeof row.title !== "string" || typeof row.body !== "string" || typeof row.created_at !== "string") return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category as NavaNotificationCategory,
    deliveryMode: row.delivery_mode === "in_app_and_push" ? "in_app_and_push" : "in_app",
    recipientCount: Number(row.recipient_count ?? 0),
    deliveredCount: Number(row.delivered_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    skippedCount: Number(row.skipped_count ?? 0),
    pushStatus: String(row.push_status ?? "not_requested") as AdminNotificationBatch["pushStatus"],
    createdAt: row.created_at,
  };
}

function normalizeAccount(row: AccountRow): AdminAccount | null {
  if (typeof row.user_id !== "string") return null;
  return {
    userId: row.user_id,
    email: typeof row.email === "string" && row.email.trim() ? row.email : null,
    phone: typeof row.phone === "string" && row.phone.trim() ? row.phone : null,
    role: row.role === "admin" ? "admin" : "member",
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
  };
}

export async function loadAdminAccess() {
  if (isDemoMode()) return false;
  const result = await supabase.rpc("nava_is_admin");
  assertNoError(result.error);
  return result.data === true;
}

export async function loadAdminProducts() {
  const result = await supabase.rpc("nava_admin_list_reward_products");
  assertNoError(result.error);
  return (Array.isArray(result.data) ? result.data : []).flatMap((row) => {
    const product = normalizeProduct(row as ProductRow);
    return product ? [product] : [];
  });
}

export async function saveAdminProduct(draft: AdminProductDraft) {
  const result = await supabase.rpc("nava_admin_save_reward_product", {
    product_id: draft.id ?? null,
    product_slug: draft.slug,
    product_name: draft.name,
    product_description: draft.description,
    product_point_price: Math.trunc(draft.pointPrice),
    product_image_urls: draft.imageUrls,
    product_inventory: Math.trunc(draft.inventory),
    product_published: draft.published,
  });
  assertNoError(result.error);
  return String(result.data);
}

export async function uploadAdminProductImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `products/${crypto.randomUUID()}.${extension}`;
  const uploaded = await supabase.storage.from("reward-products").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type || undefined,
    upsert: false,
  });
  assertNoError(uploaded.error);
  const publicUrl = supabase.storage.from("reward-products").getPublicUrl(path).data.publicUrl;
  if (!publicUrl) throw new Error("商品图片地址生成失败。");
  return publicUrl;
}

export async function loadAdminPushCapability(): Promise<AdminPushCapability> {
  const result = await supabase.functions.invoke<AdminPushCapability>("admin-notification-publish", {
    body: { action: "capability" },
  });
  assertNoError(result.error);
  return result.data ?? { apns: false, fcm: false, hms: false, remotePush: false };
}

export async function publishAdminNotification(input: AdminPublishNotificationInput) {
  const result = await supabase.functions.invoke<AdminPublishNotificationResult>("admin-notification-publish", {
    body: { action: "publish", ...input },
  });
  assertNoError(result.error);
  if (!result.data?.batchId) throw new Error("通知发布结果不完整。");
  return result.data;
}

export async function loadAdminNotificationBatches(limit = 20) {
  const result = await supabase.rpc("nava_admin_list_notification_batches", { batch_limit: limit });
  assertNoError(result.error);
  return (Array.isArray(result.data) ? result.data : []).flatMap((row) => {
    const batch = normalizeBatch(row as BatchRow);
    return batch ? [batch] : [];
  });
}

export async function loadAdminAccounts(query = "") {
  const result = await supabase.rpc("nava_admin_list_accounts", {
    account_query: query.trim() || null,
    account_limit: 50,
  });
  assertNoError(result.error);
  return (Array.isArray(result.data) ? result.data : []).flatMap((row) => {
    const account = normalizeAccount(row as AccountRow);
    return account ? [account] : [];
  });
}

export async function setAdminAccountRole(userId: string, role: "member" | "admin") {
  const result = await supabase.rpc("nava_admin_set_account_role", {
    target_user_id: userId,
    target_role: role,
  });
  assertNoError(result.error);
  return result.data;
}
