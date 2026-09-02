import { onboardingAnswers, resolveConsentFlag } from "./consent.ts";

export type AiProcessingStep = {
  id: string;
  label: string;
  tone: "cute" | "practical" | "flexible" | "gentle" | "calm" | "neutral";
};

export const AI_PROCESSING_STEP_MIN_MS = 1_000;

type ProcessingProfile = {
  occupation?: string | null;
  age_group?: string | null;
  ai_personalization_consent?: boolean | null;
  onboarding_answers?: Record<string, unknown> | null;
};

const zhSteps: Record<AiProcessingStep["tone"], string[]> = {
  cute: [
    "NAVA 小雷达捕捉到重点啦 ✦",
    "把你的状态线索拼成一张小地图…",
    "轻量攻略装好啦，马上送达",
  ],
  practical: [
    "先锁定眼下最重要的变量",
    "对齐今天的时间与精力余量",
    "压缩成一条现在就能执行的建议",
  ],
  flexible: [
    "先找出今天节奏里的锚点",
    "把状态和可支配时间对一对",
    "整理成一条留有弹性的方案",
  ],
  gentle: [
    "先看看此刻最费力的地方",
    "在碎片时间里找一点可行空间",
    "整理成一条低负担的下一步",
  ],
  calm: [
    "先把你关心的情况看清楚",
    "对照今天的节奏与已有记录",
    "思路理顺了，马上清楚地告诉你",
  ],
  neutral: [
    "先听懂你这句话真正关心的事",
    "把相关状态和今天的记录对上",
    "思路已经理顺，马上告诉你",
  ],
};

const enSteps: Record<AiProcessingStep["tone"], string[]> = {
  cute: [
    "NAVA's little radar found the signal ✦",
    "Turning your clues into a tiny map…",
    "Your lightweight game plan is almost here",
  ],
  practical: [
    "Locking onto the variable that matters most",
    "Matching it with today's time and energy",
    "Compressing it into one workable next step",
  ],
  flexible: [
    "Finding an anchor in today's rhythm",
    "Matching your state with the time you control",
    "Shaping a plan with room to flex",
  ],
  gentle: [
    "Noticing what feels heaviest right now",
    "Looking for a little room in a fragmented day",
    "Shaping one low-burden next step",
  ],
  calm: [
    "Getting a clear view of what concerns you",
    "Checking it against today's rhythm and records",
    "The picture is clear — your answer is next",
  ],
  neutral: [
    "Listening for what matters beneath the words",
    "Matching it with today's relevant signals",
    "The path is clear — your answer is next",
  ],
};

export function buildAiProcessingSteps(profile: ProcessingProfile | null | undefined, lang: "zh" | "en") {
  const answers = onboardingAnswers(profile?.onboarding_answers);
  const consent = resolveConsentFlag(profile?.ai_personalization_consent, answers?.aiPersonalizationConsent);
  const occupation = consent ? text(profile?.occupation ?? answers?.occupation) : null;
  const ageGroup = consent ? text(profile?.age_group ?? answers?.ageGroup) : null;
  const tone = selectTone(occupation, ageGroup);
  const labels = (lang === "zh" ? zhSteps : enSteps)[tone];
  return labels.map((label, index): AiProcessingStep => ({ id: `${tone}-${index + 1}`, label, tone }));
}

function selectTone(occupation: string | null, ageGroup: string | null): AiProcessingStep["tone"] {
  if (occupation === "student") return "cute";
  if (occupation === "employee") return "practical";
  if (occupation === "freelance") return "flexible";
  if (occupation === "caregiver") return "gentle";
  if (occupation === "retired" || ageGroup === "55_64" || ageGroup === "65_plus") return "calm";
  if (ageGroup === "18_24") return "cute";
  return "neutral";
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
