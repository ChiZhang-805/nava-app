import { assertNoError, errorResponse, jsonResponse, optionsResponse, readJson, requireUser } from "../_shared/http.ts";

type DeliveryMode = "in_app" | "in_app_and_push";
type RequestBody = {
  action?: "capability" | "publish";
  title?: string;
  body?: string;
  category?: string;
  target?: Record<string, unknown>;
  deliveryMode?: DeliveryMode;
};

type PublishResult = {
  batchId?: string;
  notificationId?: string;
  recipients?: number;
};

type DispatchResult = {
  delivered?: number;
  failed?: number;
  skipped?: number;
  devices?: number;
};

const categories = new Set(["sleep", "nutrition", "mood", "focus", "exercise", "face", "weekly", "system"]);
const tabs = new Set(["today", "record", "ai", "trends", "profile"]);

function secretPresent(name: string) {
  return Boolean(Deno.env.get(name)?.trim());
}

function pushCapabilities() {
  const dispatchReady = secretPresent("NAVA_PUSH_DISPATCH_SECRET");
  const apns = dispatchReady && ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "APNS_BUNDLE_ID"].every(secretPresent);
  const fcm = dispatchReady && secretPresent("FIREBASE_SERVICE_ACCOUNT_JSON");
  const hms = dispatchReady && ["HMS_CLIENT_ID", "HMS_CLIENT_SECRET", "HMS_APP_ID"].every(secretPresent);
  return { apns, fcm, hms, remotePush: apns || fcm || hms };
}

async function requireAdmin(userClient: Awaited<ReturnType<typeof requireUser>>["userClient"]) {
  const result = await userClient.rpc("nava_is_admin");
  assertNoError(result.error);
  if (result.data !== true) throw new Error("administrator access required");
}

function normalizeTarget(value: Record<string, unknown> | undefined) {
  const tab = typeof value?.tab === "string" && tabs.has(value.tab) ? value.tab : "today";
  const target: Record<string, unknown> = { tab };
  if (typeof value?.module === "string") target.module = value.module;
  if (typeof value?.view === "string") target.view = value.view;
  if (tab === "today" && !target.view) target.view = "notifications";
  return target;
}

async function dispatchOne(
  supabaseUrl: string,
  anonKey: string,
  dispatchSecret: string,
  userId: string,
  notificationId: string,
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/push-dispatch`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
      "x-nava-push-secret": dispatchSecret,
    },
    body: JSON.stringify({ userId, notificationId }),
  });
  const payload = await response.json().catch(() => ({})) as DispatchResult & { error?: string };
  if (!response.ok) return { delivered: 0, failed: 1, skipped: 0, devices: 0 };
  return {
    delivered: Number(payload.delivered ?? 0),
    failed: Number(payload.failed ?? 0),
    skipped: Number(payload.skipped ?? 0),
    devices: Number(payload.devices ?? 0),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("POST required.", 405);
  try {
    const { userClient, adminClient } = await requireUser(req);
    await requireAdmin(userClient);
    const input = await readJson<RequestBody>(req);
    const capability = pushCapabilities();
    if (input.action === "capability") return jsonResponse(capability);
    if (input.action !== "publish") return errorResponse("Unsupported action.", 400);

    const title = input.title?.trim() ?? "";
    const body = input.body?.trim() ?? "";
    const category = input.category?.trim() ?? "system";
    const deliveryMode: DeliveryMode = input.deliveryMode === "in_app_and_push" ? "in_app_and_push" : "in_app";
    if (!title || title.length > 160) return errorResponse("通知标题须为 1–160 个字符。", 400);
    if (!body || body.length > 1000) return errorResponse("通知内容须为 1–1000 个字符。", 400);
    if (!categories.has(category)) return errorResponse("通知分类无效。", 400);
    if (deliveryMode === "in_app_and_push" && !capability.remotePush) {
      return errorResponse("系统推送尚未完成服务端凭据配置，请先使用 APP 内通知。", 409);
    }

    const published = await userClient.rpc("nava_admin_publish_notification", {
      notice_title: title,
      notice_body: body,
      notice_category: category,
      notice_target: normalizeTarget(input.target),
      notice_delivery_mode: deliveryMode,
    });
    assertNoError(published.error);
    const result = (published.data ?? {}) as PublishResult;
    if (!result.batchId || !result.notificationId) throw new Error("通知发布结果不完整。");
    if (deliveryMode === "in_app") {
      return jsonResponse({ ...result, push: { status: "not_requested", delivered: 0, failed: 0, skipped: 0, devices: 0 } });
    }
    if (!adminClient) throw new Error("管理员通知服务缺少服务端访问能力。");

    const recipients = await adminClient
      .from("user_notifications")
      .select("user_id")
      .eq("id", result.notificationId);
    assertNoError(recipients.error);
    const users = [...new Set((recipients.data ?? []).map((row) => String(row.user_id)).filter(Boolean))];
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() ?? "";
    const dispatchSecret = Deno.env.get("NAVA_PUSH_DISPATCH_SECRET")?.trim() ?? "";
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    let devices = 0;
    for (let offset = 0; offset < users.length; offset += 8) {
      const group = users.slice(offset, offset + 8);
      const outcomes = await Promise.all(group.map((userId) => dispatchOne(supabaseUrl, anonKey, dispatchSecret, userId, result.notificationId!)));
      outcomes.forEach((outcome) => {
        delivered += outcome.delivered;
        failed += outcome.failed;
        skipped += outcome.skipped;
        devices += outcome.devices;
      });
    }
    const pushStatus = devices === 0 && failed === 0
      ? "no_devices"
      : failed === 0
        ? "completed"
        : delivered > 0 || skipped > 0
          ? "partial"
          : "failed";
    const updated = await adminClient.from("admin_notification_batches").update({
      delivered_count: delivered,
      failed_count: failed,
      skipped_count: skipped,
      push_status: pushStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", result.batchId);
    assertNoError(updated.error);
    return jsonResponse({ ...result, push: { status: pushStatus, delivered, failed, skipped, devices } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("administrator access required") ? 403 : 400;
    return errorResponse(error, status);
  }
});
