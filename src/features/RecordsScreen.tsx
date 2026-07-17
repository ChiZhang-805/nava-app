import type { User } from "@supabase/supabase-js";
import { BedDouble, Brain, Camera, Check, Drumstick, Dumbbell, Loader2, ScanFace, SmilePlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import {
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveFaceAnalysisRecord,
  saveNutritionItems,
  saveNutritionRecord,
  saveSleepRecord,
} from "../services/records";
import { todayISO } from "../services/date";
import { analyzeDietPhoto, analyzeFacePhoto } from "../services/media";
import type { FaceAnalysisResult, FoodItem } from "../types";

const moodFactors = ["压力", "睡眠", "运动", "饮食", "工作", "社交", "身体不适", "天气"];

export default function RecordsScreen({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recordDate, setRecordDate] = useState(todayISO());

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
  const [dietItems, setDietItems] = useState<FoodItem[]>([]);
  const [dietAnalyzing, setDietAnalyzing] = useState(false);

  const [focusTitle, setFocusTitle] = useState("产品原型");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [faceResult, setFaceResult] = useState<FaceAnalysisResult | null>(null);
  const [faceAnalyzing, setFaceAnalyzing] = useState(false);

  useEffect(() => {
    const estimated = estimateMinutes(sleepStart, sleepEnd);
    if (estimated > 0) setSleepDuration(estimated);
  }, [sleepStart, sleepEnd]);

  function estimateMinutes(start: string, end: string) {
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return 0;
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin <= startMin) endMin += 24 * 60;
    return endMin - startMin;
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setNotice(null);
    setError(null);
    try {
      await fn();
      setNotice(`${label}已保存。现在可以回到 Web 端验证同一账号的数据。`);
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
    await run("情绪记录", () =>
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
    await run("睡眠记录", () =>
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
    await run("运动记录", () =>
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
      await run("饮食识别记录", () =>
        saveNutritionItems({
          userId: user.id,
          date: recordDate,
          meal,
          items: dietItems,
          photoUrl: dietPhotoUrl ?? undefined,
        }),
      );
      return;
    }

    await run("饮食记录", () =>
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
      setDietItems(result.items);
      if (result.items[0]) {
        setMealName(result.items[0].name);
        setMealCalories(Number(result.items[0].calories) || mealCalories);
      }
      setNotice(`已识别 ${result.items.length} 项食物，确认后可保存到 Web 同源数据。`);
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
      const { image, result } = await analyzeFacePhoto(file);
      setFaceImage(image);
      setFaceResult(result);
      await saveFaceAnalysisRecord({ userId: user.id, date: recordDate, result });
      setNotice("面部分析已完成，并已保存到 face_records。");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFaceAnalyzing(false);
    }
  }

  async function saveFocus(event: FormEvent) {
    event.preventDefault();
    await run("专注记录", () =>
      saveFocusSession({
        userId: user.id,
        date: recordDate,
        taskTitle: focusTitle,
        minutes: focusMinutes,
      }),
    );
  }

  return (
    <div className="stack">
      <SectionCard title="闭环验证" subtitle="先保存情绪记录，Web 端同账号可直接看到">
        <p className="plain-text">
          第一条闭环用 `mood_records` 表验证。它有唯一约束和 RLS，最适合确认 Web、App、Supabase 三端是否真正互通。
        </p>
        {notice && <p className="success-text">{notice}</p>}
        {error && <p className="error-text">{error}</p>}
      </SectionCard>

      <SectionCard title="记录日期" subtitle="App 和 Web 使用同一条 record_date">
        <label className="field">
          <span>日期</span>
          <input type="date" value={recordDate} max={todayISO()} onChange={(e) => setRecordDate(e.target.value)} />
        </label>
      </SectionCard>

      <form onSubmit={saveMood}>
        <SectionCard title="情绪" subtitle="写入 mood_records">
          <div className="module-title">
            <SmilePlus size={20} />
            <strong>{moodScore}</strong>
          </div>
          <input className="range" type="range" min="0" max="100" value={moodScore} onChange={(e) => setMoodScore(Number(e.target.value))} />
          <div className="chip-grid">
            {moodFactors.map((factor) => (
              <button
                className={selectedFactors.includes(factor) ? "chip selected" : "chip"}
                key={factor}
                type="button"
                onClick={() => toggleFactor(factor)}
              >
                {factor}
              </button>
            ))}
          </div>
          <label className="field">
            <span>日记</span>
            <textarea value={diary} onChange={(e) => setDiary(e.target.value)} placeholder="今天影响情绪的主要事情" rows={3} />
          </label>
          <ActionButton type="submit" icon={<Check size={18} />} disabled={busy === "情绪记录"}>
            保存情绪
          </ActionButton>
        </SectionCard>
      </form>

      <form onSubmit={saveSleep}>
        <SectionCard title="睡眠" subtitle="写入 sleep_records">
          <div className="two-col">
            <label className="field">
              <span>入睡</span>
              <input type="time" value={sleepStart} onChange={(e) => setSleepStart(e.target.value)} />
            </label>
            <label className="field">
              <span>醒来</span>
              <input type="time" value={sleepEnd} onChange={(e) => setSleepEnd(e.target.value)} />
            </label>
          </div>
          <div className="two-col">
            <label className="field">
              <span>总分钟</span>
              <input inputMode="numeric" type="number" value={sleepDuration} onChange={(e) => setSleepDuration(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>深睡</span>
              <input inputMode="numeric" type="number" value={deepSleep} onChange={(e) => setDeepSleep(Number(e.target.value))} />
            </label>
          </div>
          <label className="field">
            <span>浅睡分钟</span>
            <input inputMode="numeric" type="number" value={lightSleep} onChange={(e) => setLightSleep(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>REM 分钟</span>
            <input inputMode="numeric" type="number" value={remSleep} onChange={(e) => setRemSleep(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>自评</span>
            <input className="range" type="range" min="1" max="5" value={sleepRating} onChange={(e) => setSleepRating(Number(e.target.value))} />
          </label>
          <label className="field">
            <span>备注</span>
            <textarea rows={2} value={sleepNote} onChange={(e) => setSleepNote(e.target.value)} placeholder="例如：半夜醒了一次" />
          </label>
          <ActionButton type="submit" icon={<BedDouble size={18} />} variant="secondary" disabled={busy === "睡眠记录"}>
            保存睡眠
          </ActionButton>
        </SectionCard>
      </form>

      <form onSubmit={saveExercise}>
        <SectionCard title="运动" subtitle="写入 exercise_records">
          <div className="two-col">
            <label className="field">
              <span>步数</span>
              <input inputMode="numeric" type="number" value={steps} onChange={(e) => setSteps(Number(e.target.value))} />
            </label>
            <label className="field">
              <span>消耗 kcal</span>
              <input inputMode="numeric" type="number" value={calories} onChange={(e) => setCalories(Number(e.target.value))} />
            </label>
          </div>
          <label className="field">
            <span>运动分钟</span>
            <input inputMode="numeric" type="number" value={exerciseMinutes} onChange={(e) => setExerciseMinutes(Number(e.target.value))} />
          </label>
          <div className="two-col">
            <label className="field">
              <span>心率</span>
              <input inputMode="numeric" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} placeholder="bpm" />
            </label>
            <label className="field">
              <span>血氧</span>
              <input value={spo2} onChange={(e) => setSpo2(e.target.value)} placeholder="98%" />
            </label>
          </div>
          <label className="field">
            <span>备注</span>
            <textarea rows={2} value={exerciseNote} onChange={(e) => setExerciseNote(e.target.value)} placeholder="例如：户外步行" />
          </label>
          <ActionButton type="submit" icon={<Dumbbell size={18} />} variant="secondary" disabled={busy === "运动记录"}>
            保存运动
          </ActionButton>
        </SectionCard>
      </form>

      <form onSubmit={saveDiet}>
        <SectionCard title="饮食" subtitle="写入 nutrition_records">
          <label className="photo-picker">
            {dietPhotoUrl ? <img src={dietPhotoUrl} alt="饮食照片" /> : <Camera size={28} />}
            <span>{dietAnalyzing ? "AI 识别中" : "拍照识别饮食"}</span>
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
                  <span>{item.amount ?? "估算"} · {item.calories ?? 0} kcal</span>
                </div>
              ))}
            </div>
          )}
          <label className="field">
            <span>餐次</span>
            <select value={meal} onChange={(e) => setMeal(e.target.value as typeof meal)}>
              <option value="breakfast">早餐</option>
              <option value="lunch">午餐</option>
              <option value="dinner">晚餐</option>
              <option value="pantry">加餐</option>
            </select>
          </label>
          <label className="field">
            <span>食物</span>
            <input value={mealName} onChange={(e) => setMealName(e.target.value)} />
          </label>
          <label className="field">
            <span>热量</span>
            <input inputMode="numeric" type="number" value={mealCalories} onChange={(e) => setMealCalories(Number(e.target.value))} />
          </label>
          <ActionButton type="submit" icon={<Drumstick size={18} />} variant="secondary" disabled={busy === "饮食记录"}>
            {dietItems.length > 0 ? "保存识别结果" : "保存饮食"}
          </ActionButton>
        </SectionCard>
      </form>

      <form onSubmit={saveFocus}>
        <SectionCard title="专注" subtitle="创建 task 并写入 focus_records">
          <label className="field">
            <span>任务</span>
            <input value={focusTitle} onChange={(e) => setFocusTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>分钟</span>
            <input inputMode="numeric" type="number" value={focusMinutes} onChange={(e) => setFocusMinutes(Number(e.target.value))} />
          </label>
          <ActionButton type="submit" icon={<Brain size={18} />} variant="secondary" disabled={busy === "专注记录"}>
            保存专注
          </ActionButton>
        </SectionCard>
      </form>

      <SectionCard title="面部分析" subtitle="调用 face-analyze 并写入 face_records">
        <label className="photo-picker face">
          {faceImage ? <img src={faceImage} alt="面部照片" /> : <ScanFace size={30} />}
          <span>{faceAnalyzing ? "AI 分析中" : "拍照分析面部状态"}</span>
          <input
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
            <strong>{Math.round(faceResult.overall_score)} 分</strong>
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
  );
}
