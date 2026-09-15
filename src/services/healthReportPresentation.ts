import type { ExerciseRecord, FaceRecord, NutritionRecord, SleepRecord, TodaySnapshot } from "../types";
import { isCompleteMoodRecord } from "./mood.ts";

export type HealthModuleKey = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";
export type HealthModulePoints = [string, string, string, string];

export type HealthModulePresentation = {
  recorded: boolean;
  completed: boolean;
  completedUnits: number;
  requiredUnits: number;
  progress: number;
  points: HealthModulePoints;
};

export type HealthModuleProgress = Pick<
  HealthModulePresentation,
  "recorded" | "completed" | "completedUnits" | "requiredUnits" | "progress"
>;

export function buildHealthModuleProgress(snapshot: TodaySnapshot | null) {
  const empty = oneStepProgress(false, false);
  if (!snapshot) {
    return {
      mood: empty,
      sleep: empty,
      exercise: empty,
      diet: progressFromUnits(0, 4, false),
      focus: empty,
      face: empty,
    } satisfies Record<HealthModuleKey, HealthModuleProgress>;
  }

  const completedMeals = snapshot.nutrition ? mealCount(snapshot.nutrition) : 0;
  const focusRecorded = snapshot.focusMinutes > 0 || snapshot.focusSessions > 0;
  const focusCompleted = snapshot.focusMinutes > 0 && snapshot.focusSessions > 0;

  return {
    mood: oneStepProgress(Boolean(snapshot.mood), isCompleteMoodRecord(snapshot.mood)),
    sleep: oneStepProgress(Boolean(snapshot.sleep), isCompleteSleepRecord(snapshot.sleep)),
    exercise: oneStepProgress(Boolean(snapshot.exercise), isCompleteExerciseRecord(snapshot.exercise)),
    diet: progressFromUnits(completedMeals, 4, Boolean(snapshot.nutrition)),
    focus: oneStepProgress(focusRecorded, focusCompleted),
    face: oneStepProgress(Boolean(snapshot.face), isCompleteFaceRecord(snapshot.face)),
  } satisfies Record<HealthModuleKey, HealthModuleProgress>;
}

export function healthModuleEntryView(progress: HealthModuleProgress): "editor" | null {
  return progress.completed ? null : "editor";
}

export function healthModuleProgressLabel(progress: HealthModuleProgress, locale: "zh" | "en", scope: "today" | "selected-date" = "today") {
  if (progress.completed) {
    if (scope === "selected-date") return locale === "zh" ? "所选日期记录已完成" : "The selected date's record is complete";
    return locale === "zh" ? "今日记录已完成" : "Today's record is complete";
  }
  if (scope === "selected-date") {
    return locale === "zh"
      ? `所选日期进度 ${progress.completedUnits}/${progress.requiredUnits}，点击继续记录`
      : `Selected-date progress ${progress.completedUnits}/${progress.requiredUnits}; tap to continue logging`;
  }
  return locale === "zh"
    ? `今日进度 ${progress.completedUnits}/${progress.requiredUnits}，点击继续记录`
    : `Today's progress ${progress.completedUnits}/${progress.requiredUnits}; tap to continue logging`;
}

