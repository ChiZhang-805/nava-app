import { isDemoMode } from "./demo";
import { supabase } from "./supabaseClient";

const forbiddenKeys = /diary|note|message|content|image|photo|path|url/i;

function safeProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key, value]) => !forbiddenKeys.test(key) && ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 20),
  );
}

export async function trackAnalyticsEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {},
) {
  if (isDemoMode()) return;
  const { error } = await supabase.from("analytics_events").insert({
    user_id: userId,
    event_name: eventName.slice(0, 80),
    properties: safeProperties(properties),
  });
  if (error) throw error;
}
