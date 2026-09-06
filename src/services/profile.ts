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
  birth_date?: string | null;
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
  return hydrateProfileAvatar(data as UserProfile | null);
}

export async function saveProfile(profile: Partial<UserProfile> & { id: string }) {
  if (isDemoMode()) return writeDemoProfile(profile);

  const { id, ...changes } = profile;
  if (Object.keys(changes).length === 0) return loadProfile(id);

  const updated = await supabase.from("profiles").update(changes).eq("id", id).select("*").maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return hydrateProfileAvatar(updated.data as UserProfile);

  const inserted = await supabase.from("profiles").insert({ id, ...changes }).select("*").single();
  if (inserted.error) throw inserted.error;
  return hydrateProfileAvatar(inserted.data as UserProfile);
}

export async function saveProfileAvatar(userId: string, file: File) {
  const preview = await fileToDataUrl(file);
  if (isDemoMode()) {
    return writeDemoProfile({ id: userId, avatar_url: preview }).avatar_url ?? preview;
  }

  // One stable object prevents concurrent devices from deleting each other's
  // newly uploaded avatar while still allowing old timestamped files to be removed.
  const path = `${userId}/avatar-current`;
  const bucket = "profile-avatars";
  const upload = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "60",
    upsert: true,
  });
  if (upload.error) {
    const detail = `${upload.error.message ?? ""} ${(upload.error as { error?: string }).error ?? ""}`;
    if (/bucket not found|not found/i.test(detail)) {
      throw new Error("共享后端尚未部署头像存储，请联系网页端管理员启用 profile-avatars。");
    }
    throw upload.error;
  }

  const storedReference = `storage://${bucket}/${path}`;
  // Keep the private owner-scoped object if the following profile write fails.
  // Removing a stable path here can delete a newer concurrent upload from
  // another device; the next save can reuse it without timestamped orphans.
  const saved = await saveProfile({ id: userId, avatar_url: storedReference });
  const listed = await supabase.storage.from(bucket).list(userId, { limit: 100 });
  if (!listed.error) {
    const stale = (listed.data ?? [])
      .filter((entry) => entry.id && `${userId}/${entry.name}` !== path)
      .map((entry) => `${userId}/${entry.name}`);
    if (stale.length > 0) {
      const removed = await supabase.storage.from(bucket).remove(stale);
      if (removed.error) console.warn("Old profile avatar cleanup deferred", removed.error);
    }
  }
  return saved?.avatar_url ?? await signedAvatarUrl(path) ?? preview;
}

async function hydrateProfileAvatar(profile: UserProfile | null) {
  if (!profile?.avatar_url) return profile;
  const path = profileAvatarPath(profile.avatar_url);
  if (!path) return profile;
  const signed = await signedAvatarUrl(path);
  return signed ? { ...profile, avatar_url: signed } : { ...profile, avatar_url: null };
}

function profileAvatarPath(value: string) {
  const storagePrefix = "storage://profile-avatars/";
  if (value.startsWith(storagePrefix)) return value.slice(storagePrefix.length);
  const publicMarker = "/storage/v1/object/public/profile-avatars/";
  const markerIndex = value.indexOf(publicMarker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(value.slice(markerIndex + publicMarker.length));
}

async function signedAvatarUrl(path: string) {
  const signed = await supabase.storage.from("profile-avatars").createSignedUrl(path, 60 * 60);
  if (signed.error) {
    console.warn("Profile avatar URL refresh deferred", signed.error);
    return null;
  }
  return signed.data.signedUrl;
}
