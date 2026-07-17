import { createClient } from "@supabase/supabase-js";
import { appConfig } from "../config";

export const supabase = createClient(appConfig.supabaseUrl, appConfig.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

