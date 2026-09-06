import { isDemoMode } from "./demo";
import { loadProfile, saveProfile, type UserProfile } from "./profile";
import { supabase } from "./supabaseClient";

export const ONBOARDING_VERSION = 2;

export type OnboardingAnswers = {
  gender: string;
  ageGroup: string;
  occupation: string;
  hobbies: string[];
  sleepDuration: string;
  exerciseDuration: string;
  dietPreferences: string[];
  essentialConsent: boolean;
  healthDataConsent: boolean;
  aiPersonalizationConsent: boolean;
};

export type OnboardingStatus = {
  completed: boolean;
  completedAt: string | null;
  version: number;
  answers: Partial<OnboardingAnswers>;
  source: "remote" | "local" | "none";
};

const localKey = (userId: string) => `nava.onboarding.v${ONBOARDING_VERSION}.${userId}`;

function readLocalStatus(userId: string): OnboardingStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingStatus>;
    return {
      completed: parsed.completed === true,
      completedAt: parsed.completedAt ?? null,
      version: Number(parsed.version ?? ONBOARDING_VERSION),
      answers: parsed.answers ?? {},
      source: "local",
    };
  } catch {
    return null;
  }
}

function writeLocalStatus(userId: string, answers: OnboardingAnswers, completedAt: string) {
  const status: OnboardingStatus = {
    completed: true,
    completedAt,
    version: ONBOARDING_VERSION,
    answers,
    source: "local",
  };
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(status));
  } catch {
    // Remote persistence remains authoritative when browser storage is unavailable.
  }
  return status;
}

function isMissingOnboardingColumn(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string } | null;
  const text = `${candidate?.message ?? ""} ${candidate?.details ?? ""}`;
  return candidate?.code === "42703" || candidate?.code === "PGRST204" || /onboarding_|age_group/i.test(text);
}

export async function loadOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const local = readLocalStatus(userId);
  if (isDemoMode()) {
    return local ?? { completed: false, completedAt: null, version: ONBOARDING_VERSION, answers: {}, source: "none" };
  }

  const result = await supabase
    .from("profiles")
    .select("onboarding_completed_at,onboarding_version,onboarding_answers")
    .eq("id", userId)
    .maybeSingle();

  if (result.error) {
    if (isMissingOnboardingColumn(result.error)) {
      throw new Error("共享后端尚未部署完整的入门与隐私同意字段，无法安全确认当前账号状态。");
    }
    throw result.error;
  }

  const completedAt = result.data?.onboarding_completed_at ?? null;
  if (!completedAt) {
    return {
      completed: false,
      completedAt: null,
      version: Number(result.data?.onboarding_version ?? ONBOARDING_VERSION),
      answers: (result.data?.onboarding_answers ?? {}) as Partial<OnboardingAnswers>,
      source: "remote",
    };
  }
  return {
    completed: true,
    completedAt,
    version: Number(result.data?.onboarding_version ?? ONBOARDING_VERSION),
    answers: (result.data?.onboarding_answers ?? {}) as Partial<OnboardingAnswers>,
    source: "remote",
  };
}

export async function completeOnboarding(userId: string, answers: OnboardingAnswers) {
  if (!answers.essentialConsent) throw new Error("请先阅读并同意用户协议与隐私政策。");

  const completedAt = new Date().toISOString();
  const profileChanges: Partial<UserProfile> & { id: string } = {
    id: userId,
    occupation: answers.occupation,
    exercise_frequency: answers.exerciseDuration,
    sleep_schedule: answers.sleepDuration,
    diet_preference: answers.dietPreferences.join("、"),
  };

  if (isDemoMode()) {
    await saveProfile(profileChanges);
    writeLocalStatus(userId, answers, completedAt);
    return;
  }

  const result = await supabase
    .from("profiles")
    .upsert({
      ...profileChanges,
      age_group: answers.ageGroup,
      privacy_consent_at: completedAt,
      health_data_consent: answers.healthDataConsent,
      ai_personalization_consent: answers.aiPersonalizationConsent,
      onboarding_completed_at: completedAt,
      onboarding_version: ONBOARDING_VERSION,
      onboarding_answers: answers,
    }, { onConflict: "id" });

  if (result.error) {
    if (isMissingOnboardingColumn(result.error)) {
      throw new Error("共享后端尚未部署完整的入门与隐私同意字段，本次设置没有保存到账号。");
    }
    throw result.error;
  }

  writeLocalStatus(userId, answers, completedAt);
}

export async function loadProfileWithOnboarding(userId: string) {
  const [profile, onboarding] = await Promise.all([
    loadProfile(userId),
    loadOnboardingStatus(userId),
  ]);
  return { profile, onboarding };
}
