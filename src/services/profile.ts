import { supabase } from "./supabaseClient";

export interface UserProfile {
  id: string;
  username: string | null;
  height: number | null;
  weight: number | null;
  occupation: string | null;
  goal: string | null;
  mbti: string | null;
  exercise_frequency: string | null;
  sleep_schedule: string | null;
  diet_preference: string | null;
  stress_factors: string | null;
}

export async function loadProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function saveProfile(profile: Partial<UserProfile> & { id: string }) {
  const { data, error } = await supabase.from("profiles").upsert(profile, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return data as UserProfile;
}