export function buildHealthModulePresentations(snapshot: TodaySnapshot | null, locale: "zh" | "en") {
  const progress = buildHealthModuleProgress(snapshot);
  const missingFor = (key: HealthModuleKey) => ({ ...missingPresentation(key, locale), ...progress[key] });
  if (!snapshot) {
    return {
      mood: missingFor("mood"),
      sleep: missingFor("sleep"),
      exercise: missingFor("exercise"),
      diet: missingFor("diet"),
      focus: missingFor("focus"),
      face: missingFor("face"),
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
      ...progress.mood,
      points: locale === "zh"
        ? [`情绪 ${Math.round(mood.mood_score)}/100`, `原因 ${mood.factors.slice(0, 2).join("、") || "未选择"}`, mood.diary_content ? "已写情绪日记" : "未写情绪日记", "已保存至当前账号"]
        : [`Mood ${Math.round(mood.mood_score)}/100`, `Factors: ${mood.factors.slice(0, 2).join(", ") || "none"}`, mood.diary_content ? "Journal added" : "No journal yet", "Saved to account"],
    } : missingFor("mood"),
    sleep: sleep ? {
      ...progress.sleep,
      points: locale === "zh"
        ? [formatMinutes(sleep.sleep_duration_minutes, locale), `${sleep.sleep_start ?? "--"} — ${sleep.sleep_end ?? "--"}`, `自评 ${sleep.self_rating ?? "--"}/5`, `节律 ${roundOrPlaceholder(sleep.rhythm_score)}/100`]
        : [formatMinutes(sleep.sleep_duration_minutes, locale), `${sleep.sleep_start ?? "--"} — ${sleep.sleep_end ?? "--"}`, `Rating ${sleep.self_rating ?? "--"}/5`, `Rhythm ${roundOrPlaceholder(sleep.rhythm_score)}/100`],
    } : missingFor("sleep"),
    exercise: exercise ? {
      ...progress.exercise,
      points: locale === "zh"
        ? [`${roundOrPlaceholder(exercise.steps)} 步`, `${roundOrPlaceholder(exercise.exercise_minutes)} 分钟运动`, `${roundOrPlaceholder(exercise.calories)} kcal`, `心率 ${exercise.heart_rate || "--"}`]
        : [`${roundOrPlaceholder(exercise.steps)} steps`, `${roundOrPlaceholder(exercise.exercise_minutes)} active min`, `${roundOrPlaceholder(exercise.calories)} kcal`, `Heart rate ${exercise.heart_rate || "--"}`],
    } : missingFor("exercise"),
    diet: nutrition ? {
      ...progress.diet,
      points: locale === "zh"
        ? [`${roundOrPlaceholder(nutrition.total_calories)} kcal`, `已记 ${mealCount(nutrition)} 餐`, `蛋白质 ${roundOrPlaceholder(nutrition.protein_grams)} g`, `饮水 ${roundOrPlaceholder(nutrition.hydration_ml)} ml`]
        : [`${roundOrPlaceholder(nutrition.total_calories)} kcal`, `${mealCount(nutrition)} meals logged`, `Protein ${roundOrPlaceholder(nutrition.protein_grams)} g`, `Water ${roundOrPlaceholder(nutrition.hydration_ml)} ml`],
    } : missingFor("diet"),
    focus: focusRecorded ? {
      ...progress.focus,
      points: locale === "zh"
        ? [`${Math.round(snapshot.focusMinutes)} 分钟`, `${Math.round(snapshot.focusSessions)} 次完成`, `平均 ${averageFocusMinutes(snapshot)} 分钟/次`, "今日已有专注记录"]
        : [`${Math.round(snapshot.focusMinutes)} minutes`, `${Math.round(snapshot.focusSessions)} sessions`, `${averageFocusMinutes(snapshot)} min average`, "Focus logged today"],
    } : missingFor("focus"),
    face: face ? {
      ...progress.face,
      points: locale === "zh"
        ? [`状态 ${roundOrPlaceholder(face.overall_score)}/100`, `肤龄 ${roundOrPlaceholder(face.skin_age)}`, face.capture_mode === "makeup" ? "带妆模式" : "素颜模式", `置信度 ${percentageOrPlaceholder(face.analysis_confidence)}`]
        : [`State ${roundOrPlaceholder(face.overall_score)}/100`, `Skin age ${roundOrPlaceholder(face.skin_age)}`, face.capture_mode === "makeup" ? "Makeup mode" : "Bare-face mode", `Confidence ${percentageOrPlaceholder(face.analysis_confidence)}`],
    } : missingFor("face"),
  } satisfies Record<HealthModuleKey, HealthModulePresentation>;
}

