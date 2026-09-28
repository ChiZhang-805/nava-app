import type { OnboardingAnswers } from "./onboarding";

export type FirstNotesLanguage = "zh" | "en";
export type FirstNotesStep =
  | "welcome"
  | "gender"
  | "role"
  | "age"
  | "interests"
  | "sleep"
  | "exercise"
  | "diet"
  | "goal"
  | "challenge"
  | "permissions"
  | "summary";

export type FirstNotesProfile = {
  version: 4;
  language: FirstNotesLanguage;
  gender: "male" | "female" | "private" | null;
  role: "student" | "professional" | "freelancer" | "caregiver" | "retired" | "other" | null;
  age: "18-24" | "25-34" | "35-44" | "45-54" | "55-64" | "65+" | null;
  interests: Array<"movement" | "reading" | "music" | "games" | "outdoors" | "creative">;
  sleep: "under5" | "5to6" | "6to7" | "7to8" | "8to9" | "9plus" | null;
  exercise: "rarely" | "under1" | "1to2" | "2to4" | "4to7" | "7plus" | null;
  diet: Array<"none" | "light" | "protein" | "lowcarb" | "plant" | "restrictions">;
  completedAt?: string;
  updatedAt?: string;
};

export type FirstNotesDraft = {
  version: 1;
  profile: FirstNotesProfile;
  step: FirstNotesStep;
};

const steps: FirstNotesStep[] = ["welcome", "gender", "role", "age", "interests", "sleep", "exercise", "diet", "goal", "challenge", "permissions", "summary"];
const enums = {
  gender: ["male", "female", "private"],
  role: ["student", "professional", "freelancer", "caregiver", "retired", "other"],
  age: ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
  interests: ["movement", "reading", "music", "games", "outdoors", "creative"],
  sleep: ["under5", "5to6", "6to7", "7to8", "8to9", "9plus"],
  exercise: ["rarely", "under1", "1to2", "2to4", "4to7", "7plus"],
  diet: ["none", "light", "protein", "lowcarb", "plant", "restrictions"],
} as const;

