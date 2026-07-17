import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.52.1";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type FunctionContext = {
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient | null;
};

export function optionsResponse() {
  return new Response("ok", { headers: corsHeaders });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json;charset=utf-8",
      ...(init.headers ?? {}),
    },
  });
}

export function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: message }, { status });
}

export async function readJson<T extends Record<string, unknown>>(req: Request): Promise<T> {
  if (!req.body) return {} as T;
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("请求体必须是合法 JSON。");
  }
}

export async function requireUser(req: Request): Promise<FunctionContext> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase Edge Function 环境缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY。");
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("请先登录后再调用 App 后端。");

  const adminClient = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

  return { user: data.user, userClient, adminClient };
}

export function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : JSON.stringify(error);
  throw new Error(message);
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeDate(value: unknown) {
  const date = stringValue(value) ?? todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式必须是 YYYY-MM-DD。");
  return date;
}

export function dateOnly(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return todayISO();
  const date = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式必须是 YYYY-MM-DD 或 ISO 时间。");
  return date;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
