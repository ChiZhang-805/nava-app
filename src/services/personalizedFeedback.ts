import type { RecordModule } from "../features/RecordsScreen";
import type { TodaySnapshot, TrendBundle } from "../types";
import type { UserProfile } from "./profile";
import { onboardingAnswers, resolveConsentFlag } from "./consent.ts";

type Locale = "zh" | "en";

const average = (values: number[]) => values.length > 0
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

const profileValueLabels: Record<string, { zh: string; en: string }> = {
  student: { zh: "学生", en: "student" },
  employee: { zh: "职场人士", en: "work" },
  freelance: { zh: "自由职业", en: "freelance" },
  caregiver: { zh: "居家照护", en: "home care" },
  retired: { zh: "退休生活", en: "retired" },
  almost_none: { zh: "几乎不运动", en: "low-activity" },
  under_1h: { zh: "每周少于 1 小时", en: "under 1 hour per week" },
  "1_2h": { zh: "每周 1–2 小时", en: "1–2 hours per week" },
  "2_4h": { zh: "每周 2–4 小时", en: "2–4 hours per week" },
  "4_7h": { zh: "每周 4–7 小时", en: "4–7 hours per week" },
  over_7h: { zh: "每周 7 小时以上", en: "over 7 hours per week" },
  under_5h: { zh: "少于 5 小时", en: "under 5 hours" },
  "5_6h": { zh: "5–6 小时", en: "5–6 hours" },
  "6_7h": { zh: "6–7 小时", en: "6–7 hours" },
  "7_8h": { zh: "7–8 小时", en: "7–8 hours" },
  "8_9h": { zh: "8–9 小时", en: "8–9 hours" },
  over_9h: { zh: "9 小时以上", en: "over 9 hours" },
  none: { zh: "无特殊偏好", en: "no particular diet" },
  light: { zh: "清淡少油", en: "light meals" },
  high_protein: { zh: "高蛋白", en: "high protein" },
  low_carb: { zh: "低碳控糖", en: "lower carb" },
  plant_based: { zh: "素食植物性", en: "plant based" },
  restrictions: { zh: "过敏或忌口", en: "dietary restrictions" },
};

function localizedProfileValue(value: string | null | undefined, locale: Locale) {
  if (!value) return "";
  return value.split(/[、,]/).map((item) => {
    const token = item.trim();
    return profileValueLabels[token]?.[locale] ?? token;
  }).filter(Boolean).join(locale === "zh" ? "、" : ", ");
}

function profileSuffix(profile: UserProfile | null, locale: Locale) {
  if (!profile) return "";
  const answers = onboardingAnswers(profile.onboarding_answers);
  if (!resolveConsentFlag(profile.ai_personalization_consent, answers?.aiPersonalizationConsent)) return "";
  const goal = profile.goal?.trim();
  if (!goal) return "";
  return locale === "zh" ? `结合你“${goal}”的目标，先保持一个容易持续的小调整。` : `For your “${goal}” goal, start with one change you can sustain.`;
}

