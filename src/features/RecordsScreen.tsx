import type { User } from "@supabase/supabase-js";
import { BedDouble, Brain, Camera, Check, ChevronLeft, ChevronRight, Drumstick, Dumbbell, Loader2, LockKeyhole, ScanFace, Share2, ShieldCheck, SmilePlus, Upload, X, type LucideIcon } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ActionButton from "../components/ActionButton";
import AnimatedNumber from "../components/AnimatedNumber";
import LineTrendChart from "../components/LineTrendChart";
import SectionCard from "../components/SectionCard";
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
import { todayISO } from "../services/date";
import { analyzeDietPhoto, analyzeFacePhoto, resolveDietPhotoUrl } from "../services/media";
import { currentSevenDayPeriod, loadDnbWeeklyReport, refreshFdnbHealth, shareDnbWeeklyPoster, type DnbWeeklyReport } from "../services/dnb";
import { trackAnalyticsEvent } from "../services/analytics";
import { clearRecordDraft, loadRecordDraft, saveRecordDraft, type RecordDraftModule } from "../services/drafts";
import { loadProfile, type UserProfile } from "../services/profile";
import { loadDietAiReport } from "../services/dietReport";
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
  summaryKeys: [TranslationKey, TranslationKey, TranslationKey, TranslationKey];
}> = [
  {
    id: "mood",
    labelKey: "records.mood",
    icon: SmilePlus,
    summaryKeys: ["records.hub.mood.one", "records.hub.mood.two", "records.hub.mood.three", "records.hub.mood.four"],
  },
  {
    id: "sleep",
    labelKey: "records.sleep",
    icon: BedDouble,
    summaryKeys: ["records.hub.sleep.one", "records.hub.sleep.two", "records.hub.sleep.three", "records.hub.sleep.four"],
  },
  {
    id: "exercise",
    labelKey: "records.exercise",
    icon: Dumbbell,
    summaryKeys: ["records.hub.exercise.one", "records.hub.exercise.two", "records.hub.exercise.three", "records.hub.exercise.four"],
  },
  {
    id: "diet",
    labelKey: "records.diet",
    icon: Drumstick,
    summaryKeys: ["records.hub.diet.one", "records.hub.diet.two", "records.hub.diet.three", "records.hub.diet.four"],
  },
  {
    id: "focus",
    labelKey: "records.focus",
    icon: Brain,
    summaryKeys: ["records.hub.focus.one", "records.hub.focus.two", "records.hub.focus.three", "records.hub.focus.four"],
  },
  {
    id: "face",
    labelKey: "records.faceShort",
    icon: ScanFace,
    summaryKeys: ["records.hub.face.one", "records.hub.face.two", "records.hub.face.three", "records.hub.face.four"],
  },
];

