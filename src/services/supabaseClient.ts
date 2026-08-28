import { createClient } from "@supabase/supabase-js";
import { appConfig } from "../config";

const safeSupabaseUrl = appConfig.supabaseUrl || "https://example.supabase.co";
const safeSupabaseKey = appConfig.supabaseKey || "missing-anon-key";

export const supabase = createClient(safeSupabaseUrl, safeSupabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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
