import type { User } from "@supabase/supabase-js";
import { ArrowLeft, BedDouble, Brain, Camera, Check, ChevronRight, Drumstick, Dumbbell, Loader2, ScanFace, SmilePlus, type LucideIcon } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import { useT, type TranslationKey } from "../i18n";
import {
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveFaceAnalysisRecord,
  saveNutritionItems,
  saveNutritionRecord,
  saveSleepRecord,
  refreshRhythmScore,
} from "../services/records";
import { todayISO } from "../services/date";
import { analyzeDietPhoto, analyzeFacePhoto } from "../services/media";
import type { FaceAnalysisResult, FoodItem } from "../types";

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
  onModuleChange,
}: {
  user: User;
  onSaved: () => void;
  initialModule?: RecordModule | null;
  onModuleChange?: (module: RecordModule | null) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordDate, setRecordDate] = useState(todayISO());
  const [activeModule, setActiveModule] = useState<RecordModule | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
  const [mealName, setMealName] = useState("鸡胸肉沙拉");
  const [mealCalories, setMealCalories] = useState(520);
  const [dietPhotoUrl, setDietPhotoUrl] = useState<string | null>(null);
  const [dietPhotoPath, setDietPhotoPath] = useState<string | null>(null);
  const [dietItems, setDietItems] = useState<FoodItem[]>([]);
  const [dietAnalyzing, setDietAnalyzing] = useState(false);

  const [focusTitle, setFocusTitle] = useState("产品原型");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [faceResult, setFaceResult] = useState<FaceAnalysisResult | null>(null);
  const [faceAnalyzing, setFaceAnalyzing] = useState(false);
  const facePhotoInputRef = useRef<HTMLInputElement | null>(null);

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
    onModuleChange?.(activeModule);
  }, [activeModule, onModuleChange]);

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
      try {
        await refreshRhythmScore(recordDate);
        setNotice(t("records.saved", { label: t(labelKey) }));
      } catch (refreshError) {
        console.warn("Failed to refresh rhythm score after saving record", refreshError);
        setNotice(t("records.savedPending", { label: t(labelKey) }));
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  function toggleFactor(factor: string) {
    setSelectedFactors((items) => (items.includes(factor) ? items.filter((item) => item !== factor) : [...items, factor]));
  }

  async function saveMood(event: FormEvent) {
    event.preventDefault();
    await run("records.mood", () =>
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
    if (dietItems.length > 0) {
      await run("records.diet", () =>
        saveNutritionItems({
          userId: user.id,
          date: recordDate,
          meal,
          items: dietItems,
          photoUrl: dietPhotoPath ?? dietPhotoUrl ?? undefined,
        }),
      );
      return;
    }

    await run("records.diet", () =>
      saveNutritionRecord({
        userId: user.id,
        date: recordDate,
        meal,
        item: {
          name: mealName,
          calories: mealCalories,
          amount: "1 份",
        },
        totalCalories: mealCalories,
      }),
    );
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
      if (result.items[0]) {
        setMealName(result.items[0].name);
        setMealCalories(Number(result.items[0].calories) || mealCalories);
      }
      setNotice(t("records.detected", { count: result.items.length }));
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
      const { image, imagePath, result } = await analyzeFacePhoto({ userId: user.id, date: recordDate, file });
      setFaceImage(image);
      setFaceResult(result);
      await saveFaceAnalysisRecord({
        userId: user.id,
        date: recordDate,
        result,
        imagePath,
        modelVersion: result.modelVersion ?? result.model_version,
      });
      setNotice(t("records.faceSaved"));
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

  if (!activeModule) {
    return (
      <div className="record-hub" ref={rootRef}>
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
                setActiveModule(id);
              }}
            >
              <span className="record-module-header">
                <strong>{t(labelKey)}</strong>
                <span className="record-module-icon" aria-hidden="true">
                  <Icon size={25} strokeWidth={1.9} />
                </span>
              </span>
              <span className="record-module-points" aria-hidden="true">
                {summaryKeys.map((key) => (
                  <span key={key}>{t(key)}</span>
                ))}
              </span>
              <ChevronRight className="record-module-arrow" size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stack record-detail" data-record-detail={activeModule} ref={rootRef}>
      <div className="record-detail-toolbar">
        <button
          className="section-icon-action record-back-button"
          type="button"
          aria-label={t("records.back")}
          title={t("records.back")}
          onClick={() => setActiveModule(null)}
        >
          <ArrowLeft size={24} />
        </button>
        <label className="record-detail-date">
          <input
            aria-label={t("records.date")}
            type="date"
            value={recordDate}
            max={todayISO()}
            onChange={(event) => setRecordDate(event.target.value)}
          />
        </label>
      </div>

      {(notice || error) && (
        <SectionCard title={notice ? t("records.synced") : t("records.needsFix")}>
          {notice && <p className="success-text">{notice}</p>}
          {error && <p className="error-text">{error}</p>}
        </SectionCard>
      )}

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
          <label className="field">
            <span>{t("records.lightSleep")}</span>
            <input inputMode="numeric" type="number" value={lightSleep} onChange={(e) => setLightSleep(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>{t("records.rem")}</span>
            <input inputMode="numeric" type="number" value={remSleep} onChange={(e) => setRemSleep(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>{t("records.rating")}</span>
            <input className="range" type="range" min="1" max="5" value={sleepRating} onChange={(e) => setSleepRating(Number(e.target.value))} />
          </label>
          <label className="field">
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
          <label className="field">
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
          <label className="photo-picker">
            {dietPhotoUrl ? <img src={dietPhotoUrl} alt="饮食照片" /> : <Camera size={28} />}
            <span>{dietAnalyzing ? t("records.aiScanning") : t("records.scanDiet")}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={dietAnalyzing}
              onChange={(e) => void handleDietPhoto(e.target.files?.[0] ?? null)}
            />
            {dietAnalyzing && <Loader2 className="spin" size={18} />}
          </label>
          {dietItems.length > 0 && (
            <div className="detected-list">
              {dietItems.map((item, index) => (
                <div key={`${item.name}-${index}`}>
                  <strong>{item.name}</strong>
                  <span>{item.amount ?? t("records.estimated")} · {item.calories ?? 0} kcal</span>
                </div>
              ))}
            </div>
          )}
          <label className="field">
            <span>{t("records.meal")}</span>
            <select value={meal} onChange={(e) => setMeal(e.target.value as typeof meal)}>
              <option value="breakfast">{t("records.breakfast")}</option>
              <option value="lunch">{t("records.lunch")}</option>
              <option value="dinner">{t("records.dinner")}</option>
              <option value="pantry">{t("records.pantry")}</option>
            </select>
          </label>
          <label className="field">
            <span>{t("records.food")}</span>
            <input value={mealName} onChange={(e) => setMealName(e.target.value)} />
          </label>
          <label className="field">
            <span>{t("records.calorie")}</span>
            <input inputMode="numeric" type="number" value={mealCalories} onChange={(e) => setMealCalories(Number(e.target.value))} />
          </label>
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
          <label className="photo-picker face">
            {faceImage ? <img src={faceImage} alt="面部照片" /> : <ScanFace size={30} />}
            <span>{faceAnalyzing ? t("records.faceScanning") : t("records.scanFace")}</span>
            <input
              aria-label={t("records.frontCamera")}
              ref={facePhotoInputRef}
              type="file"
              accept="image/*"
              capture="user"
              disabled={faceAnalyzing}
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
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
