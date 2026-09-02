import type { TodaySnapshot } from "../types";

export type HealthModuleKey = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";

export type HealthModulePresentation = {
  recorded: boolean;
  points: [string, string, string, string];
};

export function buildHealthModulePresentations(snapshot: TodaySnapshot | null, locale: "zh" | "en") {
  const missing = missingPresentation(locale);
  if (!snapshot) {
    return {
      mood: missing,
      sleep: missing,
      exercise: missing,
      diet: missing,
      focus: missing,
      face: missing,
    } satisfies Record<HealthModuleKey, HealthModulePresentation>;
  }

  const mood = snapshot.mood;
  const sleep = snapshot.sleep;
  const exercise = snapshot.exercise;
  const nutrition = snapshot.nutrition;
  const face = snapshot.face;
  const focusRecorded = snapshot.focusMinutes > 0 || snapshot.focusSessions > 0;

  return {
    mood: mood ? {
      recorded: true,
      points: locale === "zh"
        ? [`情绪 ${Math.round(mood.mood_score)}/100`, `原因 ${mood.factors.slice(0, 2).join("、") || "未选择"}`, mood.diary_content ? "已写情绪日记" : "未写情绪日记", mood.ai_feedback ? "已有 AI 反馈" : "待生成 AI 反馈"]
        : [`Mood ${Math.round(mood.mood_score)}/100`, `Factors: ${mood.factors.slice(0, 2).join(", ") || "none"}`, mood.diary_content ? "Journal added" : "No journal yet", mood.ai_feedback ? "AI feedback ready" : "AI feedback pending"],
    } : missing,
    sleep: sleep ? {
      recorded: true,
      points: locale === "zh"
        ? [formatMinutes(sleep.sleep_duration_minutes, locale), `${sleep.sleep_start ?? "--"} — ${sleep.sleep_end ?? "--"}`, `自评 ${sleep.self_rating ?? "--"}/5`, `节律 ${roundOrPlaceholder(sleep.rhythm_score)}/100`]
        : [formatMinutes(sleep.sleep_duration_minutes, locale), `${sleep.sleep_start ?? "--"} — ${sleep.sleep_end ?? "--"}`, `Rating ${sleep.self_rating ?? "--"}/5`, `Rhythm ${roundOrPlaceholder(sleep.rhythm_score)}/100`],
    } : missing,
    exercise: exercise ? {
      recorded: true,
      points: locale === "zh"
        ? [`${roundOrPlaceholder(exercise.steps)} 步`, `${roundOrPlaceholder(exercise.exercise_minutes)} 分钟运动`, `${roundOrPlaceholder(exercise.calories)} kcal`, `心率 ${exercise.heart_rate || "--"}`]
        : [`${roundOrPlaceholder(exercise.steps)} steps`, `${roundOrPlaceholder(exercise.exercise_minutes)} active min`, `${roundOrPlaceholder(exercise.calories)} kcal`, `Heart rate ${exercise.heart_rate || "--"}`],
    } : missing,
    diet: nutrition ? {
      recorded: true,
      points: locale === "zh"
        ? [`${Math.round(nutrition.total_calories)} kcal`, `已记 ${mealCount(nutrition)} 餐`, `蛋白质 ${roundOrPlaceholder(nutrition.protein_grams)} g`, `饮水 ${roundOrPlaceholder(nutrition.hydration_ml)} ml`]
        : [`${Math.round(nutrition.total_calories)} kcal`, `${mealCount(nutrition)} meals logged`, `Protein ${roundOrPlaceholder(nutrition.protein_grams)} g`, `Water ${roundOrPlaceholder(nutrition.hydration_ml)} ml`],
    } : missing,
    focus: focusRecorded ? {
      recorded: true,
      points: locale === "zh"
        ? [`${Math.round(snapshot.focusMinutes)} 分钟`, `${Math.round(snapshot.focusSessions)} 次完成`, `平均 ${averageFocusMinutes(snapshot)} 分钟/次`, "今日已有专注记录"]
        : [`${Math.round(snapshot.focusMinutes)} minutes`, `${Math.round(snapshot.focusSessions)} sessions`, `${averageFocusMinutes(snapshot)} min average`, "Focus logged today"],
    } : missing,
    face: face ? {
      recorded: true,
      points: locale === "zh"
        ? [`状态 ${roundOrPlaceholder(face.overall_score)}/100`, `肤龄 ${roundOrPlaceholder(face.skin_age)}`, face.capture_mode === "makeup" ? "带妆模式" : "素颜模式", `置信度 ${percentageOrPlaceholder(face.analysis_confidence)}`]
        : [`State ${roundOrPlaceholder(face.overall_score)}/100`, `Skin age ${roundOrPlaceholder(face.skin_age)}`, face.capture_mode === "makeup" ? "Makeup mode" : "Bare-face mode", `Confidence ${percentageOrPlaceholder(face.analysis_confidence)}`],
    } : missing,
  } satisfies Record<HealthModuleKey, HealthModulePresentation>;
}

export function allHealthModulesRecorded(presentations: Record<HealthModuleKey, HealthModulePresentation>) {
  return Object.values(presentations).every((item) => item.recorded);
}

export function compareRecordedPeriodAverages(currentValues: number[], previousValues: number[]) {
  const currentAverage = averageRecordedValues(currentValues);
  const previousAverage = averageRecordedValues(previousValues);
  return {
    currentAverage,
    previousAverage,
    change: currentAverage == null || previousAverage == null ? null : Math.round(currentAverage - previousAverage),
  };
}

function missingPresentation(locale: "zh" | "en"): HealthModulePresentation {
  return {
    recorded: false,
    points: locale === "zh"
      ? ["暂无记录", "点击进入补录", "补齐后生成真实摘要", "缺失数据不按零分计算"]
      : ["No record yet", "Tap to add data", "Summary appears after logging", "Missing data is not scored as zero"],
  };
}

function formatMinutes(value: number | null | undefined, locale: "zh" | "en") {
  if (value == null) return locale === "zh" ? "时长 --" : "Duration --";
  const minutes = Math.max(0, Math.round(value));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale === "en") return hours > 0 ? `${hours}h ${rest}m` : `${rest} min`;
  return hours > 0 ? `${hours}小时${rest}分` : `${rest} 分钟`;
}

function roundOrPlaceholder(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "--" : String(Math.round(Number(value)));
}

function percentageOrPlaceholder(value: number | null | undefined) {
  return value == null || !Number.isFinite(Number(value)) ? "--" : `${Math.round(Number(value) * 100)}%`;
}

function mealCount(nutrition: NonNullable<TodaySnapshot["nutrition"]>) {
  return [nutrition.breakfast_items, nutrition.lunch_items, nutrition.dinner_items, nutrition.pantry_items]
    .filter((items) => Array.isArray(items) && items.length > 0).length;
}

function averageFocusMinutes(snapshot: TodaySnapshot) {
  if (snapshot.focusSessions <= 0) return 0;
  return Math.round(snapshot.focusMinutes / snapshot.focusSessions);
}

function averageRecordedValues(values: number[]) {
  const recorded = values.filter((value) => Number.isFinite(value));
  if (recorded.length === 0) return null;
  return Math.round(recorded.reduce((sum, value) => sum + value, 0) / recorded.length);
}
