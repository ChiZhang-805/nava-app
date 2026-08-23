import { supabase } from "./supabaseClient";
import { demoProfile, isDemoMode } from "./demo";
import { fileToDataUrl } from "./media";

const DEMO_PROFILE_STORAGE_KEY = "nava.demo.profile.v1";

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
  avatar_url?: string | null;
  age_group?: string | null;
  privacy_consent_at?: string | null;
  health_data_consent?: boolean | null;
  ai_personalization_consent?: boolean | null;
  onboarding_completed_at?: string | null;
  onboarding_version?: number | null;
  onboarding_answers?: Record<string, unknown> | null;
}

function readDemoProfile() {
  try {
    const stored = window.sessionStorage.getItem(DEMO_PROFILE_STORAGE_KEY);
    if (stored) return { ...demoProfile, ...JSON.parse(stored) } as UserProfile;
  } catch {
    // Fall back to the deterministic fixture when preview storage is unavailable.
  }
  return { ...demoProfile };
}

function writeDemoProfile(changes: Partial<UserProfile> & { id: string }) {
  const saved = { ...readDemoProfile(), ...changes } as UserProfile;
  try {
    window.sessionStorage.setItem(DEMO_PROFILE_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // The current view can still reflect the in-memory result.
  }
  return saved;
}

export async function loadProfile(userId: string): Promise<UserProfile | null> {
  if (isDemoMode()) return { ...readDemoProfile(), id: userId };

  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function saveProfile(profile: Partial<UserProfile> & { id: string }) {
  if (isDemoMode()) return writeDemoProfile(profile);

  const { id, ...changes } = profile;
  if (Object.keys(changes).length === 0) return loadProfile(id);

  const updated = await supabase.from("profiles").update(changes).eq("id", id).select("*").maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data as UserProfile;

  const inserted = await supabase.from("profiles").insert({ id, ...changes }).select("*").single();
  if (inserted.error) throw inserted.error;
  return inserted.data as UserProfile;
}

export async function saveProfileAvatar(userId: string, file: File) {
  const preview = await fileToDataUrl(file);
  if (isDemoMode()) {
    return writeDemoProfile({ id: userId, avatar_url: preview }).avatar_url ?? preview;
  }

  const ext = file.name.split(".").pop() || "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const bucket = "profile-avatars";
  const upload = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (upload.error) {
    const detail = `${upload.error.message ?? ""} ${(upload.error as { error?: string }).error ?? ""}`;
    if (/bucket not found|not found/i.test(detail)) {
      throw new Error("共享后端尚未部署头像存储，请联系网页端管理员启用 profile-avatars。");
    }
    throw upload.error;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  const avatarUrl = data.publicUrl || preview;
  const saved = await saveProfile({ id: userId, avatar_url: avatarUrl });
  return saved?.avatar_url ?? avatarUrl;
}
