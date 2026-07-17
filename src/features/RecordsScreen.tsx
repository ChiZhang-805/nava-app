import type { User } from "@supabase/supabase-js";
import { BedDouble, Brain, Check, Drumstick, Dumbbell, SmilePlus } from "lucide-react";
import { FormEvent, useState } from "react";
import ActionButton from "../components/ActionButton";
import SectionCard from "../components/SectionCard";
import {
  saveExerciseRecord,
  saveFocusSession,
  saveMoodRecord,
  saveNutritionRecord,
  saveSleepRecord,
} from "../services/records";

const moodFactors = ["压力", "睡眠", "运动", "饮食", "工作", "社交", "身体不适", "天气"];

export default function RecordsScreen({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [moodScore, setMoodScore] = useState(70);
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [diary, setDiary] = useState("");

  const [sleepStart, setSleepStart] = useState("23:30");
  const [sleepEnd, setSleepEnd] = useState("07:10");
  const [sleepDuration, setSleepDuration] = useState(460);
  const [deepSleep, setDeepSleep] = useState(85);
  const [remSleep, setRemSleep] = useState(95);

  const [steps, setSteps] = useState(6500);
  const [calories, setCalories] = useState(420);
  const [exerciseMinutes, setExerciseMinutes] = useState(38);

  const [mealName, setMealName] = useState("鸡胸肉沙拉");
  const [mealCalories, setMealCalories] = useState(520);

  const [focusTitle, setFocusTitle] = useState("产品原型");
  const [focusMinutes, setFocusMinutes] = useState(25);

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
        start: sleepStart,
        end: sleepEnd,
        durationMinutes: sleepDuration,
        deepMinutes: deepSleep,
        remMinutes: remSleep,
        rating: 4,
      }),
    );
  }

  async function saveExercise(event: FormEvent) {
    event.preventDefault();
    await run("运动记录", () =>
      saveExerciseRecord({
        userId: user.id,
        steps,
        calories,
        minutes: exerciseMinutes,
        source: "manual",
      }),
    );
  }

  async function saveDiet(event: FormEvent) {
    event.preventDefault();
    await run("饮食记录", () =>
      saveNutritionRecord({
        userId: user.id,
        meal: "lunch",
        item: {
          name: mealName,
          calories: mealCalories,
          amount: "1 份",
        },
        totalCalories: mealCalories,
      }),
    );
  }

  async function saveFocus(event: FormEvent) {
    event.preventDefault();
    await run("专注记录", () =>
      saveFocusSession({
        userId: user.id,
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
            <span>REM 分钟</span>
            <input inputMode="numeric" type="number" value={remSleep} onChange={(e) => setRemSleep(Number(e.target.value))} />
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
          <ActionButton type="submit" icon={<Dumbbell size={18} />} variant="secondary" disabled={busy === "运动记录"}>
            保存运动
          </ActionButton>
        </SectionCard>
      </form>

      <form onSubmit={saveDiet}>
        <SectionCard title="饮食" subtitle="写入 nutrition_records">
          <label className="field">
            <span>食物</span>
            <input value={mealName} onChange={(e) => setMealName(e.target.value)} />
          </label>
          <label className="field">
            <span>热量</span>
            <input inputMode="numeric" type="number" value={mealCalories} onChange={(e) => setMealCalories(Number(e.target.value))} />
          </label>
          <ActionButton type="submit" icon={<Drumstick size={18} />} variant="secondary" disabled={busy === "饮食记录"}>
            保存饮食
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
    </div>
  );
}