export function buildModuleFeedback({
  module,
  locale,
  profile,
  snapshot,
  trends,
}: {
  module: RecordModule;
  locale: Locale;
  profile: UserProfile | null;
  snapshot: TodaySnapshot | null;
  trends: TrendBundle | null;
}) {
  const suffix = profileSuffix(profile, locale);
  if (module === "mood") {
    const values = trends?.moods.map((item) => item.mood_score) ?? [];
    const current = snapshot?.mood?.mood_score;
    if (current == null) return locale === "zh" ? "记录此刻的情绪和主要原因后，NAVA 才能识别反复出现的影响因素。" : "Log your mood and its main cause so NAVA can identify recurring factors.";
    const avg = Math.round(average(values.length > 0 ? values : [current]));
    return locale === "zh" ? `今日情绪 ${current}，近七日平均 ${avg}。${snapshot?.mood?.factors?.[0] ? `主要因素是“${snapshot.mood.factors[0]}”。` : "补充主要原因会让反馈更准确。"}${suffix}` : `Today's mood is ${current}; the seven-day average is ${avg}. ${snapshot?.mood?.factors?.[0] ? `${snapshot.mood.factors[0]} is the main factor. ` : "Add a cause for more precise feedback. "}${suffix}`;
  }
  if (module === "sleep") {
    const values = trends?.sleeps.map((item) => item.sleep_duration_minutes ?? 0).filter(Boolean) ?? [];
    const current = snapshot?.sleep?.sleep_duration_minutes;
    if (current == null) return locale === "zh" ? "补充昨晚入睡、醒来和睡眠阶段后，NAVA 会比较你的个人基线。" : "Add bedtime, wake time and sleep stages so NAVA can compare your baseline.";
    const avg = Math.round(average(values.length > 0 ? values : [current]));
    const delta = current - avg;
    const sleepSchedule = localizedProfileValue(profile?.sleep_schedule, locale);
    return locale === "zh" ? `昨晚睡眠 ${Math.floor(current / 60)} 小时 ${current % 60} 分，较近七日平均${delta >= 0 ? "多" : "少"} ${Math.abs(delta)} 分钟。${sleepSchedule ? `你的画像作息为“${sleepSchedule}”，建议优先稳定入睡时间。` : suffix}` : `Last night was ${Math.floor(current / 60)}h ${current % 60}m, ${Math.abs(delta)} minutes ${delta >= 0 ? "above" : "below"} your seven-day average. ${sleepSchedule ? `Your profile rhythm is ${sleepSchedule}; keep bedtime consistent.` : suffix}`;
  }
  if (module === "exercise") {
    const values = trends?.exercises.flatMap((item) => item.steps == null ? [] : [item.steps]) ?? [];
    const current = snapshot?.exercise?.steps;
    if (current == null) return locale === "zh" ? "同步步数或记录一次运动后，NAVA 会评估活动量与恢复节奏。" : "Sync steps or log a workout to assess activity and recovery rhythm.";
    const avg = Math.round(average(values.length > 0 ? values : [current]));
    const exerciseProfile = localizedProfileValue(profile?.exercise_frequency, locale);
    return locale === "zh" ? `今日 ${current.toLocaleString()} 步，近七日平均 ${avg.toLocaleString()} 步。${exerciseProfile ? `你选择的是“${exerciseProfile}”，今天以不打断恢复为前提逐步增加活动。` : suffix}` : `Today: ${current.toLocaleString()} steps; seven-day average: ${avg.toLocaleString()}. ${exerciseProfile ? `Your activity profile is ${exerciseProfile}; increase movement without compromising recovery.` : suffix}`;
  }
  if (module === "diet") {
    const records = trends?.nutritions ?? [];
    const current = snapshot?.nutrition;
    if (!current) return locale === "zh" ? "拍摄或手动记录一餐后，NAVA 会汇总餐次完整度与近七日能量变化。" : "Photograph or log a meal to track meal coverage and seven-day energy changes.";
    const knownCalories = records.flatMap((item) => item.total_calories == null ? [] : [item.total_calories]);
    const avg = knownCalories.length ? Math.round(average(knownCalories)) : current.total_calories ?? "--";
    const meals = [current.breakfast_items, current.lunch_items, current.dinner_items].filter((items) => (items?.length ?? 0) > 0).length;
    const dietPreference = localizedProfileValue(profile?.diet_preference, locale);
    return locale === "zh" ? `今天已记录 ${meals}/3 餐，共 ${current.total_calories ?? "--"} kcal；近七日平均 ${avg} kcal。${dietPreference ? `按“${dietPreference}”偏好补齐尚未记录的餐次。` : suffix}` : `${meals}/3 meals logged today, ${current.total_calories ?? "--"} kcal; seven-day average ${avg} kcal. ${dietPreference ? `Complete missing meals with ${dietPreference} in mind.` : suffix}`;
  }
  if (module === "focus") {
    const values = trends?.focus.map((item) => item.total_minutes) ?? [];
    const current = snapshot?.focusMinutes ?? 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    const occupation = localizedProfileValue(profile?.occupation, locale);
    return locale === "zh" ? `今日已专注 ${current} 分钟，近七日累计 ${total} 分钟。${occupation ? `结合“${occupation}”日常，下一段专注应安排在干扰较少的时段。` : suffix}` : `${current} focus minutes today and ${total} across seven days. ${occupation ? `For your ${occupation} routine, schedule the next block in a low-interruption window.` : suffix}`;
  }
  const current = snapshot?.face;
  if (!current || current.overall_score == null) return locale === "zh" ? "拍摄一张清晰的正面照片后，NAVA 会生成仅供日常状态观察的非医疗分析。" : "Take a clear front-facing photo for a non-medical daily state observation.";
  const scores = trends?.faces.map((item) => item.overall_score).filter((value): value is number => value != null) ?? [];
  const avg = Math.round(average(scores.length > 0 ? scores : [current.overall_score]));
  return locale === "zh" ? `今日面部状态 ${current.overall_score}，近七日平均 ${avg}。结果只用于观察日常变化，不构成医学判断。` : `Today's face-state score is ${current.overall_score}; the seven-day average is ${avg}. This is for daily observation, not medical diagnosis.`;
}
