import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import { errorResponse, jsonResponse, optionsResponse, readJson } from "../_shared/http.ts";

type Provider = "apns" | "fcm" | "hms";
type DispatchBody = { userId?: string; notificationId?: string };
type NotificationRow = { user_id: string; id: string; title: string; body: string; target: Record<string, unknown> | null };
type DeviceRow = { id: string; provider: Provider; token: string };
type DeliveryResult = { ok: boolean; messageId?: string; errorCode?: string; invalidate?: boolean };

const textEncoder = new TextEncoder();

function secureEquals(left: string, right: string) {
  const a = textEncoder.encode(left);
  const b = textEncoder.encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server secret: ${name}`);
  return value;
}

async function apnsToken() {
  const keyId = requiredEnv("APNS_KEY_ID");
  const teamId = requiredEnv("APNS_TEAM_ID");
  const key = await importPKCS8(requiredEnv("APNS_PRIVATE_KEY").replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .sign(key);
}

async function sendApns(device: DeviceRow, notification: NotificationRow): Promise<DeliveryResult> {
  const environment = Deno.env.get("APNS_ENVIRONMENT") === "production" ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const response = await fetch(`https://${environment}/3/device/${encodeURIComponent(device.token)}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsToken()}`,
      "apns-topic": requiredEnv("APNS_BUNDLE_ID"),
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title: notification.title, body: notification.body }, sound: "default" },
      target: notification.target ?? { tab: "today", view: "notifications" },
      notificationId: notification.id,
    }),
  });
  const payload = await response.json().catch(() => ({})) as { reason?: string };
  return response.ok
    ? { ok: true, messageId: response.headers.get("apns-id") ?? undefined }
    : { ok: false, errorCode: payload.reason ?? `HTTP_${response.status}`, invalidate: response.status === 404 || response.status === 410 };
}

async function firebaseAccessToken() {
  const account = JSON.parse(requiredEnv("FIREBASE_SERVICE_ACCOUNT_JSON")) as { client_email: string; private_key: string; token_uri?: string };
  const key = await importPKCS8(account.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(account.token_uri ?? "https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const payload = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error ?? `FCM OAuth HTTP ${response.status}`);
  return payload.access_token;
}

async function sendFcm(device: DeviceRow, notification: NotificationRow): Promise<DeliveryResult> {
  const account = JSON.parse(requiredEnv("FIREBASE_SERVICE_ACCOUNT_JSON")) as { project_id: string };
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await firebaseAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { token: device.token, notification: { title: notification.title, body: notification.body }, data: { notificationId: notification.id, target: JSON.stringify(notification.target ?? { tab: "today", view: "notifications" }) }, android: { priority: "high", notification: { channel_id: "nava_general" } } } }),
  });
  const payload = await response.json().catch(() => ({})) as { name?: string; error?: { status?: string; details?: Array<{ errorCode?: string }> } };
  const detailCode = payload.error?.details?.find((detail) => detail.errorCode)?.errorCode;
  const code = detailCode ?? payload.error?.status ?? `HTTP_${response.status}`;
  return response.ok ? { ok: true, messageId: payload.name } : { ok: false, errorCode: code, invalidate: code === "UNREGISTERED" };
}

async function hmsAccessToken() {
  const response = await fetch("https://oauth-login.cloud.huawei.com/oauth2/v3/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: requiredEnv("HMS_CLIENT_ID"), client_secret: requiredEnv("HMS_CLIENT_SECRET") }),
  });
  const payload = await response.json() as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error ?? `HMS OAuth HTTP ${response.status}`);
  return payload.access_token;
}

async function sendHms(device: DeviceRow, notification: NotificationRow): Promise<DeliveryResult> {
  const response = await fetch(`https://push-api.cloud.huawei.com/v1/${encodeURIComponent(requiredEnv("HMS_APP_ID"))}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await hmsAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ validate_only: false, message: { token: [device.token], notification: { title: notification.title, body: notification.body }, data: JSON.stringify({ notificationId: notification.id, target: notification.target ?? { tab: "today", view: "notifications" } }), android: { notification: { click_action: { type: 1, intent: "#Intent;action=health.nava.mobile.PUSH;end" } } } } }),
  });
  const payload = await response.json().catch(() => ({})) as { code?: string; requestId?: string; msg?: string };
  const ok = response.ok && payload.code === "80000000";
  return ok ? { ok: true, messageId: payload.requestId } : { ok: false, errorCode: payload.code ?? payload.msg ?? `HTTP_${response.status}`, invalidate: payload.code === "80300007" };
}

async function send(device: DeviceRow, notification: NotificationRow) {
  if (device.provider === "apns") return sendApns(device, notification);
  if (device.provider === "fcm") return sendFcm(device, notification);
  return sendHms(device, notification);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return errorResponse("POST required.", 405);
  try {
    const expectedSecret = requiredEnv("NAVA_PUSH_DISPATCH_SECRET");
    if (!secureEquals(req.headers.get("x-nava-push-secret") ?? "", expectedSecret)) return errorResponse("Unauthorized.", 401);
    const body = await readJson<DispatchBody>(req);
    if (!body.userId || !body.notificationId) return errorResponse("userId and notificationId are required.", 400);
    const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const notificationResult = await admin.from("user_notifications").select("user_id,id,title,body,target").eq("user_id", body.userId).eq("id", body.notificationId).maybeSingle();
    if (notificationResult.error) throw notificationResult.error;
    if (!notificationResult.data) return errorResponse("Notification not found.", 404);
    const notification = notificationResult.data as NotificationRow;
    const devicesResult = await admin.from("push_device_tokens").select("id,provider,token").eq("user_id", body.userId).eq("enabled", true).is("invalidated_at", null);
    if (devicesResult.error) throw devicesResult.error;
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    for (const device of (devicesResult.data ?? []) as DeviceRow[]) {
      const existing = await admin.from("push_delivery_receipts").select("status").eq("user_id", body.userId).eq("notification_id", body.notificationId).eq("device_token_id", device.id).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.status === "delivered") { skipped += 1; continue; }
      let result: DeliveryResult;
      try { result = await send(device, notification); }
      catch (error) { result = { ok: false, errorCode: error instanceof Error ? error.message : "provider_error" }; }
      const status = result.ok ? "delivered" : result.invalidate ? "invalidated" : "failed";
      const receipt = await admin.from("push_delivery_receipts").upsert({ user_id: body.userId, notification_id: body.notificationId, device_token_id: device.id, provider: device.provider, status, provider_message_id: result.messageId ?? null, error_code: result.errorCode ?? null, attempted_at: new Date().toISOString() }, { onConflict: "user_id,notification_id,device_token_id" });
      if (receipt.error) throw receipt.error;
      if (result.invalidate) await admin.from("push_device_tokens").update({ enabled: false, invalidated_at: new Date().toISOString() }).eq("id", device.id);
      if (result.ok) delivered += 1; else failed += 1;
    }
    return jsonResponse({ delivered, failed, skipped, devices: delivered + failed + skipped });
  } catch (error) {
    return errorResponse(error);
  }
});