export default function RecordsScreen({
  user,
  onSaved,
  initialModule = null,
  initialView = null,
  onModuleChange,
  onViewChange,
}: {
  user: User;
  onSaved: () => void;
  initialModule?: RecordModule | null;
  initialView?: string | null;
  onModuleChange?: (module: RecordModule | null) => void;
  onViewChange?: (view: string | null, replace?: boolean) => void;
}) {
  const { locale, t } = useLocale();
  const recordDateStorageKey = `nava-record-date:${user.id}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordDate, setRecordDate] = useState(() => {
    if (typeof window === "undefined") return todayISO();
    const stored = window.sessionStorage.getItem(recordDateStorageKey);
    return stored && /^\d{4}-\d{2}-\d{2}$/.test(stored) && stored <= todayISO() ? stored : todayISO();
  });
  const [activeModule, setActiveModule] = useState<RecordModule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [todaySnapshot, setTodaySnapshot] = useState<TodaySnapshot | null>(null);
  const [trendBundle, setTrendBundle] = useState<TrendBundle | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reportMode, setReportMode] = useState<"modules" | "weekly">("modules");
  const [dnbReport, setDnbReport] = useState<DnbWeeklyReport | null>(null);
  const [dnbLoading, setDnbLoading] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.sessionStorage.setItem(recordDateStorageKey, recordDate);
  }, [recordDate, recordDateStorageKey]);

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
  const [faceAnalyzing, setFaceAnalyzing] = useState(false);
  const [faceMode, setFaceMode] = useState<"bare_face" | "makeup">("bare_face");
  const [faceConsent, setFaceConsent] = useState(false);
  const dietQuickCameraInputRef = useRef<HTMLInputElement | null>(null);
  const facePhotoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFocusTitle((current) => current === "产品原型" || current === "Product prototype" || current === "Prototype" ? "" : current);
  }, [locale]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadRecordData = useCallback(async () => {
    setDraftReady(false);
    try {
      const [snapshot, trends, loadedProfile] = await Promise.all([
        getTodaySnapshot(user.id, recordDate),
        getTrends(user.id),
        loadProfile(user.id).catch(() => null),
      ]);
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
      setDietPhotoUrl(typeof photoPath === "string" ? await resolveDietPhotoUrl(photoPath).catch(() => null) : null);
      const draftModule = activeModule === "diet" ? "nutrition" : activeModule;
      const draft = draftModule ? await loadRecordDraft(user.id, draftModule, recordDate) : null;
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
          setDietPhotoUrl(await resolveDietPhotoUrl(draft.photoPath).catch(() => null));
        }
      }
      if (draft && activeModule === "focus") {
        if (typeof draft.title === "string") setFocusTitle(draft.title);
        if (typeof draft.minutes === "number") setFocusMinutes(draft.minutes);
      }
    } catch (loadError) {
      console.warn("Failed to load record dashboard data", loadError);
    } finally {
      setDraftReady(true);
    }
  }, [activeModule, meal, recordDate, user.id]);

  useEffect(() => {
    void loadRecordData();
  }, [loadRecordData]);

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
    if (reportMode !== "weekly") return;
    let active = true;
    setDnbLoading(true);
    const reference = new Date();
    reference.setDate(reference.getDate() - weekOffset * 7);
    void loadDnbWeeklyReport(reference, locale)
      .then((report) => {
        if (active) setDnbReport(report);
      })
      .finally(() => {
        if (active) setDnbLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locale, reportMode, user.id, weekOffset]);

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
        await Promise.allSettled([
          refreshRhythmScore(recordDate),
          refreshFdnbHealth(recordDate),
          trackAnalyticsEvent(user.id, "record_saved", { module: labelKey, date: recordDate }),
        ]);
        setNotice(t("records.saved", { label: t(labelKey) }));
      } catch (refreshError) {
        console.warn("Failed to refresh rhythm score after saving record", refreshError);
        setNotice(t("records.savedPending", { label: t(labelKey) }));
      }
      await loadRecordData();
      if (activeModule) {
        const module: RecordDraftModule = activeModule === "diet" ? "nutrition" : activeModule;
        await clearRecordDraft(user.id, module, recordDate).catch((draftError) => console.warn("Record draft cleanup deferred", draftError));
        const wasEditor = showEditor || initialView === "editor";
        setShowEditor(false);
        if (wasEditor) onViewChange?.(null, true);
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
    setSelectedFactors((items) => (items.includes(factor) ? items.filter((item) => item !== factor) : [...items, factor]));
  }

  function setPrimaryFactor(factor: string) {
    setSelectedFactors(factor ? [factor] : []);
  }

  async function saveMood(event: FormEvent) {
    event.preventDefault();
    return run("records.mood", () =>
      saveMoodRecord({
        userId: user.id,
        date: recordDate,
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

  async function handleFacePhoto(file: File | null) {
    if (!file) return;
    setFaceAnalyzing(true);
    setNotice(null);
    setError(null);
    try {
      if (!faceConsent) throw new Error(locale === "zh" ? "请先确认面部照片隐私说明。" : "Please confirm the face-photo privacy notice first.");
      const { image, imagePath, result } = await analyzeFacePhoto({ userId: user.id, date: recordDate, file, captureMode: faceMode, locale });
      setFaceImage(image);
      setFaceResult(result);
      const saved = await saveFaceAnalysisRecord({
        userId: user.id,
        date: recordDate,
        result,
        imagePath,
        modelVersion: result.modelVersion ?? result.model_version,
        captureMode: faceMode,
      });
      setNotice("persisted" in saved && !saved.persisted ? t("records.faceAnalyzed") : t("records.faceSaved"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFaceAnalyzing(false);
    }
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

  async function saveFocusMinutes(minutes: number, details?: { interruptions?: number; startedAt?: string; endedAt?: string }) {
    await run("records.focus", () =>
      saveFocusSession({
        userId: user.id,
        date: recordDate,
        taskTitle: focusTitle,
        minutes,
        interruptions: details?.interruptions,
        startedAt: details?.startedAt,
        endedAt: details?.endedAt,
      }),
    );
  }

  if (!activeModule) {
    const dnbReference = new Date();
    dnbReference.setDate(dnbReference.getDate() - weekOffset * 7);
    const dnbPeriod = currentSevenDayPeriod(dnbReference);
    const inSelectedWeek = (date: string) => date >= dnbPeriod.startDate && date <= dnbPeriod.endDate;
    const rhythmPoints = (trendBundle?.rhythms ?? []).filter((item) => inSelectedWeek(item.record_date)).slice(-7).map((item) => ({
      id: item.id,
      label: new Date(`${item.record_date}T00:00:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" }),
      value: item.score,
      lower: item.score_lower,
      upper: item.score_upper,
    }));
    const moodPoints = (trendBundle?.moods ?? []).filter((item) => inSelectedWeek(item.record_date)).slice(-7).map((item) => ({
      id: item.id,
      label: new Date(`${item.record_date}T00:00:00`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "numeric", day: "numeric" }),
      value: item.mood_score,
    }));
    const reportPoints = rhythmPoints.length >= 2 ? rhythmPoints : moodPoints;
    const latestReportPoint = reportPoints[reportPoints.length - 1];
    const weekChange = reportPoints.length >= 2 ? Math.round(latestReportPoint.value - reportPoints[0].value) : 0;
    const completedModules = todaySnapshot ? [
      todaySnapshot.mood,
      todaySnapshot.sleep,
      todaySnapshot.exercise,
      todaySnapshot.nutrition,
      todaySnapshot.face,
      todaySnapshot.focusMinutes > 0 ? true : null,
    ].filter(Boolean).length : 0;
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
              max={todayISO()}
              onChange={(event) => setRecordDate(event.target.value)}
            />
          </label>

          <div className="record-module-grid">
            {recordModules.map(({ id, labelKey, icon: Icon, summaryKeys }) => (
              <button
                className="record-module-entry"
                data-record-module={id}
                key={id}
                type="button"
                onClick={() => {
                  setNotice(null);
                  setError(null);
                  setShowEditor(false);
                  setActiveModule(id);
                  onModuleChange?.(id);
                }}
              >
                <span className="record-module-header">
                  <strong>{t(labelKey)}</strong>
                  <span className="record-module-icon" aria-hidden="true">
                    <Icon size={25} strokeWidth={1.9} />
                  </span>
                </span>
                <span className="record-module-points" aria-hidden="true">
                  {summaryKeys.map((key) => <span key={key}>{t(key)}</span>)}
                </span>
                <ChevronRight className="record-module-arrow" size={20} aria-hidden="true" />
              </button>
            ))}
          </div>
        </> : (
          <div className="weekly-health-report" data-weekly-health-report>
            <div className="weekly-period-controls">
              <button type="button" onClick={() => setWeekOffset((value) => value + 1)} aria-label={locale === "zh" ? "上一周" : "Previous week"}><ChevronLeft size={18} /></button>
              <strong>{dnbPeriod.startDate} — {dnbPeriod.endDate}</strong>
              <button type="button" disabled={weekOffset === 0} onClick={() => setWeekOffset((value) => Math.max(0, value - 1))} aria-label={locale === "zh" ? "下一周" : "Next week"}><ChevronRight size={18} /></button>
              <button type="button" className="weekly-share-button" disabled={!dnbReport || dnbReport.status !== "ready"} onClick={() => { if (dnbReport) void shareDnbWeeklyPoster(dnbReport, locale, `${dnbPeriod.startDate}-${dnbPeriod.endDate}`).then(() => trackAnalyticsEvent(user.id, "weekly_report_shared", { weekOffset })).catch((shareError) => setError(shareError instanceof Error ? shareError.message : String(shareError))); }}><Share2 size={16} />{locale === "zh" ? "保存海报" : "Poster"}</button>
            </div>
            <section className="weekly-score-card">
              <div><span>{locale === "zh" ? "基础节律" : "Baseline rhythm"}</span><strong>{todaySnapshot?.rhythmScore == null ? "--" : <AnimatedNumber value={todaySnapshot.rhythmScore} />}</strong></div>
              <div><span>{locale === "zh" ? "数据完整度" : "Data complete"}</span><strong><AnimatedNumber value={completedModules} duration={520} />/6</strong></div>
              <div><span>{locale === "zh" ? "周内变化" : "Weekly change"}</span><strong>{weekChange >= 0 ? "+" : ""}<AnimatedNumber value={weekChange} duration={640} /></strong></div>
            </section>
            <section className="weekly-trend-card">
              <header><strong>{locale === "zh" ? "节律轨迹" : "Rhythm trajectory"}</strong><span>{locale === "zh" ? "近 7 天" : "7 days"}</span></header>
              {reportPoints.length > 0
                ? <LineTrendChart points={reportPoints} tone="rhythm" compact ariaLabel={locale === "zh" ? "近七天节律折线图" : "Seven-day rhythm chart"} />
                : <p>{locale === "zh" ? "完成两天记录后生成折线。" : "Log two days to create a chart."}</p>}
            </section>
            <section className={`weekly-insight-card weekly-insight-card--${dnbReport?.status ?? "unavailable"}`} data-dnb-status={dnbReport?.status ?? "loading"}>
              <span>NAVA-FDNB Health · Research</span>
              <strong>
                {dnbLoading
                  ? (locale === "zh" ? "正在分析多模块状态" : "Analyzing multi-module state")
                  : dnbReport?.status === "ready"
                    ? dnbReport.evidenceLevel === "supported"
                      ? (locale === "zh" ? "发现有支持的转变信号" : "Supported transition signal")
                      : dnbReport.evidenceLevel === "candidate"
                        ? (locale === "zh" ? "发现待验证候选波动" : "Candidate change to verify")
                        : (locale === "zh" ? "本周无充分转变证据" : "No supported transition this week")
                    : dnbReport?.status === "insufficient_data"
                      ? (locale === "zh" ? "数据仍在建立个人基线" : "Building your baseline")
                      : (locale === "zh" ? "分析服务暂时不可用" : "Analysis temporarily unavailable")}
                {dnbReport?.status === "ready" && dnbReport.score != null
                  ? <small>{locale === "zh"
                    ? `稳定度 ${Math.round(dnbReport.stabilityScore ?? dnbReport.score)} · 转变强度 ${Math.round(dnbReport.transitionScore ?? 0)}`
                    : `Stability ${Math.round(dnbReport.stabilityScore ?? dnbReport.score)} · transition ${Math.round(dnbReport.transitionScore ?? 0)}`}</small>
                  : null}
              </strong>
              <p>{dnbLoading
                ? (locale === "zh" ? "正在核对 56 天数据覆盖、窗口一致性和对照检验。" : "Checking 56-day coverage, window agreement, and null controls.")
                : dnbReport?.status === "ready"
                  ? [dnbReport.summary, dnbReport.recommendations[0]].filter(Boolean).join(" ")
                  : dnbReport?.status === "insufficient_data"
                    ? (locale === "zh"
                      ? `当前已有 ${dnbReport.availableDays ?? 0} 天有效记录${dnbReport.requiredDays ? `，算法至少需要 ${dnbReport.requiredDays} 天` : ""}。`
                      : `${dnbReport.availableDays ?? 0} valid days recorded${dnbReport.requiredDays ? `; ${dnbReport.requiredDays} required` : ""}.`)
                    : (dnbReport?.reason || (locale === "zh" ? "当前仅展示基础统计，未生成研究性状态结论。" : "Only baseline statistics are shown; no research signal was generated."))}</p>
              {dnbReport?.status === "ready" && (dnbReport.contributors?.length ?? 0) > 0 && (
                <div className="weekly-fdnb-contributors" aria-label={locale === "zh" ? "主要贡献信号" : "Leading signals"}>
                  {dnbReport.contributors?.slice(0, 3).map((item) => (
                    <span key={item.feature}>{item.module} · {(item.feature.split(".").slice(-1)[0] ?? item.feature).replace(/_/g, " ")}</span>
                  ))}
                </div>
              )}
              {dnbReport?.disclaimer && <small className="weekly-fdnb-disclaimer">{dnbReport.disclaimer}</small>}
            </section>
            <section className="weekly-module-status">
              {recordModules.map(({ id, labelKey, icon: Icon }) => <button type="button" key={id} onClick={() => { setActiveModule(id); onModuleChange?.(id); }}><Icon size={20} /><span>{t(labelKey)}</span><ChevronRight size={17} /></button>)}
            </section>
          </div>
        )}
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
            max={todayISO()}
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
          setMoodScore={setMoodScore}
          moodFactors={moodFactors.map((factor) => ({ value: factor.value, label: t(factor.labelKey) }))}
          selectedFactors={selectedFactors}
          setPrimaryFactor={setPrimaryFactor}
          diary={diary}
          setDiary={setDiary}
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
          onSaveFocusMinutes={saveFocusMinutes}
          busy={busy}
          recordDate={recordDate}
          todaySnapshot={todaySnapshot}
          trendBundle={trendBundle}
          profile={profile}
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
          <input className="range" type="range" min="0" max="100" value={moodScore} onChange={(e) => setMoodScore(Number(e.target.value))} />
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
            <textarea value={diary} onChange={(e) => setDiary(e.target.value)} placeholder={t("records.diaryPlaceholder")} rows={3} />
          </label>
          <ActionButton type="submit" icon={<Check size={18} />} disabled={busy === "records.mood"}>
            {t("records.saveMood")}
          </ActionButton>
        </SectionCard>
      </form>

      <form hidden={activeModule !== "sleep"} onSubmit={saveSleep}>
        <SectionCard title={t("records.sleep")}>
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
          <label className="face-consent"><input type="checkbox" checked={faceConsent} onChange={(event) => setFaceConsent(event.target.checked)} /><span>{locale === "zh" ? "我同意将照片加密上传至账号隔离的私密存储，并以 10 分钟签名链接完成本次非医疗状态分析。" : "I consent to private encrypted upload and a 10-minute signed link for this non-medical state analysis."}</span></label>
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
              onChange={(e) => void handleFacePhoto(e.target.files?.[0] ?? null)}
            />
            {faceAnalyzing && <Loader2 className="spin" size={18} />}
          </label>
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
