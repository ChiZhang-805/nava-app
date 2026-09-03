import type { User } from "@supabase/supabase-js";
import { BedDouble, Bot, Brain, Camera, Check, ChevronLeft, ChevronRight, Drumstick, Dumbbell, Loader2, LockKeyhole, RefreshCw, ScanFace, Share2, ShieldCheck, SmilePlus, Upload, X, type LucideIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import ActionButton from "../components/ActionButton";
import AnimatedNumber from "../components/AnimatedNumber";
import ModuleProgressRing from "../components/ModuleProgressRing";
import PageSkeleton, { SkeletonBlock, SkeletonLines } from "../components/PageSkeleton";
import LineTrendChart from "../components/LineTrendChart";
import SectionCard from "../components/SectionCard";
import WeeklyRadarChart from "../components/WeeklyRadarChart";
import weeklyRunMascot from "../assets/mascot/nava-run-v1.png";
import { useLocale, type TranslationKey } from "../i18n";
import {
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveFaceAnalysisRecord,
  saveNutritionRecord,
  saveSleepRecord,
  refreshRhythmScore,
  getTodaySnapshot,
  getTrends,
} from "../services/records";
import { shiftDateISO, todayISO } from "../services/date";
import { analyzeDietPhoto, analyzeFacePhoto, resolveDietPhotoUrl } from "../services/media";
import { currentSevenDayPeriod, loadDnbWeeklyReport, refreshFdnbHealth, shareDnbWeeklyPoster, type DnbWeeklyReport } from "../services/dnb";
import { trackAnalyticsEvent } from "../services/analytics";
import type { GrowthActivityKind } from "../services/productivity";
import { clearRecordDraft, loadRecordDraft, saveRecordDraft, type RecordDraftModule } from "../services/drafts";
import { loadProfile, type UserProfile } from "../services/profile";
import { loadDietAiReport } from "../services/dietReport";
import { loadHealthAiReport, type HealthAiReport, type HealthReportSection } from "../services/healthReport";
import { calculateWeeklyModuleScores, type WeeklyModuleKey } from "../services/weeklyModuleScores";
import { allHealthModulesComplete, buildHealthModulePresentations, compareRecordedPeriodAverages, healthModuleEntryView, healthModuleProgressLabel } from "../services/healthReportPresentation";
import { clearSecureFaceDraft, loadSecureFaceDraft, saveSecureFaceDraft } from "../services/secureFaceDraft";
import type { FaceAnalysisResult, FoodItem, TodaySnapshot, TrendBundle } from "../types";
import RecordModuleDashboard from "./RecordModuleDashboard";

const moodFactors: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "压力", labelKey: "records.factor.pressure" },
  { value: "睡眠", labelKey: "records.factor.sleep" },
  { value: "运动", labelKey: "records.factor.exercise" },
  { value: "饮食", labelKey: "records.factor.diet" },
  { value: "工作", labelKey: "records.factor.work" },
  { value: "社交", labelKey: "records.factor.social" },
  { value: "身体不适", labelKey: "records.factor.body" },
  { value: "天气", labelKey: "records.factor.weather" },
  { value: "其他", labelKey: "records.factor.other" },
];

export type RecordModule = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";

const dashboardModules = new Set<RecordModule>(["mood", "sleep", "exercise", "diet", "focus", "face"]);

const recordModules: Array<{
  id: RecordModule;
  labelKey: TranslationKey;
  icon: LucideIcon;
}> = [
  {
    id: "mood",
    labelKey: "records.mood",
    icon: SmilePlus,
  },
  {
    id: "sleep",
    labelKey: "records.sleep",
    icon: BedDouble,
  },
  {
    id: "exercise",
    labelKey: "records.exercise",
    icon: Dumbbell,
  },
  {
    id: "diet",
    labelKey: "records.diet",
    icon: Drumstick,
  },
  {
    id: "focus",
    labelKey: "records.focus",
    icon: Brain,
  },
  {
    id: "face",
    labelKey: "records.faceShort",
    icon: ScanFace,
  },
];

const weeklyPlaceholderValues = [44, 62, 52, 72, 57, 67, 49] as const;
const weeklyPlaceholderHeights = (() => {
  const minimum = Math.min(...weeklyPlaceholderValues);
  const maximum = Math.max(...weeklyPlaceholderValues);
  const span = Math.max(1, maximum - minimum);
  return weeklyPlaceholderValues.map((value) => `${Math.round(30 + ((value - minimum) / span) * 70)}%`);
})();

function recordedDateCount(bundle: TrendBundle | null, startDate: string, endDate: string) {
  if (!bundle) return 0;
  return new Set([
    ...bundle.moods.map((item) => item.record_date),
    ...bundle.sleeps.map((item) => item.record_date),
    ...bundle.exercises.map((item) => item.record_date),
    ...bundle.nutritions.map((item) => item.record_date),
    ...bundle.focus.map((item) => item.record_date),
    ...bundle.faces.map((item) => item.record_date),
  ].filter((date) => date >= startDate && date <= endDate)).size;
}

type PendingFaceAnalysis = {
  image: string;
  imagePath?: string;
  result: FaceAnalysisResult;
  file: File;
  captureMode: "bare_face" | "makeup";
};

function faceModeMismatch(result: FaceAnalysisResult, captureMode: "bare_face" | "makeup") {
  if ((result.makeup_confidence ?? 0) < 0.65 || !result.makeup_level || result.makeup_level === "uncertain") return false;
  return captureMode === "bare_face" ? result.makeup_level !== "bare" : result.makeup_level === "bare";
}

function filePreview(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to preview face draft."));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to preview face draft."));
    reader.readAsDataURL(file);
  });
}

