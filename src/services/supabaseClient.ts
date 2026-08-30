import { createClient } from "@supabase/supabase-js";
import { appConfig } from "../config";

const safeSupabaseUrl = appConfig.supabaseUrl || "https://example.supabase.co";
const safeSupabaseKey = appConfig.supabaseKey || "missing-anon-key";

const browserSessionStorage = {
  getItem(key: string) {
    return typeof window === "undefined" ? null : window.sessionStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (typeof window !== "undefined") window.sessionStorage.setItem(key, value);
  },
  removeItem(key: string) {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(safeSupabaseUrl, safeSupabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: browserSessionStorage,
  },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});

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
