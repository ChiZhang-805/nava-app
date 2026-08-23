import type { RecordModule } from "../features/RecordsScreen";
import type { TodaySnapshot, TrendBundle } from "../types";
import type { UserProfile } from "./profile";

type Locale = "zh" | "en";

const average = (values: number[]) => values.length > 0
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0;

function profileSuffix(profile: UserProfile | null, locale: Locale) {
  if (!profile || profile.ai_personalization_consent === false) return "";
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
    return locale === "zh" ? `昨晚睡眠 ${Math.floor(current / 60)} 小时 ${current % 60} 分，较近七日平均${delta >= 0 ? "多" : "少"} ${Math.abs(delta)} 分钟。${profile?.sleep_schedule ? `你的画像作息为“${profile.sleep_schedule}”，建议优先稳定入睡时间。` : suffix}` : `Last night was ${Math.floor(current / 60)}h ${current % 60}m, ${Math.abs(delta)} minutes ${delta >= 0 ? "above" : "below"} your seven-day average. ${profile?.sleep_schedule ? `Your profile rhythm is ${profile.sleep_schedule}; keep bedtime consistent.` : suffix}`;
  }
  if (module === "exercise") {
    const values = trends?.exercises.map((item) => item.steps ?? 0).filter(Boolean) ?? [];
    const current = snapshot?.exercise?.steps;
    if (current == null) return locale === "zh" ? "同步步数或记录一次运动后，NAVA 会评估活动量与恢复节奏。" : "Sync steps or log a workout to assess activity and recovery rhythm.";
    const avg = Math.round(average(values.length > 0 ? values : [current]));
    return locale === "zh" ? `今日 ${current.toLocaleString()} 步，近七日平均 ${avg.toLocaleString()} 步。${profile?.exercise_frequency ? `你选择的是“${profile.exercise_frequency}”，今天以不打断恢复为前提逐步增加活动。` : suffix}` : `Today: ${current.toLocaleString()} steps; seven-day average: ${avg.toLocaleString()}. ${profile?.exercise_frequency ? `Your activity profile is ${profile.exercise_frequency}; increase movement without compromising recovery.` : suffix}`;
  }
  if (module === "diet") {
    const records = trends?.nutritions ?? [];
    const current = snapshot?.nutrition;
    if (!current) return locale === "zh" ? "拍摄或手动记录一餐后，NAVA 会汇总餐次完整度与近七日能量变化。" : "Photograph or log a meal to track meal coverage and seven-day energy changes.";
    const avg = Math.round(average(records.map((item) => item.total_calories).filter(Boolean)) || current.total_calories);
    const meals = [current.breakfast_items, current.lunch_items, current.dinner_items].filter((items) => (items?.length ?? 0) > 0).length;
    return locale === "zh" ? `今天已记录 ${meals}/3 餐，共 ${current.total_calories} kcal；近七日平均 ${avg} kcal。${profile?.diet_preference ? `按“${profile.diet_preference}”偏好补齐尚未记录的餐次。` : suffix}` : `${meals}/3 meals logged today, ${current.total_calories} kcal; seven-day average ${avg} kcal. ${profile?.diet_preference ? `Complete missing meals using your ${profile.diet_preference} preference.` : suffix}`;
  }
  if (module === "focus") {
    const values = trends?.focus.map((item) => item.total_minutes) ?? [];
    const current = snapshot?.focusMinutes ?? 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return locale === "zh" ? `今日已专注 ${current} 分钟，近七日累计 ${total} 分钟。${profile?.occupation ? `结合“${profile.occupation}”日常，下一段专注应安排在干扰较少的时段。` : suffix}` : `${current} focus minutes today and ${total} across seven days. ${profile?.occupation ? `For your ${profile.occupation} routine, schedule the next block in a low-interruption window.` : suffix}`;
  }
  const current = snapshot?.face;
  if (!current || current.overall_score == null) return locale === "zh" ? "拍摄一张清晰的正面照片后，NAVA 会生成仅供日常状态观察的非医疗分析。" : "Take a clear front-facing photo for a non-medical daily state observation.";
  const scores = trends?.faces.map((item) => item.overall_score).filter((value): value is number => value != null) ?? [];
  const avg = Math.round(average(scores.length > 0 ? scores : [current.overall_score]));
  return locale === "zh" ? `今日面部状态 ${current.overall_score}，近七日平均 ${avg}。结果只用于观察日常变化，不构成医学判断。` : `Today's face-state score is ${current.overall_score}; the seven-day average is ${avg}. This is for daily observation, not medical diagnosis.`;
}