export default function RecordsScreen({
  user,
  deviceDate,
  onSaved,
  onGrowthActivity,
  onOpenAi,
  initialModule = null,
  initialView = null,
  onModuleChange,
  onViewChange,
}: {
  user: User;
  deviceDate: string;
  onSaved: () => void;
  onGrowthActivity?: (activity: GrowthActivityKind) => void | Promise<unknown>;
  onOpenAi?: (prompt: string) => void;
  initialModule?: RecordModule | null;
  initialView?: string | null;
  onModuleChange?: (module: RecordModule | null, view?: "editor" | null) => void;
  onViewChange?: (view: string | null, replace?: boolean) => void;
}) {
  const { locale, t } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordDate, setRecordDate] = useState(deviceDate);
  const [activeModule, setActiveModule] = useState<RecordModule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [todaySnapshot, setTodaySnapshot] = useState<TodaySnapshot | null>(null);
  const [trendBundle, setTrendBundle] = useState<TrendBundle | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reportMode, setReportMode] = useState<"modules" | "weekly">("modules");
  const [dnbReport, setDnbReport] = useState<DnbWeeklyReport | null>(null);
  const [weeklyAiReport, setWeeklyAiReport] = useState<HealthAiReport | null>(null);
  const [weeklyAiLoading, setWeeklyAiLoading] = useState(false);
  const [weeklyAiUnavailable, setWeeklyAiUnavailable] = useState(false);
  const [weeklyDetailSection, setWeeklyDetailSection] = useState<HealthReportSection | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [weeklyLongPressing, setWeeklyLongPressing] = useState(false);
  const [weeklyChartMode, setWeeklyChartMode] = useState<"trend" | "radar">("trend");
  const [hubAiReport, setHubAiReport] = useState<HealthAiReport | null>(null);
  const [hubAiLoading, setHubAiLoading] = useState(false);
  const [hubAiUnavailable, setHubAiUnavailable] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<string | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadedRecordKey, setLoadedRecordKey] = useState<string | null>(null);
  const forceWeeklyAiFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).get("qa") === "weekly-ai";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const weeklyLongPressTimerRef = useRef<number | null>(null);
  const weeklyLongPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const recordLoadRequestRef = useRef(0);

  const [moodScore, setMoodScore] = useState(70);
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [diary, setDiary] = useState("");

  const [sleepStart, setSleepStart] = useState("23:30");
  const [sleepEnd, setSleepEnd] = useState("07:10");
  const [sleepDuration, setSleepDuration] = useState(460);
  const [deepSleep, setDeepSleep] = useState(85);
  const [lightSleep, setLightSleep] = useState(280);
  const [remSleep, setRemSleep] = useState(95);
  const [sleepRating, setSleepRating] = useState(4);
  const [sleepNote, setSleepNote] = useState("");

  const [steps, setSteps] = useState(6500);
  const [calories, setCalories] = useState(420);
  const [exerciseMinutes, setExerciseMinutes] = useState(38);
  const [heartRate, setHeartRate] = useState("");
  const [spo2, setSpo2] = useState("");
  const [exerciseNote, setExerciseNote] = useState("");

  const [meal, setMeal] = useState<"breakfast" | "lunch" | "dinner" | "pantry">("lunch");
  const [mealName, setMealName] = useState("");
  const [mealCalories, setMealCalories] = useState(0);
  const [proteinGrams, setProteinGrams] = useState(0);
  const [carbohydrateGrams, setCarbohydrateGrams] = useState(0);
  const [fatGrams, setFatGrams] = useState(0);
  const [hydrationMl, setHydrationMl] = useState(0);
  const [dietRating, setDietRating] = useState(3);
  const [dietPhotoUrl, setDietPhotoUrl] = useState<string | null>(null);
  const [dietPhotoPath, setDietPhotoPath] = useState<string | null>(null);
  const [dietItems, setDietItems] = useState<FoodItem[]>([]);
  const [dietAnalyzing, setDietAnalyzing] = useState(false);

  const [focusTitle, setFocusTitle] = useState("");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [faceResult, setFaceResult] = useState<FaceAnalysisResult | null>(null);
  const [pendingFaceAnalysis, setPendingFaceAnalysis] = useState<PendingFaceAnalysis | null>(null);
  const [faceDraftFile, setFaceDraftFile] = useState<File | null>(null);
  const [faceAnalyzing, setFaceAnalyzing] = useState(false);
  const faceSettingsKey = `nava-face-capture-settings:${user.id}`;
  const [faceMode, setFaceMode] = useState<"bare_face" | "makeup">(() => {
    try { return JSON.parse(window.sessionStorage.getItem(faceSettingsKey) ?? "{}").mode === "makeup" ? "makeup" : "bare_face"; } catch { return "bare_face"; }
  });
  const [faceConsent, setFaceConsent] = useState(() => {
    try { return JSON.parse(window.sessionStorage.getItem(faceSettingsKey) ?? "{}").consent === true; } catch { return false; }
  });
  const dietQuickCameraInputRef = useRef<HTMLInputElement | null>(null);
  const facePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const faceLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const moodAutoSaveTimerRef = useRef<number | null>(null);
  const moodAutoSaveRequestRef = useRef(0);
  const moodAutoSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const healthModulePresentations = buildHealthModulePresentations(todaySnapshot, locale);
  const allHubModulesComplete = allHealthModulesComplete(healthModulePresentations);
  const hubAiEligible = allHubModulesComplete
    && recordedDateCount(trendBundle, shiftDateISO(recordDate, -6), recordDate) >= 5;

  useEffect(() => {
    setFocusTitle((current) => current === "产品原型" || current === "Product prototype" || current === "Prototype" ? "" : current);
  }, [locale]);

  useEffect(() => {
    window.sessionStorage.setItem(faceSettingsKey, JSON.stringify({ mode: faceMode, consent: faceConsent }));
  }, [faceConsent, faceMode, faceSettingsKey]);

  useEffect(() => {
    let active = true;
    if (activeModule !== "face" || !showEditor || !faceConsent || faceImage || faceResult) return () => { active = false; };
    void loadSecureFaceDraft(user.id, recordDate)
      .then(async (file) => {
        if (!active || !file) return;
        const preview = await filePreview(file);
        if (!active) return;
        setFaceDraftFile(file);
        setFaceImage(preview);
        setNotice(locale === "zh" ? "已安全恢复30分钟内未完成的拍摄，可继续分析。" : "Securely restored an unfinished capture from the last 30 minutes.");
      })
      .catch((draftError) => console.warn("Secure face draft recovery deferred", draftError));
    return () => { active = false; };
  }, [activeModule, faceConsent, faceImage, faceResult, locale, recordDate, showEditor, user.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadRecordData = useCallback(async () => {
    const requestId = ++recordLoadRequestRef.current;
    const recordKey = `${recordDate}:${activeModule ?? "hub"}:${activeModule === "diet" ? meal : ""}`;
    let loaded = false;
    setDataLoading(true);
    setDraftReady(false);
    setDataLoadError(null);
    try {
      const [snapshot, trends, loadedProfile] = await Promise.all([
        getTodaySnapshot(user.id, recordDate),
        getTrends(user.id, deviceDate),
        loadProfile(user.id).catch(() => null),
      ]);
      if (requestId !== recordLoadRequestRef.current) return;
      setTodaySnapshot(snapshot);
      setTrendBundle(trends);
      setProfile(loadedProfile);
      setMoodScore(snapshot.mood?.mood_score ?? 70);
      setSelectedFactors(snapshot.mood?.factors ?? []);
      setDiary(snapshot.mood?.diary_content ?? "");
      setSleepStart(snapshot.sleep?.sleep_start ?? "23:30");
      setSleepEnd(snapshot.sleep?.sleep_end ?? "07:10");
      setSleepDuration(snapshot.sleep?.sleep_duration_minutes ?? 460);
      setDeepSleep(snapshot.sleep?.deep_sleep_minutes ?? 85);
      setLightSleep(snapshot.sleep?.light_sleep_minutes ?? 280);
      setRemSleep(snapshot.sleep?.rem_minutes ?? 95);
      setSleepRating(snapshot.sleep?.self_rating ?? 4);
      setSteps(snapshot.exercise?.steps ?? 0);
      setCalories(snapshot.exercise?.calories ?? 0);
      setExerciseMinutes(snapshot.exercise?.exercise_minutes ?? 0);
      setHeartRate(snapshot.exercise?.heart_rate ?? "");
      setSpo2(snapshot.exercise?.spo2 ?? "");

      const nutrition = snapshot.nutrition;
      const mealItems = nutrition?.[`${meal}_items` as keyof typeof nutrition];
      const loadedItems = Array.isArray(mealItems) ? mealItems as FoodItem[] : [];
      const photoField = meal === "pantry" ? null : `${meal}_photo_url` as keyof NonNullable<typeof nutrition>;
      const photoPath = photoField && nutrition ? nutrition[photoField] : null;
      const selectedMealCalories = loadedItems.reduce((sum, item) => sum + (Number(item.calories) || 0), 0);
      setDietItems(loadedItems);
      setMealName(loadedItems.map((item) => item.name).filter(Boolean).join("、"));
      setMealCalories(selectedMealCalories || (nutrition?.total_calories ?? 0));
      setProteinGrams(nutrition?.protein_grams ?? 0);
      setCarbohydrateGrams(nutrition?.carbohydrate_grams ?? 0);
      setFatGrams(nutrition?.fat_grams ?? 0);
      setHydrationMl(nutrition?.hydration_ml ?? 0);
      setDietRating(nutrition?.health_rating ?? 3);
      setDietPhotoPath(typeof photoPath === "string" ? photoPath : null);
      const resolvedDietPhotoUrl = typeof photoPath === "string" ? await resolveDietPhotoUrl(photoPath).catch(() => null) : null;
      if (requestId !== recordLoadRequestRef.current) return;
      setDietPhotoUrl(resolvedDietPhotoUrl);
      const draftModule = activeModule === "diet" ? "nutrition" : activeModule;
      const draft = draftModule ? await loadRecordDraft(user.id, draftModule, recordDate) : null;
      if (requestId !== recordLoadRequestRef.current) return;
      if (draft && activeModule === "mood") {
        if (typeof draft.moodScore === "number") setMoodScore(draft.moodScore);
        if (Array.isArray(draft.selectedFactors)) setSelectedFactors(draft.selectedFactors.filter((item): item is string => typeof item === "string"));
        if (typeof draft.diary === "string") setDiary(draft.diary);
      }
      if (draft && activeModule === "sleep") {
        if (typeof draft.start === "string") setSleepStart(draft.start);
        if (typeof draft.end === "string") setSleepEnd(draft.end);
        if (typeof draft.rating === "number") setSleepRating(draft.rating);
        if (typeof draft.note === "string") setSleepNote(draft.note);
      }
      if (draft && activeModule === "exercise") {
        if (typeof draft.steps === "number") setSteps(draft.steps);
        if (typeof draft.calories === "number") setCalories(draft.calories);
        if (typeof draft.minutes === "number") setExerciseMinutes(draft.minutes);
        if (typeof draft.note === "string") setExerciseNote(draft.note);
      }
      if (draft && activeModule === "diet") {
        const draftItems = Array.isArray(draft.items) ? draft.items as FoodItem[] : [];
        const normalizedDraftName = typeof draft.name === "string" ? draft.name.trim().toLowerCase() : "";
        const hasLegacyPlaceholder = normalizedDraftName === "待确认餐食"
          || (normalizedDraftName === "鸡胸肉沙拉" && draft.calories === 520 && draftItems.length === 0)
          || draftItems.some((item) => item.name?.trim() === "待确认餐食");
        // A saved nutrition record is the source of truth for its date. Old
        // placeholder drafts must never replace real Supabase data when the
        // user moves between historical dates.
        const canRestoreDraftValues = !nutrition && !hasLegacyPlaceholder;
        if (canRestoreDraftValues) {
          if (typeof draft.meal === "string" && ["breakfast", "lunch", "dinner", "pantry"].includes(draft.meal)) setMeal(draft.meal as typeof meal);
          if (typeof draft.name === "string") setMealName(draft.name);
          if (typeof draft.calories === "number") setMealCalories(draft.calories);
          if (Array.isArray(draft.items)) setDietItems(draftItems);
          if (typeof draft.proteinGrams === "number") setProteinGrams(draft.proteinGrams);
          if (typeof draft.carbohydrateGrams === "number") setCarbohydrateGrams(draft.carbohydrateGrams);
          if (typeof draft.fatGrams === "number") setFatGrams(draft.fatGrams);
          if (typeof draft.hydrationMl === "number") setHydrationMl(draft.hydrationMl);
          if (typeof draft.rating === "number") setDietRating(draft.rating);
        }
        if (!nutrition && typeof draft.photoPath === "string") {
          setDietPhotoPath(draft.photoPath);
          const draftPhotoUrl = await resolveDietPhotoUrl(draft.photoPath).catch(() => null);
          if (requestId !== recordLoadRequestRef.current) return;
          setDietPhotoUrl(draftPhotoUrl);
        }
      }
      if (draft && activeModule === "focus") {
        if (typeof draft.title === "string") setFocusTitle(draft.title);
        if (typeof draft.minutes === "number") setFocusMinutes(draft.minutes);
      }
      loaded = true;
      setLoadedRecordKey(recordKey);
      return snapshot;
    } catch (loadError) {
      if (requestId !== recordLoadRequestRef.current) return;
      console.warn("Failed to load record dashboard data", loadError);
      setTodaySnapshot(null);
      setTrendBundle(null);
      setDataLoadError(locale === "zh"
        ? "健康数据加载失败。为避免显示默认值，当前结果已隐藏，请点击重试。"
        : "Health data could not be loaded. Results are hidden to avoid showing defaults; tap to retry.");
      return null;
    } finally {
      // Draft autosave must never write the form's input suggestions after a
      // failed Supabase read. Only a successful load may arm draft syncing.
      if (requestId === recordLoadRequestRef.current) {
        setDraftReady(loaded);
        setDataLoading(false);
      }
    }
  }, [activeModule, deviceDate, locale, meal, recordDate, user.id]);

  useEffect(() => {
    void loadRecordData();
    return () => {
      recordLoadRequestRef.current += 1;
    };
  }, [loadRecordData]);

  useEffect(() => {
    setRecordDate(deviceDate);
  }, [deviceDate]);

  useEffect(() => {
    const refreshVisibleRecords = () => {
      if (document.visibilityState === "visible") void loadRecordData();
    };
    window.addEventListener("focus", refreshVisibleRecords);
    document.addEventListener("visibilitychange", refreshVisibleRecords);
    return () => {
      window.removeEventListener("focus", refreshVisibleRecords);
      document.removeEventListener("visibilitychange", refreshVisibleRecords);
    };
  }, [loadRecordData]);

  useEffect(() => {
    if (!draftReady || !activeModule || activeModule === "face" || (!showEditor && activeModule !== "mood" && activeModule !== "focus")) return;
    const module: RecordDraftModule = activeModule === "diet" ? "nutrition" : activeModule;
    const payload: Record<string, unknown> = activeModule === "mood"
      ? { moodScore, selectedFactors, diary }
      : activeModule === "sleep"
        ? { start: sleepStart, end: sleepEnd, duration: sleepDuration, deep: deepSleep, light: lightSleep, rem: remSleep, rating: sleepRating, note: sleepNote }
        : activeModule === "exercise"
          ? { steps, calories, minutes: exerciseMinutes, heartRate, spo2, note: exerciseNote }
          : activeModule === "diet"
            ? { meal, name: mealName, calories: mealCalories, items: dietItems, photoPath: dietPhotoPath, proteinGrams, carbohydrateGrams, fatGrams, hydrationMl, rating: dietRating }
            : { title: focusTitle, minutes: focusMinutes };
    const timer = window.setTimeout(() => {
      void saveRecordDraft(user.id, module, recordDate, payload).catch((draftError) => console.warn("Record draft sync deferred", draftError));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeModule, calories, carbohydrateGrams, deepSleep, diary, dietItems, dietPhotoPath, dietRating, draftReady, exerciseMinutes, exerciseNote, fatGrams, focusMinutes, focusTitle, heartRate, hydrationMl, lightSleep, meal, mealCalories, mealName, moodScore, proteinGrams, recordDate, remSleep, selectedFactors, showEditor, sleepDuration, sleepEnd, sleepNote, sleepRating, sleepStart, spo2, steps, user.id]);

  useEffect(() => {
    const estimated = estimateMinutes(sleepStart, sleepEnd);
    if (estimated > 0) setSleepDuration(estimated);
  }, [sleepStart, sleepEnd]);

  useEffect(() => {
    rootRef.current?.closest(".app-content")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeModule]);

  useEffect(() => {
    setActiveModule(initialModule);
  }, [initialModule]);

  useEffect(() => {
    setShowEditor(initialView === "editor");
  }, [initialView]);

  useEffect(() => {
    if (activeModule !== "mood") return;
    const today = todayISO();
    if (recordDate !== today) setRecordDate(today);
  }, [activeModule, recordDate]);

  useEffect(() => () => {
    if (moodAutoSaveTimerRef.current !== null) window.clearTimeout(moodAutoSaveTimerRef.current);
  }, []);

  useEffect(() => {
    if (reportMode !== "weekly") return;
    let active = true;
    setDnbReport(null);
    const reference = new Date(`${deviceDate}T12:00:00`);
    reference.setDate(reference.getDate() - weekOffset * 7);
    void loadDnbWeeklyReport(reference, locale)
      .then((report) => {
        if (active) setDnbReport(report);
      })
      .finally(() => undefined);
    return () => {
      active = false;
    };
  }, [deviceDate, locale, reportMode, user.id, weekOffset]);

  useEffect(() => {
    let active = true;
    if (!hubAiEligible) {
      setHubAiReport(null);
      setHubAiLoading(false);
      setHubAiUnavailable(false);
      return () => { active = false; };
    }
    setHubAiLoading(true);
    setHubAiUnavailable(false);
    void loadHealthAiReport({ scope: "weekly", endDate: recordDate, locale })
      .then((report) => {
        if (active) setHubAiReport(report);
      })
      .catch((reportError) => {
        console.warn("Health report overview AI generation deferred", reportError);
        if (active) setHubAiUnavailable(true);
      })
      .finally(() => {
        if (active) setHubAiLoading(false);
      });
    return () => { active = false; };
  }, [hubAiEligible, locale, recordDate, user.id]);

  useEffect(() => {
    if (reportMode !== "weekly") return;
    const reference = new Date(`${deviceDate}T12:00:00`);
    reference.setDate(reference.getDate() - weekOffset * 7);
    const period = currentSevenDayPeriod(reference);
    const availableEndDate = period.endDate > deviceDate ? deviceDate : period.endDate;
    let active = true;
    setWeeklyAiReport(null);
    setWeeklyDetailSection(null);
    if (!forceWeeklyAiFixture && recordedDateCount(trendBundle, period.startDate, availableEndDate) < 5) {
      setWeeklyAiLoading(false);
      setWeeklyAiUnavailable(false);
      return () => { active = false; };
    }
    setWeeklyAiLoading(true);
    setWeeklyAiUnavailable(false);
    void loadHealthAiReport({ scope: "weekly", endDate: availableEndDate, locale })
      .then((report) => {
        if (active) setWeeklyAiReport(report);
      })
      .catch((reportError) => {
        console.warn("Weekly AI report generation deferred", reportError);
        if (active) setWeeklyAiUnavailable(true);
      })
      .finally(() => {
        if (active) setWeeklyAiLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deviceDate, forceWeeklyAiFixture, locale, reportMode, trendBundle, user.id, weekOffset]);

  const clearWeeklyLongPress = useCallback(() => {
    if (weeklyLongPressTimerRef.current !== null) {
      window.clearTimeout(weeklyLongPressTimerRef.current);
      weeklyLongPressTimerRef.current = null;
    }
    weeklyLongPressOriginRef.current = null;
    setWeeklyLongPressing(false);
  }, []);

  useEffect(() => clearWeeklyLongPress, [clearWeeklyLongPress]);

  const shareWeeklyReport = useCallback(async () => {
    if (!dnbReport || dnbReport.status !== "ready") return;
    const reference = new Date(`${deviceDate}T12:00:00`);
    reference.setDate(reference.getDate() - weekOffset * 7);
    const period = currentSevenDayPeriod(reference);
    try {
      await shareDnbWeeklyPoster(dnbReport, locale, `${period.startDate}-${period.endDate}`);
      await trackAnalyticsEvent(user.id, "weekly_report_shared", { weekOffset });
      await onGrowthActivity?.("share");
    } catch (shareError) {
      if ((shareError as DOMException)?.name === "AbortError") return;
      setError(shareError instanceof Error ? shareError.message : String(shareError));
    }
  }, [deviceDate, dnbReport, locale, onGrowthActivity, user.id, weekOffset]);

  const beginWeeklyLongPress = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dnbReport || dnbReport.status !== "ready") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea, [role='button']")) return;
    clearWeeklyLongPress();
    weeklyLongPressOriginRef.current = { x: event.clientX, y: event.clientY };
    setWeeklyLongPressing(true);
    weeklyLongPressTimerRef.current = window.setTimeout(() => {
      weeklyLongPressTimerRef.current = null;
      weeklyLongPressOriginRef.current = null;
      setWeeklyLongPressing(false);
      navigator.vibrate?.(16);
      void shareWeeklyReport();
    }, 680);
  }, [clearWeeklyLongPress, dnbReport, shareWeeklyReport]);

  const moveWeeklyLongPress = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = weeklyLongPressOriginRef.current;
    if (!origin) return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) clearWeeklyLongPress();
  }, [clearWeeklyLongPress]);

  function estimateMinutes(start: string, end: string) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    return endMin - startMin;
  }

  async function run(labelKey: TranslationKey, fn: () => Promise<unknown>) {
    setBusy(labelKey);
    setNotice(null);
    setError(null);
    try {
      await fn();
      // Claim the once-daily completion reward as soon as the record itself is
      // durable; slower score/report refreshes can continue underneath it.
      onSaved();
      try {
        const savedPeriod = currentSevenDayPeriod(new Date(`${recordDate}T12:00:00`));
        await Promise.allSettled([
          refreshRhythmScore(recordDate).then(() => loadHealthAiReport({ scope: "weekly", endDate: savedPeriod.endDate > recordDate ? recordDate : savedPeriod.endDate, locale, refresh: true })),
          refreshFdnbHealth(recordDate),
          activeModule && activeModule !== "diet"
            ? loadHealthAiReport({ scope: activeModule, endDate: recordDate, locale, refresh: true })
            : Promise.resolve(),
          trackAnalyticsEvent(user.id, "record_saved", { module: labelKey, date: recordDate }),
        ]);
        setNotice(t("records.saved", { label: t(labelKey) }));
      } catch (refreshError) {
        console.warn("Failed to refresh rhythm score after saving record", refreshError);
        setNotice(t("records.savedPending", { label: t(labelKey) }));
      }
      const refreshedSnapshot = await loadRecordData();
      if (activeModule) {
        const module: RecordDraftModule = activeModule === "diet" ? "nutrition" : activeModule;
        await clearRecordDraft(user.id, module, recordDate).catch((draftError) => console.warn("Record draft cleanup deferred", draftError));
        const wasEditor = showEditor || initialView === "editor";
        const completed = refreshedSnapshot
          ? buildHealthModulePresentations(refreshedSnapshot, locale)[activeModule].completed
          : false;
        setShowEditor(!completed);
        if (wasEditor && completed) onViewChange?.(null, true);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function toggleFactor(factor: string) {
    const nextFactors = selectedFactors.includes(factor)
      ? selectedFactors.filter((item) => item !== factor)
      : [...selectedFactors, factor];
    setSelectedFactors(nextFactors);
    queueMoodAutoSave(moodScore, nextFactors, diary);
  }

  function setPrimaryFactor(factor: string) {
    const nextFactors = factor ? [factor] : [];
    setSelectedFactors(nextFactors);
    queueMoodAutoSave(moodScore, nextFactors, diary);
  }

  function updateMoodDiary(value: string) {
    setDiary(value);
    queueMoodAutoSave(moodScore, selectedFactors, value);
  }

  function queueMoodAutoSave(nextScore: number, factorsForSave: string[], diaryForSave: string, immediate = false) {
    const today = todayISO();
    if (recordDate !== today || factorsForSave.length === 0 || !diaryForSave.trim()) return;

    const persist = () => {
      const request = ++moodAutoSaveRequestRef.current;
      const operation = moodAutoSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const savedMood = await saveMoodRecord({
              userId: user.id,
              date: today,
              moodScore: nextScore,
              factors: factorsForSave,
              diary: diaryForSave,
            });
            if (request !== moodAutoSaveRequestRef.current) return;
            setTodaySnapshot((current) => current && current.date === today ? { ...current, mood: savedMood } : current);
            setTrendBundle((current) => {
              if (!current) return current;
              const moods = current.moods.filter((item) => item.record_date !== today);
              return { ...current, moods: [...moods, savedMood].sort((a, b) => a.record_date.localeCompare(b.record_date)) };
            });
          } catch (saveError) {
            console.warn("Mood score auto-save deferred", saveError);
          }
        });
      moodAutoSaveQueueRef.current = operation;
      return operation;
    };

    if (moodAutoSaveTimerRef.current !== null) window.clearTimeout(moodAutoSaveTimerRef.current);
    if (immediate) {
      moodAutoSaveTimerRef.current = null;
      void persist();
      return;
    }
    moodAutoSaveTimerRef.current = window.setTimeout(() => {
      moodAutoSaveTimerRef.current = null;
      void persist();
    }, 420);
  }

  function updateMoodScore(value: number, immediate = false) {
    const nextScore = Math.min(100, Math.max(0, Math.round(value)));
    const today = todayISO();
    const rolledToNewDay = recordDate !== today;
    setMoodScore(nextScore);
    if (rolledToNewDay) {
      setRecordDate(today);
      setSelectedFactors([]);
      setDiary("");
      return;
    }
    queueMoodAutoSave(nextScore, selectedFactors, diary, immediate);
  }

  async function saveMood(event: FormEvent) {
    event.preventDefault();
    const today = todayISO();
    if (recordDate !== today) {
      setRecordDate(today);
      setSelectedFactors([]);
      setDiary("");
      setError(locale === "zh" ? "已经进入新的一天，请重新选择原因并写下今天的情绪。" : "A new day has started. Choose a cause and write today's mood again.");
      return false;
    }
    if (selectedFactors.length === 0) {
      setError(locale === "zh" ? "请选择今天情绪的主要原因。" : "Choose the main cause of today's mood.");
      return false;
    }
    if (!diary.trim()) {
      setError(locale === "zh" ? "请写下今天的情绪后再保存。" : "Write today's mood before saving.");
      return false;
    }
    if (moodAutoSaveTimerRef.current !== null) {
      window.clearTimeout(moodAutoSaveTimerRef.current);
      moodAutoSaveTimerRef.current = null;
    }
    await moodAutoSaveQueueRef.current.catch(() => undefined);
    moodAutoSaveRequestRef.current += 1;
    return run("records.mood", () =>
      saveMoodRecord({
        userId: user.id,
        date: today,
        moodScore,
        factors: selectedFactors,
        diary,
      }),
    );
  }

  async function saveSleep(event: FormEvent) {
    event.preventDefault();
    await run("records.sleep", () =>
      saveSleepRecord({
        userId: user.id,
        date: recordDate,
        start: sleepStart,
        end: sleepEnd,
        durationMinutes: sleepDuration,
        deepMinutes: deepSleep,
        lightMinutes: lightSleep,
        remMinutes: remSleep,
        rating: sleepRating,
        note: sleepNote,
      }),
    );
  }

  async function saveExercise(event: FormEvent) {
    event.preventDefault();
    await run("records.exercise", () =>
      saveExerciseRecord({
        userId: user.id,
        date: recordDate,
        steps,
        calories,
        minutes: exerciseMinutes,
        heartRate,
        spo2,
        note: exerciseNote,
        source: "manual",
      }),
    );
  }

  async function saveDiet(event: FormEvent) {
    event.preventDefault();
    await run("records.diet", async () => {
      await saveNutritionRecord({
        userId: user.id,
        date: recordDate,
        meal,
        item: {
          name: mealName,
          calories: mealCalories,
          amount: "1 份",
        },
        totalCalories: mealCalories,
        proteinGrams,
        carbohydrateGrams,
        fatGrams,
        hydrationMl,
        healthRating: dietRating,
        photoUrl: dietPhotoPath ?? dietPhotoUrl ?? undefined,
      });
      try {
        await loadDietAiReport({ date: recordDate, locale, refresh: true });
        const savedPeriod = currentSevenDayPeriod(new Date(`${recordDate}T12:00:00`));
        await loadHealthAiReport({ scope: "weekly", endDate: savedPeriod.endDate > recordDate ? recordDate : savedPeriod.endDate, locale, refresh: true });
      } catch (reportError) {
        // The meal is already durable. A transient model failure must not
        // discard it; opening the report retries the authenticated AI call.
        console.warn("AI diet report refresh deferred", reportError);
      }
    });
  }

  async function handleDietPhoto(file: File | null) {
    if (!file) return;
    setDietAnalyzing(true);
    setNotice(null);
    setError(null);
    try {
      const result = await analyzeDietPhoto({ userId: user.id, date: recordDate, meal, file });
      setDietPhotoUrl(result.imageUrl);
      setDietPhotoPath(result.imagePath ?? null);
      setDietItems(result.items);
      if (result.items.length > 0) {
        setMealName(result.items.map((item) => item.name).join("、"));
        setMealCalories(result.totals?.calories ?? result.items.reduce((sum, item) => sum + (Number(item.calories) || 0), 0));
        setProteinGrams(result.totals?.proteinGrams ?? 0);
        setCarbohydrateGrams(result.totals?.carbohydrateGrams ?? 0);
        setFatGrams(result.totals?.fatGrams ?? 0);
        setNotice(locale === "zh"
          ? `图片已上传，AI 已识别 ${result.items.length} 项餐食`
          : `Uploaded · AI identified ${result.items.length} item${result.items.length === 1 ? "" : "s"}`);
      } else {
        setNotice(result.analysisAvailable === false
          ? (locale === "zh"
            ? "图片已上传；视觉识别服务尚未配置，请手动填写食物和热量"
            : "Uploaded · vision recognition is not configured; please enter the meal manually")
          : (locale === "zh"
            ? "图片已上传；AI 未能可靠确认餐食，请手动填写"
            : "Uploaded · AI could not identify the meal reliably; please enter it manually"));
      }
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          const root = rootRef.current;
          const scroller = root?.closest<HTMLElement>(".app-content");
          if (!scroller) return;
          scroller.scrollTo({
            top: Math.max(scroller.scrollTop, 220),
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          });
        }, 80);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDietAnalyzing(false);
    }
  }

  async function persistFaceAnalysis(analysis: PendingFaceAnalysis) {
    const { imagePath, result, captureMode } = analysis;
    const saved = await saveFaceAnalysisRecord({
      userId: user.id,
      date: recordDate,
      result,
      imagePath,
      modelVersion: result.modelVersion ?? result.model_version,
      captureMode,
    });
    await Promise.allSettled([
      refreshRhythmScore(recordDate).then(() => {
        const savedPeriod = currentSevenDayPeriod(new Date(`${recordDate}T12:00:00`));
        return loadHealthAiReport({ scope: "weekly", endDate: savedPeriod.endDate > recordDate ? recordDate : savedPeriod.endDate, locale, refresh: true });
      }),
      refreshFdnbHealth(recordDate),
      loadHealthAiReport({ scope: "face", endDate: recordDate, locale, refresh: true }),
    ]);
    setPendingFaceAnalysis(null);
    setNotice("persisted" in saved && !saved.persisted ? t("records.faceAnalyzed") : t("records.faceSaved"));
    if (!("persisted" in saved) || saved.persisted) {
      await clearSecureFaceDraft(user.id, recordDate).catch((draftError) => console.warn("Secure face draft cleanup deferred", draftError));
      setFaceDraftFile(null);
      await loadRecordData();
      onSaved();
      setShowEditor(false);
      onViewChange?.(null, true);
    }
  }

  async function handleFacePhoto(file: File | null, requestedMode: "bare_face" | "makeup" = faceMode) {
    if (!file) return;
    setFaceAnalyzing(true);
    setNotice(null);
    setError(null);
    try {
      if (!faceConsent) throw new Error(locale === "zh" ? "请先确认面部照片隐私说明。" : "Please confirm the face-photo privacy notice first.");
      await saveSecureFaceDraft(user.id, recordDate, file).catch((draftError) => console.warn("Secure face draft save deferred", draftError));
      setFaceDraftFile(file);
      const { image, imagePath, result } = await analyzeFacePhoto({ userId: user.id, date: recordDate, file, captureMode: requestedMode, locale });
      setFaceImage(image);
      setFaceResult(result);
      const analysis = { image, imagePath, result, file, captureMode: requestedMode } satisfies PendingFaceAnalysis;
      if (faceModeMismatch(result, requestedMode)) {
        setPendingFaceAnalysis(analysis);
        setNotice(locale === "zh" ? "AI 检测到拍摄模式可能不匹配，请确认后再保存。" : "AI detected a possible capture-mode mismatch. Confirm before saving.");
      } else {
        await persistFaceAnalysis(analysis);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFaceAnalyzing(false);
    }
  }

  async function continuePendingFaceAnalysis() {
    if (!pendingFaceAnalysis || faceAnalyzing) return;
    setFaceAnalyzing(true);
    setError(null);
    try {
      await persistFaceAnalysis(pendingFaceAnalysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFaceAnalyzing(false);
    }
  }

  async function switchPendingFaceMode() {
    if (!pendingFaceAnalysis || faceAnalyzing) return;
    const nextMode = pendingFaceAnalysis.captureMode === "bare_face" ? "makeup" : "bare_face";
    const file = pendingFaceAnalysis.file;
    setFaceMode(nextMode);
    setPendingFaceAnalysis(null);
    await handleFacePhoto(file, nextMode);
  }

  async function saveFocus(event: FormEvent) {
    event.preventDefault();
    await run("records.focus", () =>
      saveFocusSession({
        userId: user.id,
        date: recordDate,
        taskTitle: focusTitle,
        minutes: focusMinutes,
      }),
    );
  }

  async function saveFocusMinutes(minutes: number, details?: { interruptions?: number; startedAt?: string; endedAt?: string; category?: string }) {
    await run("records.focus", () =>
      saveFocusSession({
        userId: user.id,
        date: recordDate,
        taskTitle: focusTitle,
        minutes,
        interruptions: details?.interruptions,
        startedAt: details?.startedAt,
        endedAt: details?.endedAt,
        category: details?.category,
      }),
    );
  }

  const currentRecordKey = `${recordDate}:${activeModule ?? "hub"}:${activeModule === "diet" ? meal : ""}`;
  if (dataLoading && loadedRecordKey !== currentRecordKey) {
    return <PageSkeleton variant={activeModule ? "record-detail" : "records"} />;
  }

  if (!activeModule) {
    const dnbReference = new Date(`${deviceDate}T12:00:00`);
    dnbReference.setDate(dnbReference.getDate() - weekOffset * 7);
    const dnbPeriod = currentSevenDayPeriod(dnbReference);
    const availablePeriodEnd = dnbPeriod.endDate > deviceDate ? deviceDate : dnbPeriod.endDate;
    const weeklyRecordedDays = forceWeeklyAiFixture ? 7 : recordedDateCount(trendBundle, dnbPeriod.startDate, availablePeriodEnd);
    const inSelectedWeek = (date: string) => date >= dnbPeriod.startDate && date <= dnbPeriod.endDate;
    const rhythmsByDate = new Map((trendBundle?.rhythms ?? [])
      .filter((item) => inSelectedWeek(item.record_date))
      .map((item) => [item.record_date, item]));
    const rhythmPoints = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDateISO(dnbPeriod.startDate, index);
      const item = rhythmsByDate.get(date);
      return {
        id: item?.id ?? `missing-rhythm-${date}`,
        label: new Date(`${date}T00:00:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" }),
        value: item?.score ?? 0,
        lower: item?.score_lower,
        upper: item?.score_upper,
        missing: !item,
      };
    });
    const reportPoints = rhythmPoints;
    const recordedReportPointCount = reportPoints.filter((point) => !point.missing).length;
    const latestReportPoint = [...reportPoints].reverse().find((point) => !point.missing);
    const previousPeriodStart = shiftDateISO(dnbPeriod.startDate, -7);
    const previousPeriodEnd = shiftDateISO(dnbPeriod.endDate, -7);
    const periodComparison = compareRecordedPeriodAverages(
      reportPoints.filter((point) => !point.missing).map((point) => point.value),
      (trendBundle?.rhythms ?? [])
      .filter((item) => item.record_date >= previousPeriodStart && item.record_date <= previousPeriodEnd)
      .map((item) => item.score),
    );
    const overallScore = dnbReport?.status === "ready"
      ? Math.round(dnbReport.stabilityScore ?? dnbReport.score ?? periodComparison.currentAverage ?? latestReportPoint?.value ?? 0)
      : periodComparison.currentAverage;
    const completedModules = [
      (trendBundle?.moods ?? []).some((item) => inSelectedWeek(item.record_date)),
      (trendBundle?.sleeps ?? []).some((item) => inSelectedWeek(item.record_date)),
      (trendBundle?.exercises ?? []).some((item) => inSelectedWeek(item.record_date)),
      (trendBundle?.nutritions ?? []).some((item) => inSelectedWeek(item.record_date)),
      (trendBundle?.focus ?? []).some((item) => inSelectedWeek(item.record_date)),
      (trendBundle?.faces ?? []).some((item) => inSelectedWeek(item.record_date)),
    ].filter(Boolean).length;
    const radarLabels: Record<WeeklyModuleKey, string> = locale === "zh"
      ? { sleep: "睡眠", exercise: "运动", nutrition: "饮食", focus: "专注", face: "面部", mood: "情绪" }
      : { sleep: "Sleep", exercise: "Activity", nutrition: "Diet", focus: "Focus", face: "Face", mood: "Mood" };
    const weeklyRadarPoints = calculateWeeklyModuleScores(trendBundle, dnbPeriod.startDate, dnbPeriod.endDate)
      .map((point) => ({ ...point, label: radarLabels[point.key] }));
    const weeklyInsights = weeklyAiReport?.bullets ?? [];
    const weeklySections = weeklyAiReport?.sections ?? [];
    const hubAssociation = hubAiReport?.sections.find((section) => section.id === "association") ?? null;
    const hubHasSignificantPattern = Boolean(hubAssociation
      && hubAssociation.confidence !== "low"
      && !/(记录不足|无法判断|insufficient|cannot determine)/i.test(`${hubAssociation.headline} ${hubAssociation.explanation}`));
    return (
      <div className="record-hub" ref={rootRef}>
        <div className="health-report-tabs" role="tablist" aria-label={locale === "zh" ? "健康报告视图" : "Health report view"}>
          <button type="button" role="tab" aria-selected={reportMode === "modules"} onClick={() => setReportMode("modules")}>{locale === "zh" ? "分项报告" : "Modules"}</button>
          <button type="button" role="tab" aria-selected={reportMode === "weekly"} onClick={() => { setReportMode("weekly"); void trackAnalyticsEvent(user.id, "weekly_report_opened", { weekOffset }); }}>{locale === "zh" ? "本周报告" : "Weekly"}</button>
        </div>

        {reportMode === "modules" ? <>
          <label className="record-hub-date">
            <input
              aria-label={t("records.date")}
              type="date"
              value={recordDate}
              max={deviceDate}
              onChange={(event) => setRecordDate(event.target.value)}
            />
          </label>

          {dataLoadError && (
            <section className="record-hub-load-error" role="alert">
              <span>{dataLoadError}</span>
              <button type="button" onClick={() => void loadRecordData()}>{locale === "zh" ? "重新加载" : "Retry"}</button>
            </section>
          )}

          {hubAiEligible && hubAiLoading && (
            <section className="record-hub-ai-summary is-loading" aria-busy="true">
              <SkeletonBlock className="is-circle" />
              <SkeletonLines count={2} compact />
            </section>
          )}

          {hubAiEligible && hubHasSignificantPattern && (
            <section className="record-hub-ai-summary" aria-live="polite" data-provider={hubAiReport?.provider ?? undefined}>
              <span aria-hidden="true"><Bot size={17} /></span>
              <div>
                <strong>{hubAiReport?.provider === "demo"
                  ? (locale === "zh" ? "演示节律总提示" : "Demo rhythm overview")
                  : (locale === "zh" ? "AI 节律总提示" : "AI rhythm overview")}</strong>
                <p>{hubAssociation?.headline}</p>
                {hubAiUnavailable && <small>{locale === "zh" ? "稍后重试，不影响查看分项报告。" : "Retry later; module reports remain available."}</small>}
              </div>
            </section>
          )}

          <div className="record-module-grid">
            {recordModules.map(({ id, labelKey, icon: Icon }) => {
              const presentation = healthModulePresentations[id];
              const progressLabel = healthModuleProgressLabel(presentation, locale, recordDate === deviceDate ? "today" : "selected-date");
              const accessibleLabel = `${t(labelKey)}${locale === "zh" ? "，" : ". "}${progressLabel}`;
              return (
              <button
                className={["record-module-entry", dataLoadError ? "is-error" : presentation.completed ? "is-complete" : presentation.recorded ? "is-partial" : "is-missing"].join(" ")}
                data-record-module={id}
                data-record-state={dataLoadError ? "error" : presentation.completed ? "complete" : presentation.recorded ? "partial" : "missing"}
                data-module-progress={presentation.progress}
                key={id}
                type="button"
                aria-label={accessibleLabel}
                onClick={() => {
                  if (dataLoadError) {
                    void loadRecordData();
                    return;
                  }
                  setNotice(null);
                  setError(null);
                  const openEntry = healthModuleEntryView(presentation) === "editor";
                  setShowEditor(openEntry);
                  setActiveModule(id);
                  onModuleChange?.(id, openEntry ? "editor" : null);
                }}
              >
                <span className="record-module-header">
                  <strong>{t(labelKey)}</strong>
                  <span className="record-module-icon" aria-hidden="true">
                    <ModuleProgressRing progress={presentation.progress} />
                    <Icon size={25} strokeWidth={1.9} />
                  </span>
                </span>
                <span className="record-module-points" aria-hidden="true">
                  {(dataLoadError
                    ? (locale === "zh" ? ["加载失败", "点击重试", "未展示默认数值", "不会把缺失当作零"] : ["Load failed", "Tap to retry", "Defaults are hidden", "Missing is not zero"])
                    : presentation.points).map((point) => <span key={point}>{point}</span>)}
                </span>
                <ChevronRight className="record-module-arrow" size={20} aria-hidden="true" />
              </button>
              );
            })}
          </div>
        </> : (
          <div
            className="weekly-health-report"
            data-weekly-health-report
            data-long-pressing={weeklyLongPressing || undefined}
            onPointerDown={beginWeeklyLongPress}
            onPointerMove={moveWeeklyLongPress}
            onPointerUp={clearWeeklyLongPress}
            onPointerCancel={clearWeeklyLongPress}
            onPointerLeave={clearWeeklyLongPress}
            onContextMenu={(event) => event.preventDefault()}
          >
            <div className="weekly-period-controls">
              <button type="button" onClick={() => setWeekOffset((value) => value + 1)} aria-label={locale === "zh" ? "上一周" : "Previous week"}><ChevronLeft size={18} /></button>
              <strong>{dnbPeriod.startDate} — {dnbPeriod.endDate}</strong>
              <button type="button" disabled={weekOffset === 0} onClick={() => setWeekOffset((value) => Math.max(0, value - 1))} aria-label={locale === "zh" ? "下一周" : "Next week"}><ChevronRight size={18} /></button>
            </div>
            <section className="weekly-score-card">
              <div><span>{dnbReport?.status === "ready" ? (locale === "zh" ? "DNB 稳定度：" : "DNB stability: ") : (locale === "zh" ? "有记录日节律均值：" : "Recorded-day rhythm avg: ")}</span><strong>{dnbReport === null ? <SkeletonBlock className="weekly-score-skeleton" /> : overallScore == null ? "--" : <AnimatedNumber value={overallScore} />}</strong></div>
              <div><span>{locale === "zh" ? "数据完整度：" : "Complete: "}</span><strong><AnimatedNumber value={completedModules} duration={520} />/6</strong></div>
              <div><span>{locale === "zh" ? "较上周：" : "Previous week: "}</span><strong>{periodComparison.change == null ? (periodComparison.currentAverage == null ? "--" : (locale === "zh" ? "首次记录" : "First week")) : <>{periodComparison.change >= 0 ? "+" : ""}<AnimatedNumber value={periodComparison.change} duration={640} /></>}</strong></div>
            </section>
            <section className={["weekly-trend-card", recordedReportPointCount < 2 && weeklyChartMode === "trend" ? "is-sparse" : ""].filter(Boolean).join(" ")}>
              <header>
                <strong>{weeklyChartMode === "trend" ? (locale === "zh" ? "节律轨迹" : "Rhythm trajectory") : (locale === "zh" ? "六维节律雷达图" : "Weekly rhythm radar")}</strong>
                <button
                  className="weekly-chart-switch"
                  type="button"
                  aria-label={weeklyChartMode === "trend" ? (locale === "zh" ? "切换到六维雷达图" : "Switch to the six-dimension radar chart") : (locale === "zh" ? "切换到节律曲线图" : "Switch to the rhythm line chart")}
                  aria-pressed={weeklyChartMode === "radar"}
                  onClick={() => setWeeklyChartMode((mode) => mode === "trend" ? "radar" : "trend")}
                >
                  <svg viewBox="0 0 30 22" aria-hidden="true">
                    <path d="M27 6H3M3 6l5-4.5" />
                    <path d="M3 16h24M27 16l-5 4.5" />
                  </svg>
                </button>
              </header>
              {weeklyChartMode === "trend"
                ? (recordedReportPointCount >= 2
                    ? <LineTrendChart points={reportPoints} tone="rhythm" compact scale="range" verticalEmphasis curve="monotone" showAllDates rangeFloorRatio={0.3} showArea showConfidenceBand={false} ariaLabel={locale === "zh" ? "近七天节律单调平滑趋势曲线与下方渐变面积，最低值保留三成基础高度，最高值对应顶部" : "Seven-day monotone rhythm curve with a gradient area, a thirty-percent floor, and proportional scaling"} />
                    : <div
                        className="weekly-trajectory-placeholder"
                        role="img"
                        aria-label={locale === "zh" ? "暂无节律数据的七日轨迹图" : "Seven-day rhythm chart with no recorded data"}
                      >
                        <div className="weekly-trajectory-placeholder-bars" aria-hidden="true">
                          {reportPoints.map((point, index) => <span className="weekly-trajectory-placeholder-day" key={point.id}>
                            <i style={{ height: weeklyPlaceholderHeights[index] }} />
                            <b>{point.label}</b>
                          </span>)}
                        </div>
                      </div>)
                : <WeeklyRadarChart points={weeklyRadarPoints} ariaLabel={locale === "zh" ? "本周睡眠、运动、饮食、专注、面部和情绪六个维度的实际记录日平均分；缺失日期不按零分计算" : "Recorded-day weekly averages for sleep, activity, diet, focus, face, and mood; missing dates are excluded"} />}
            </section>
            <section className={`weekly-insight-card weekly-insight-card--${dnbReport?.status ?? "unavailable"}`} data-dnb-status={dnbReport?.status ?? "loading"}>
              <header className="weekly-insight-header">
                <span aria-hidden="true"><Bot size={18} /></span>
                <strong>{weeklyAiReport?.provider === "demo"
                  ? (locale === "zh" ? "演示本周节律洞察" : "Demo weekly rhythm insights")
                  : (locale === "zh" ? "AI 本周节律洞察" : "AI weekly rhythm insights")}</strong>
                <button type="button" className="weekly-share-button" disabled={!dnbReport || dnbReport.status !== "ready"} onClick={() => void shareWeeklyReport()}><Share2 size={15} />{locale === "zh" ? "保存海报" : "Save poster"}</button>
              </header>
              <div className="weekly-insight-body" aria-live="polite">
                {weeklyAiLoading
                  ? <SkeletonLines count={4} />
                  : weeklyRecordedDays < 5
                    ? <p>{locale === "zh" ? `本自然周目前有 ${weeklyRecordedDays} 个记录日；至少记录 5 天后才生成跨模块 AI 关联，避免用稀疏数据下结论。` : `This natural week currently has ${weeklyRecordedDays} recorded days. Cross-module AI analysis starts after 5 days to avoid conclusions from sparse data.`}</p>
                    : <div className="weekly-ai-summary-list">
                        {weeklyAiReport?.overview && <p className="weekly-ai-overview">{weeklyAiReport.overview}</p>}
                        <ul>{weeklyInsights.map((insight, index) => {
                          const section = weeklySections[index];
                          return <li key={`${section?.id ?? index}-${insight}`}><button type="button" disabled={!section} onClick={() => section && setWeeklyDetailSection(section)}><span>{insight}</span><ChevronRight size={15} aria-hidden="true" /></button></li>;
                        })}</ul>
                      </div>}
                {weeklyAiUnavailable && <small>{locale === "zh" ? "真实 AI 洞察暂不可用，请稍后重试。" : "Real AI insights are temporarily unavailable."}</small>}
                <img className="weekly-insight-mascot" src={weeklyRunMascot} alt={locale === "zh" ? "NAVA 小猫在跑步机上跑步" : "NAVA cat running on a treadmill"} />
              </div>
            </section>
            {weeklyDetailSection && <div className="weekly-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="weekly-detail-title" onClick={(event) => { if (event.target === event.currentTarget) setWeeklyDetailSection(null); }}>
              <article>
                <header>
                  <div><small>{locale === "zh" ? "真实 AI 个性化解读" : "Personalized AI interpretation"}</small><h2 id="weekly-detail-title">{weeklyDetailSection.title}</h2></div>
                  <button type="button" onClick={() => setWeeklyDetailSection(null)} aria-label={locale === "zh" ? "关闭详细解读" : "Close detailed interpretation"}><X size={20} /></button>
                </header>
                <p className="weekly-detail-headline">{weeklyDetailSection.headline}</p>
                <section>
                  <strong>{locale === "zh" ? "详细解释" : "Detailed interpretation"}</strong>
                  <p>{weeklyDetailSection.explanation}</p>
                </section>
                <section>
                  <strong>{locale === "zh" ? "依据的真实记录" : "Evidence from your records"}</strong>
                  <ul>{weeklyDetailSection.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
                <section className="weekly-detail-action">
                  <strong>{locale === "zh" ? "下一步建议" : "Next action"}</strong>
                  <p>{weeklyDetailSection.action}</p>
                </section>
                <footer><span>{locale === "zh" ? "结论置信度" : "Confidence"}</span><b data-confidence={weeklyDetailSection.confidence}>{locale === "zh" ? ({ high: "较高", medium: "中等", low: "有限" }[weeklyDetailSection.confidence]) : weeklyDetailSection.confidence}</b><small>{locale === "zh" ? "仅基于本周已授权记录，不构成医疗诊断，也不代表因果关系。" : "Based only on consent-authorized weekly records; not a diagnosis or a causal claim."}</small></footer>
              </article>
            </div>}
          </div>
        )}
      </div>
    );
  }

  if (dataLoadError) {
    return (
      <div className="record-data-error" ref={rootRef} role="alert">
        <section className="figma-module-card">
          <strong>{locale === "zh" ? "暂时无法读取真实记录" : "Real records are temporarily unavailable"}</strong>
          <p>{dataLoadError}</p>
          <button type="button" onClick={() => void loadRecordData()}>{locale === "zh" ? "重新加载" : "Retry"}</button>
        </section>
      </div>
    );
  }

  return (
    <div
      className={[
        "stack",
        "record-detail",
        busy ? "is-saving" : "",
        notice ? "has-save-success" : "",
        error ? "has-save-error" : "",
      ].filter(Boolean).join(" ")}
      data-record-detail={activeModule}
      data-record-busy={busy ?? undefined}
      data-record-status={notice ? "success" : error ? "error" : undefined}
      aria-busy={Boolean(busy)}
      ref={rootRef}
    >
      <input
        ref={dietQuickCameraInputRef}
        className="visually-hidden"
        data-diet-quick-camera
        aria-label={locale === "zh" ? "使用后置摄像头拍摄饮食" : "Use rear camera to photograph meal"}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={dietAnalyzing}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (!file) return;
          setShowEditor(true);
          onViewChange?.("editor");
          void handleDietPhoto(file);
        }}
      />
      {showEditor && <div className="record-detail-toolbar record-detail-toolbar--editor">
        {notice && <div className="record-upload-toast" role="status" aria-live="polite">
          <Check size={15} />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label={locale === "zh" ? "关闭提示" : "Dismiss notification"}><X size={14} /></button>
        </div>}
        <label className="record-detail-date">
          <input
            aria-label={t("records.date")}
            type="date"
            value={recordDate}
            max={deviceDate}
            onChange={(event) => setRecordDate(event.target.value)}
          />
        </label>
      </div>}

      {error && (
        <SectionCard className="record-feedback-card is-error" title={t("records.needsFix")}>
          {error && <p className="error-text">{error}</p>}
        </SectionCard>
      )}

      {!showEditor && dashboardModules.has(activeModule) && (
        <RecordModuleDashboard
          userId={user.id}
          module={activeModule}
          moodScore={moodScore}
          setMoodScore={updateMoodScore}
          moodFactors={moodFactors.map((factor) => ({ value: factor.value, label: t(factor.labelKey) }))}
          selectedFactors={selectedFactors}
          setPrimaryFactor={setPrimaryFactor}
          toggleMoodFactor={toggleFactor}
          diary={diary}
          setDiary={updateMoodDiary}
          onSaveMood={saveMood}
          sleepStart={sleepStart}
          sleepEnd={sleepEnd}
          deepSleep={deepSleep}
          lightSleep={lightSleep}
          remSleep={remSleep}
          sleepRating={sleepRating}
          steps={steps}
          calories={calories}
          exerciseMinutes={exerciseMinutes}
          focusTitle={focusTitle}
          focusMinutes={focusMinutes}
          setFocusTitle={setFocusTitle}
          setFocusMinutes={setFocusMinutes}
          onOpenEditor={() => {
            setShowEditor(true);
            onViewChange?.("editor");
          }}
          onOpenDietCamera={() => dietQuickCameraInputRef.current?.click()}
          onOpenDietMeal={(nextMeal) => {
            setMeal(nextMeal);
            setShowEditor(true);
            onViewChange?.("editor");
          }}
          onSaveFocusMinutes={saveFocusMinutes}
          busy={busy}
          recordDate={recordDate}
          deviceDate={deviceDate}
          todaySnapshot={todaySnapshot}
          trendBundle={trendBundle}
          profile={profile}
          onGrowthActivity={onGrowthActivity}
          onOpenAi={onOpenAi}
          onOpenWeeklyReport={() => {
            setActiveModule(null);
            setReportMode("weekly");
            onModuleChange?.(null);
          }}
          initialView={initialView === "editor" ? null : initialView}
          onViewChange={onViewChange}
        />
      )}

      {(showEditor || !dashboardModules.has(activeModule)) && <div className="record-editor-stack">

      <form hidden={activeModule !== "mood"} onSubmit={saveMood}>
        <SectionCard title={t("records.mood")}>
          <div className="module-title">
            <SmilePlus size={20} />
            <strong>{moodScore}</strong>
          </div>
          <input className="range" type="range" min="0" max="100" value={moodScore} onChange={(e) => updateMoodScore(Number(e.target.value))} onPointerUp={(e) => updateMoodScore(Number(e.currentTarget.value), true)} onKeyUp={(e) => updateMoodScore(Number(e.currentTarget.value), true)} />
          <div className="chip-grid">
            {moodFactors.map((factor) => (
              <button
                className={selectedFactors.includes(factor.value) ? "chip selected" : "chip"}
                key={factor.value}
                type="button"
                onClick={() => toggleFactor(factor.value)}
              >
                {t(factor.labelKey)}
              </button>
            ))}
          </div>
          <label className="field">
            <span>{t("records.diary")}</span>
            <textarea value={diary} onChange={(e) => updateMoodDiary(e.target.value)} placeholder={t("records.diaryPlaceholder")} rows={3} />
          </label>
          <ActionButton type="submit" icon={<Check size={18} />} disabled={busy === "records.mood"}>
            {t("records.saveMood")}
          </ActionButton>
        </SectionCard>
      </form>

      <form hidden={activeModule !== "sleep"} onSubmit={saveSleep}>
        <SectionCard title={t("records.sleep")}>
          <div className="sleep-preset-row" role="group" aria-label={locale === "zh" ? "常用作息预设" : "Common sleep presets"}>
            {[
              { label: locale === "zh" ? "早睡" : "Early", start: "22:30", end: "06:30", minutes: 480 },
              { label: locale === "zh" ? "标准" : "Standard", start: "23:00", end: "07:00", minutes: 480 },
              { label: locale === "zh" ? "晚睡" : "Late", start: "00:30", end: "08:00", minutes: 450 },
            ].map((preset) => <button type="button" key={preset.label} onClick={() => { setSleepStart(preset.start); setSleepEnd(preset.end); setSleepDuration(preset.minutes); setDeepSleep(Math.round(preset.minutes * .2)); setLightSleep(Math.round(preset.minutes * .58)); setRemSleep(preset.minutes - Math.round(preset.minutes * .2) - Math.round(preset.minutes * .58)); }}>{preset.label}<small>{preset.start}–{preset.end}</small></button>)}
          </div>
          <div className="two-col">
            <label className="field">
              <span>{t("records.sleepStart")}</span>
              <input type="time" value={sleepStart} onChange={(e) => setSleepStart(e.target.value)} />
            </label>
            <label className="field">
              <span>{t("records.sleepEnd")}</span>
              <input type="time" value={sleepEnd} onChange={(e) => setSleepEnd(e.target.value)} />
            </label>
          </div>
          <div className="two-col">
            <label className="field">
              <span>{t("records.totalMinutes")}</span>
              <input inputMode="numeric" type="number" value={sleepDuration} onChange={(e) => setSleepDuration(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>{t("records.deepSleep")}</span>
              <input inputMode="numeric" type="number" value={deepSleep} onChange={(e) => setDeepSleep(Number(e.target.value))} />
            </label>
          </div>
          <div className="two-col">
            <label className="field">
              <span>{t("records.lightSleep")}</span>
              <input inputMode="numeric" type="number" value={lightSleep} onChange={(e) => setLightSleep(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>{t("records.rem")}</span>
              <input inputMode="numeric" type="number" value={remSleep} onChange={(e) => setRemSleep(Number(e.target.value))} />
            </label>
          </div>
          <label className="field">
            <span>{t("records.rating")}</span>
            <input className="range" type="range" min="1" max="5" value={sleepRating} onChange={(e) => setSleepRating(Number(e.target.value))} />
          </label>
          <label className="field sleep-note-field">
            <span>{t("records.note")}</span>
            <textarea rows={2} value={sleepNote} onChange={(e) => setSleepNote(e.target.value)} placeholder={t("records.sleepNotePlaceholder")} />
          </label>
          <ActionButton type="submit" icon={<BedDouble size={18} />} variant="secondary" disabled={busy === "records.sleep"}>
            {t("records.saveSleep")}
          </ActionButton>
        </SectionCard>
      </form>

      <form hidden={activeModule !== "exercise"} onSubmit={saveExercise}>
        <SectionCard title={t("records.exercise")}>
          <div className="two-col">
            <label className="field">
              <span>{t("records.steps")}</span>
              <input inputMode="numeric" type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>{t("records.calories")}</span>
              <input inputMode="numeric" type="number" value={calories} onChange={(e) => setCalories(Number(e.target.value))} />
            </label>
          </div>
          <label className="field">
            <span>{t("records.exerciseMinutes")}</span>
            <input inputMode="numeric" type="number" value={exerciseMinutes} onChange={(e) => setExerciseMinutes(Number(e.target.value))} />
          </label>
          <div className="two-col">
            <label className="field">
              <span>{t("records.heartRate")}</span>
              <input inputMode="numeric" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} placeholder="bpm" />
            </label>
            <label className="field">
              <span>{t("records.spo2")}</span>
              <input value={spo2} onChange={(e) => setSpo2(e.target.value)} placeholder="98%" />
            </label>
          </div>
          <label className="field exercise-note-field">
            <span>{t("records.note")}</span>
            <textarea rows={2} value={exerciseNote} onChange={(e) => setExerciseNote(e.target.value)} placeholder={t("records.exerciseNotePlaceholder")} />
          </label>
          <ActionButton type="submit" icon={<Dumbbell size={18} />} variant="secondary" disabled={busy === "records.exercise"}>
            {t("records.saveExercise")}
          </ActionButton>
        </SectionCard>
      </form>

      <form hidden={activeModule !== "diet"} onSubmit={saveDiet}>
        <SectionCard title={t("records.diet")}>
          <div className="diet-quick-foods" role="group" aria-label={locale === "zh" ? "常见食物估算快捷填入" : "Quick estimated foods"}>
            {[
              { zh: "鸡蛋 1 个", en: "1 egg", calories: 78, protein: 6, carbs: 1, fat: 5 },
              { zh: "米饭 1 碗", en: "Rice bowl", calories: 230, protein: 4, carbs: 50, fat: 1 },
              { zh: "牛奶 250ml", en: "Milk 250ml", calories: 150, protein: 8, carbs: 12, fat: 8 },
              { zh: "苹果 1 个", en: "1 apple", calories: 95, protein: 0, carbs: 25, fat: 0 },
            ].map((food) => <button type="button" key={food.zh} onClick={() => { setMealName(locale === "zh" ? `${food.zh}（估算）` : `${food.en} (estimate)`); setMealCalories(food.calories); setProteinGrams(food.protein); setCarbohydrateGrams(food.carbs); setFatGrams(food.fat); setDietItems([]); }}><strong>{locale === "zh" ? food.zh : food.en}</strong><small>≈ {food.calories} kcal</small></button>)}
          </div>
          <div className={["photo-picker", "diet-photo-preview", dietAnalyzing ? "is-analyzing" : "", dietPhotoUrl ? "has-image" : ""].filter(Boolean).join(" ")} aria-live="polite">
            {dietPhotoUrl ? <img src={dietPhotoUrl} alt="饮食照片" /> : <Camera size={28} />}
            <span>{dietAnalyzing ? t("records.aiScanning") : t("records.scanDiet")}</span>
            {dietAnalyzing && <Loader2 className="spin" size={18} />}
          </div>
          <div className="diet-photo-actions" role="group" aria-label={locale === "zh" ? "选择饮食照片来源" : "Choose meal photo source"}>
            <label className="diet-photo-action">
              <Camera size={18} />
              <span>{locale === "zh" ? "打开摄像头" : "Open camera"}</span>
              <input
                aria-label={locale === "zh" ? "打开摄像头拍摄饮食" : "Open camera to photograph meal"}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={dietAnalyzing}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  void handleDietPhoto(file);
                }}
              />
            </label>
            <label className="diet-photo-action">
              <Upload size={18} />
              <span>{locale === "zh" ? "上传照片" : "Upload photo"}</span>
              <input
                aria-label={locale === "zh" ? "从相册上传饮食照片" : "Upload meal photo from library"}
                type="file"
                accept="image/*"
                disabled={dietAnalyzing}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  void handleDietPhoto(file);
                }}
              />
            </label>
          </div>
          <div className="two-col">
            <label className="field">
              <span>{t("records.meal")}</span>
              <select value={meal} onChange={(e) => setMeal(e.target.value as typeof meal)}>
                <option value="breakfast">{t("records.breakfast")}</option>
                <option value="lunch">{t("records.lunch")}</option>
                <option value="dinner">{t("records.dinner")}</option>
                <option value="pantry">{t("records.pantry")}</option>
              </select>
            </label>
            <label className="field nutrition-unit-field">
              <span>{t("records.calorie")}</span>
              <div className="nutrition-unit-input">
                <input inputMode="numeric" type="number" value={mealCalories} onChange={(e) => setMealCalories(Number(e.target.value))} />
                <b aria-hidden="true">kcal</b>
              </div>
            </label>
          </div>
          <label className="field">
            <span>{t("records.food")}</span>
            <input value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder={locale === "zh" ? "AI 识别后自动填写，也可手动输入" : "Filled by AI or entered manually"} />
          </label>
          <div className="two-col nutrition-macro-fields">
            <label className="field nutrition-unit-field">
              <span>{locale === "zh" ? "蛋白质摄入量" : "Protein intake"}</span>
              <div className="nutrition-unit-input"><input inputMode="decimal" type="number" min="0" value={proteinGrams} onChange={(e) => setProteinGrams(Number(e.target.value))} /><b aria-hidden="true">g</b></div>
            </label>
            <label className="field nutrition-unit-field">
              <span>{locale === "zh" ? "碳水摄入量" : "Carbohydrate intake"}</span>
              <div className="nutrition-unit-input"><input inputMode="decimal" type="number" min="0" value={carbohydrateGrams} onChange={(e) => setCarbohydrateGrams(Number(e.target.value))} /><b aria-hidden="true">g</b></div>
            </label>
            <label className="field nutrition-unit-field">
              <span>{locale === "zh" ? "脂肪摄入量" : "Fat intake"}</span>
              <div className="nutrition-unit-input"><input inputMode="decimal" type="number" min="0" value={fatGrams} onChange={(e) => setFatGrams(Number(e.target.value))} /><b aria-hidden="true">g</b></div>
            </label>
            <label className="field nutrition-unit-field">
              <span>{locale === "zh" ? "饮水摄入量" : "Water intake"}</span>
              <div className="nutrition-unit-input"><input inputMode="numeric" type="number" min="0" value={hydrationMl} onChange={(e) => setHydrationMl(Number(e.target.value))} /><b aria-hidden="true">ml</b></div>
            </label>
          </div>
          <label className="field diet-rating-field"><span>{locale === "zh" ? `饮食自评 ${dietRating}/5` : `Diet rating ${dietRating}/5`}</span><input className="range" type="range" min="1" max="5" value={dietRating} onChange={(e) => setDietRating(Number(e.target.value))} /></label>
          <ActionButton type="submit" icon={<Drumstick size={18} />} variant="secondary" disabled={busy === "records.diet"}>
            {dietItems.length > 0 ? t("records.saveDetected") : t("records.saveDiet")}
          </ActionButton>
        </SectionCard>
      </form>

      <form hidden={activeModule !== "focus"} onSubmit={saveFocus}>
        <SectionCard title={t("records.focus")}>
          <label className="field">
            <span>{t("records.task")}</span>
            <input value={focusTitle} onChange={(e) => setFocusTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("records.minutes")}</span>
            <input inputMode="numeric" type="number" value={focusMinutes} onChange={(e) => setFocusMinutes(Number(e.target.value))} />
          </label>
          <ActionButton type="submit" icon={<Brain size={18} />} variant="secondary" disabled={busy === "records.focus"}>
            {t("records.saveFocus")}
          </ActionButton>
        </SectionCard>
      </form>

      <div hidden={activeModule !== "face"}>
        <SectionCard
          title={t("records.face")}
          action={
            <button
              className="section-icon-action face-camera-action"
              type="button"
              aria-label={t("records.frontCamera")}
              title={t("records.frontCamera")}
              disabled={faceAnalyzing}
              onClick={() => facePhotoInputRef.current?.click()}
            >
              {faceAnalyzing ? <Loader2 className="spin" size={22} /> : <Camera size={23} strokeWidth={1.9} />}
            </button>
          }
        >
          <div className="face-mode-picker" role="group" aria-label={locale === "zh" ? "拍摄模式" : "Capture mode"}>
            <button type="button" className={faceMode === "bare_face" ? "selected" : ""} onClick={() => setFaceMode("bare_face")}>{locale === "zh" ? "素颜模式" : "Bare face"}</button>
            <button type="button" className={faceMode === "makeup" ? "selected" : ""} onClick={() => setFaceMode("makeup")}>{locale === "zh" ? "带妆模式" : "Makeup"}</button>
          </div>
          {faceMode === "bare_face" && <div className="face-bare-guidance"><Bot size={19} /><p><strong>{locale === "zh" ? "真实状态就是最好的记录" : "Your real state is the best record"}</strong><span>{locale === "zh" ? "不需要修饰，也不需要达到任何标准。照片只有在你明确同意后，才会通过加密连接上传至账号隔离的 Supabase 私有存储，并交由受控服务端分析。" : "No retouching and no standard to meet. Only after your explicit consent is the photo encrypted in transit, uploaded to account-isolated private Supabase storage, and analyzed by the controlled server."}</span></p></div>}
          <label className="face-consent"><input type="checkbox" checked={faceConsent} onChange={(event) => setFaceConsent(event.target.checked)} /><span>{locale === "zh" ? "我同意通过加密连接将照片上传至账号隔离的 Supabase 私有存储，由受控服务端使用 10 分钟签名链接完成本次非医疗状态分析。" : "I consent to encrypted upload into account-isolated private Supabase storage so the controlled server can use a 10-minute signed link for this non-medical state analysis."}</span></label>
          <label className={["photo-picker", "face", faceAnalyzing ? "is-analyzing" : "", faceImage ? "has-image" : ""].filter(Boolean).join(" ")}>
            {faceImage ? <img src={faceImage} alt={locale === "zh" ? "面部照片" : "Face photo"} /> : <ScanFace size={30} />}
            <span>{faceAnalyzing ? t("records.faceScanning") : t("records.scanFace")}</span>
            <input
              aria-label={t("records.frontCamera")}
              ref={facePhotoInputRef}
              type="file"
              accept="image/*"
              capture="user"
              disabled={faceAnalyzing || !faceConsent}
              onChange={(e) => { const file = e.currentTarget.files?.[0] ?? null; e.currentTarget.value = ""; void handleFacePhoto(file); }}
            />
            {faceAnalyzing && <Loader2 className="spin" size={18} />}
          </label>
          <div className="face-photo-actions">
            <button type="button" disabled={faceAnalyzing || !faceConsent} onClick={() => facePhotoInputRef.current?.click()}><Camera size={17} />{faceImage ? (locale === "zh" ? "重新拍摄" : "Retake") : (locale === "zh" ? "前置拍摄" : "Front camera")}</button>
            <button type="button" disabled={faceAnalyzing || !faceConsent} onClick={() => faceLibraryInputRef.current?.click()}><Upload size={17} />{locale === "zh" ? "从相册重选" : "Choose from library"}</button>
            <input ref={faceLibraryInputRef} hidden aria-label={locale === "zh" ? "从相册选择面部照片" : "Choose face photo from library"} type="file" accept="image/*" disabled={faceAnalyzing || !faceConsent} onChange={(e) => { const file = e.currentTarget.files?.[0] ?? null; e.currentTarget.value = ""; void handleFacePhoto(file); }} />
          </div>
          {faceDraftFile && !faceResult && !faceAnalyzing && <button className="face-resume-analysis" type="button" onClick={() => void handleFacePhoto(faceDraftFile)}><RefreshCw size={16} />{locale === "zh" ? "继续分析已恢复的照片" : "Analyze the restored photo"}</button>}
          {pendingFaceAnalysis && <div className="face-makeup-check" role="alert">
            <div><Bot size={18} /><p><strong>{locale === "zh" ? "AI 妆容识别需要你确认" : "Confirm the AI makeup check"}</strong><span>{locale === "zh"
              ? `模型判断为${({ bare: "素颜", light: "淡妆", heavy: "浓妆", uncertain: "无法判断" } as const)[pendingFaceAnalysis.result.makeup_level ?? "uncertain"]}，置信度 ${Math.round((pendingFaceAnalysis.result.makeup_confidence ?? 0) * 100)}%。当前选择的是${pendingFaceAnalysis.captureMode === "bare_face" ? "素颜" : "带妆"}模式。`
              : `The model estimated ${pendingFaceAnalysis.result.makeup_level ?? "uncertain"} makeup at ${Math.round((pendingFaceAnalysis.result.makeup_confidence ?? 0) * 100)}% confidence, which may not match the selected ${pendingFaceAnalysis.captureMode === "bare_face" ? "bare-face" : "makeup"} mode.`}</span></p></div>
            <small>{locale === "zh" ? "妆容识别只是视觉估计；光线、滤镜和遮挡会影响结果。" : "Makeup detection is a visual estimate affected by lighting, filters, and occlusion."}</small>
            <div><button type="button" disabled={faceAnalyzing} onClick={() => void continuePendingFaceAnalysis()}>{locale === "zh" ? "仍按当前模式保存" : "Save with current mode"}</button><button type="button" disabled={faceAnalyzing} onClick={() => void switchPendingFaceMode()}>{locale === "zh" ? `切换到${pendingFaceAnalysis.captureMode === "bare_face" ? "带妆" : "素颜"}并重新分析` : `Switch to ${pendingFaceAnalysis.captureMode === "bare_face" ? "makeup" : "bare"} and re-analyze`}</button></div>
          </div>}
          {faceResult && (
            <div className="face-result">
              <strong>{t("records.score", { score: Math.round(faceResult.overall_score) })}</strong>
              <p>{faceResult.feedback}</p>
               <div className="detected-list">
                 {faceResult.annotations.map((item) => (
                   <div key={item.id}>
                     <strong>{item.label}</strong>
                     <span>{item.desc}</span>
                   </div>
                 ))}
               </div>
               <div className="face-result-meta">
                 <span><ShieldCheck size={16} />{locale === "zh" ? "结果用于日常状态观察，不构成医疗诊断" : "For daily state tracking, not medical diagnosis"}</span>
                 <span><LockKeyhole size={16} />{locale === "zh" ? "照片与结果按当前账号隔离保存" : "Photo and result stay isolated to this account"}</span>
               </div>
             </div>
           )}
        </SectionCard>
      </div>
      </div>}
    </div>
  );
}
