import { createClient } from "@supabase/supabase-js";
import { appConfig } from "../config";
import { authSessionStorage } from "./authStorage";

const safeSupabaseUrl = appConfig.supabaseUrl || "https://example.supabase.co";
const safeSupabaseKey = appConfig.supabaseKey || "missing-anon-key";

export const supabase = createClient(safeSupabaseUrl, safeSupabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authSessionStorage,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});

/** Edge Functions must receive the current user's JWT, not the public API key. */
export async function authenticatedFunctionHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("登录会话不可用，请重新登录后使用 App 后端。");
  return { Authorization: `Bearer ${accessToken}` };
}

export function createEphemeralSupabaseClient() {
  return createClient(safeSupabaseUrl, safeSupabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