const firstNotesDraftKey = (userId: string) => `nava.first-notes.draft.v1.${userId}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedLanguage(value: unknown, fallback: FirstNotesLanguage): FirstNotesLanguage {
  return value === "en" || value === "zh" ? value : fallback;
}

function single<T extends readonly string[]>(value: unknown, allowed: T, partial: boolean): T[number] | null {
  if (value == null && partial) return null;
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T[number] : null;
}

function multi<T extends readonly string[]>(value: unknown, allowed: T, max: number): T[number][] | null {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T[number]>();
  for (const item of value) {
    if (typeof item !== "string" || !(allowed as readonly string[]).includes(item)) return null;
    if (!seen.has(item as T[number])) seen.add(item as T[number]);
  }
  const result = Array.from(seen).slice(0, max);
  return result as T[number][];
}

function normalizedTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

export function blankFirstNotesProfile(language: FirstNotesLanguage): FirstNotesProfile {
  return {
    version: 4,
    language,
    gender: null,
    role: null,
    age: null,
    interests: [],
    sleep: null,
    exercise: null,
    diet: [],
  };
}

export function normalizeFirstNotesProfile(
  value: unknown,
  options: { partial?: boolean; fallbackLanguage?: FirstNotesLanguage } = {},
): FirstNotesProfile | null {
  if (!isRecord(value)) return null;
  const partial = options.partial === true;
  const language = normalizedLanguage(value.language, options.fallbackLanguage ?? "zh");
  const profile: FirstNotesProfile = {
    version: 4,
    language,
    gender: single(value.gender, enums.gender, partial),
    role: single(value.role, enums.role, partial),
    age: single(value.age, enums.age, partial),
    interests: multi(value.interests, enums.interests, 3) ?? [],
    sleep: single(value.sleep, enums.sleep, partial),
    exercise: single(value.exercise, enums.exercise, partial),
    diet: multi(value.diet, enums.diet, 3) ?? [],
  };
  const completedAt = normalizedTimestamp(value.completedAt);
  const updatedAt = normalizedTimestamp(value.updatedAt);
  if (completedAt) profile.completedAt = completedAt;
  if (updatedAt) profile.updatedAt = updatedAt;
  if (!partial && !isFirstNotesComplete(profile)) return null;
  return profile;
}

export function isFirstNotesComplete(profile: FirstNotesProfile | null | undefined): profile is FirstNotesProfile {
  return Boolean(
    profile
      && profile.gender
      && profile.role
      && profile.age
      && profile.interests.length > 0
      && profile.sleep
      && profile.exercise
      && profile.diet.length > 0,
  );
}

export function normalizeFirstNotesDraft(
  value: unknown,
  fallbackLanguage: FirstNotesLanguage,
): FirstNotesDraft | null {
  if (!isRecord(value)) return null;
  const profile = normalizeFirstNotesProfile(value.profile, { partial: true, fallbackLanguage });
  if (!profile) return null;
  const step = typeof value.step === "string" && steps.includes(value.step as FirstNotesStep)
    ? value.step as FirstNotesStep
    : "welcome";
  return { version: 1, profile, step };
}

export function readFirstNotesDraft(userId: string, fallbackLanguage: FirstNotesLanguage): FirstNotesDraft | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeFirstNotesDraft(JSON.parse(window.localStorage.getItem(firstNotesDraftKey(userId)) ?? "null"), fallbackLanguage);
  } catch {
    return null;
  }
}

export function writeFirstNotesDraft(userId: string, draft: FirstNotesDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(firstNotesDraftKey(userId), JSON.stringify(draft));
  } catch {
    // Draft recovery is best-effort; final Supabase persistence remains authoritative.
  }
}

export function clearFirstNotesDraft(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(firstNotesDraftKey(userId));
  } catch {
    // Ignore storage failures.
  }
}

const genderFromAnswers = { male: "male", female: "female", prefer_not: "private", private: "private" } as const;
const roleFromAnswers = {
  student: "student",
  employee: "professional",
  professional: "professional",
  freelance: "freelancer",
  freelancer: "freelancer",
  caregiver: "caregiver",
  retired: "retired",
  other: "other",
} as const;
const ageFromAnswers = {
  "18_24": "18-24",
  "18-24": "18-24",
  "25_34": "25-34",
  "25-34": "25-34",
  "35_44": "35-44",
  "35-44": "35-44",
  "45_54": "45-54",
  "45-54": "45-54",
  "55_64": "55-64",
  "55-64": "55-64",
  "65_plus": "65+",
  "65+": "65+",
} as const;
const interestFromAnswers = {
  fitness: "movement",
  movement: "movement",
  reading: "reading",
  music_film: "music",
  music: "music",
  gaming: "games",
  games: "games",
  outdoors: "outdoors",
  creative: "creative",
} as const;
const sleepFromAnswers = {
  under_5h: "under5",
  under5: "under5",
  "5_6h": "5to6",
  "5to6": "5to6",
  "6_7h": "6to7",
  "6to7": "6to7",
  "7_8h": "7to8",
  "7to8": "7to8",
  "8_9h": "8to9",
  "8to9": "8to9",
  over_9h: "9plus",
  "9plus": "9plus",
} as const;
const exerciseFromAnswers = {
  almost_none: "rarely",
  rarely: "rarely",
  under_1h: "under1",
  under1: "under1",
  "1_2h": "1to2",
  "1to2": "1to2",
  "2_4h": "2to4",
  "2to4": "2to4",
  "4_7h": "4to7",
  "4to7": "4to7",
  over_7h: "7plus",
  "7plus": "7plus",
} as const;
const dietFromAnswers = {
  none: "none",
  light: "light",
  high_protein: "protein",
  protein: "protein",
  low_carb: "lowcarb",
  lowcarb: "lowcarb",
  plant_based: "plant",
  plant: "plant",
  restrictions: "restrictions",
} as const;

const answersFromFirstNotes = {
  gender: { male: "male", female: "female", private: "prefer_not" },
  role: { student: "student", professional: "employee", freelancer: "freelance", caregiver: "caregiver", retired: "retired", other: "other" },
  age: { "18-24": "18_24", "25-34": "25_34", "35-44": "35_44", "45-54": "45_54", "55-64": "55_64", "65+": "65_plus" },
  interests: { movement: "fitness", reading: "reading", music: "music_film", games: "gaming", outdoors: "outdoors", creative: "creative" },
  sleep: { under5: "under_5h", "5to6": "5_6h", "6to7": "6_7h", "7to8": "7_8h", "8to9": "8_9h", "9plus": "over_9h" },
  exercise: { rarely: "almost_none", under1: "under_1h", "1to2": "1_2h", "2to4": "2_4h", "4to7": "4_7h", "7plus": "over_7h" },
  diet: { none: "none", light: "light", protein: "high_protein", lowcarb: "low_carb", plant: "plant_based", restrictions: "restrictions" },
} as const;

function mappedValue<T extends Record<string, string>>(source: unknown, map: T) {
  return typeof source === "string" && source in map ? map[source as keyof T] : null;
}

function mappedList<T extends Record<string, string>>(source: unknown, map: T) {
  if (!Array.isArray(source)) return [];
  const values = source
    .map((item) => mappedValue(item, map))
    .filter((item): item is T[keyof T] => Boolean(item));
  return Array.from(new Set(values));
}

export function firstNotesFromAnswers(
  answers: Partial<OnboardingAnswers> | null | undefined,
  language: FirstNotesLanguage,
  completedAt?: string | null,
): FirstNotesProfile | null {
  const stored = normalizeFirstNotesProfile(answers?.firstNotesProfile, { partial: true, fallbackLanguage: language });
  if (stored) return stored;
  if (!answers) return null;
  const profile: FirstNotesProfile = {
    version: 4,
    language,
    gender: mappedValue(answers.gender, genderFromAnswers),
    role: mappedValue(answers.occupation, roleFromAnswers),
    age: mappedValue(answers.ageGroup, ageFromAnswers),
    interests: mappedList(answers.hobbies, interestFromAnswers).slice(0, 3) as FirstNotesProfile["interests"],
    sleep: mappedValue(answers.sleepDuration, sleepFromAnswers),
    exercise: mappedValue(answers.exerciseDuration, exerciseFromAnswers),
    diet: mappedList(answers.dietPreferences, dietFromAnswers).slice(0, 3) as FirstNotesProfile["diet"],
  };
  const timestamp = normalizedTimestamp(completedAt);
  if (timestamp) profile.completedAt = timestamp;
  return normalizeFirstNotesProfile(profile, { partial: true, fallbackLanguage: language });
}

export function answersFromFirstNotesProfile(
  profile: FirstNotesProfile,
  previousAnswers?: Partial<OnboardingAnswers>,
): OnboardingAnswers {
  const timestamp = new Date().toISOString();
  const previousFirstNotes = normalizeFirstNotesProfile(previousAnswers?.firstNotesProfile, { partial: true, fallbackLanguage: profile.language });
  return {
    gender: answersFromFirstNotes.gender[profile.gender ?? "private"],
    ageGroup: answersFromFirstNotes.age[profile.age ?? "18-24"],
    occupation: answersFromFirstNotes.role[profile.role ?? "other"],
    hobbies: profile.interests.map((item) => answersFromFirstNotes.interests[item]),
    sleepDuration: answersFromFirstNotes.sleep[profile.sleep ?? "7to8"],
    exerciseDuration: answersFromFirstNotes.exercise[profile.exercise ?? "1to2"],
    dietPreferences: profile.diet.map((item) => answersFromFirstNotes.diet[item]),
    essentialConsent: previousAnswers?.essentialConsent ?? true,
    healthDataConsent: previousAnswers?.healthDataConsent ?? true,
    aiPersonalizationConsent: previousAnswers?.aiPersonalizationConsent ?? true,
    firstNotesProfile: {
      ...profile,
      completedAt: profile.completedAt ?? previousFirstNotes?.completedAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}