export function allHealthModulesRecorded(presentations: Record<HealthModuleKey, HealthModulePresentation>) {
  return Object.values(presentations).every((item) => item.recorded);
}

export function allHealthModulesComplete(presentations: Record<HealthModuleKey, HealthModulePresentation>) {
  return Object.values(presentations).every((item) => item.completed);
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

export function healthModuleDictionaryPoints(key: HealthModuleKey, locale: "zh" | "en"): HealthModulePoints {
  const zh: Record<HealthModuleKey, HealthModulePoints> = {
    mood: ["今日情绪总状态", "主要情绪触发源", "压力强度起伏值", "身体感受备注项"],
    sleep: ["入睡醒来时间点", "夜间醒来次数值", "睡眠恢复感受值", "白天困倦程度值"],
    exercise: ["今日步数消耗量", "运动训练类型项", "运动强度反馈值", "疲劳疼痛记录项"],
    diet: ["今日三餐完成度", "饮水咖啡摄入量", "胃肠反应饱腹感", "酒精补剂记录项"],
    focus: ["专注工作总时长", "今日任务完成度", "中断分心次数值", "效率感受反馈值"],
    face: ["今日面部拍照项", "眼周疲态变化值", "肤色水肿情况项", "面部状态备注项"],
  };
  const en: Record<HealthModuleKey, HealthModulePoints> = {
    mood: ["Mood score", "Main trigger", "Stress shift", "Body note"],
    sleep: ["Sleep window", "Wake count", "Recovery feel", "Daytime tired"],
    exercise: ["Steps burned", "Training type", "Effort level", "Pain or fatigue"],
    diet: ["Meals complete", "Water coffee", "Gut response", "Alcohol extras"],
    focus: ["Focus time", "Task progress", "Interruptions", "Efficiency feel"],
    face: ["Face photo", "Eye fatigue", "Color swelling", "Face note"],
  };
  return (locale === "zh" ? zh : en)[key];
}

function missingPresentation(key: HealthModuleKey, locale: "zh" | "en"): HealthModulePresentation {
  return {
    recorded: false,
    completed: false,
    completedUnits: 0,
    requiredUnits: 1,
    progress: 0,
    points: healthModuleDictionaryPoints(key, locale),
  };
}

function oneStepProgress(recorded: boolean, completed: boolean): HealthModuleProgress {
  return progressFromUnits(completed ? 1 : 0, 1, recorded);
}

function progressFromUnits(completedUnits: number, requiredUnits: number, recorded: boolean): HealthModuleProgress {
  const safeRequiredUnits = Math.max(1, Math.round(requiredUnits));
  const safeCompletedUnits = Math.min(safeRequiredUnits, Math.max(0, Math.round(completedUnits)));
  return {
    recorded,
    completed: safeCompletedUnits >= safeRequiredUnits,
    completedUnits: safeCompletedUnits,
    requiredUnits: safeRequiredUnits,
    progress: safeCompletedUnits / safeRequiredUnits,
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

export function isCompleteSleepRecord(record: SleepRecord | null | undefined) {
  return Boolean(record && Number.isFinite(Number(record.sleep_duration_minutes)) && Number(record.sleep_duration_minutes) > 0);
}

export function isCompleteExerciseRecord(record: ExerciseRecord | null | undefined) {
  if (!record) return false;
  return [record.steps, record.calories, record.exercise_minutes]
    .some((value) => Number.isFinite(Number(value)) && Number(value) > 0);
}

export function isCompleteNutritionRecord(record: NutritionRecord | null | undefined) {
  return Boolean(record && mealCount(record) >= 4);
}

export function isCompleteFaceRecord(record: FaceRecord | null | undefined) {
  return Boolean(
    record
    && Number.isFinite(Number(record.overall_score))
    && Number(record.overall_score) >= 0
    && record.feedback?.trim(),
  );
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
