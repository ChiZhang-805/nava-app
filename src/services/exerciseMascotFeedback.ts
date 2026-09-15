import type { TodaySnapshot } from "../types.ts";
import type { ExerciseSession } from "./exerciseSession.ts";
import { exerciseStageAt } from "./exerciseStages.ts";

/** Rule-based encouragement. Saved facts are not live sensors or AI diagnoses. */
export function exerciseMascotFeedback(session: ExerciseSession, elapsedSeconds: number, snapshot: TodaySnapshot | null, date: string, locale: "zh" | "en") {
  const zh = locale === "zh";
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const minute = Math.floor(elapsed / 60);
  const stage = exerciseStageAt(session, elapsed);
  const started = new Date(session.startedAt);
  const sessionDate = `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, "0")}-${String(started.getDate()).padStart(2, "0")}`;
  const current = sessionDate === date && snapshot?.date === date ? snapshot : null;
  const activity = current?.exercise?.record_date === date ? current.exercise : null;
  const sleep = current?.sleep?.record_date === date ? current.sleep.sleep_duration_minutes : null;
  const mood = current?.mood?.record_date === date ? current.mood.mood_score : null;
  const caution = activity?.has_injury === true || (activity?.fatigue_level ?? 0) >= 7 || (activity?.soreness_level ?? 0) >= 7 || activity?.recovery_status === "not_recovered";
  const facts = caution
    ? (zh ? "已记录不适、疲劳或尚未恢复；这次以休息和舒适为先。" : "You logged discomfort, fatigue or incomplete recovery. Prioritize rest and comfort.")
    : sleep != null && Number.isFinite(sleep)
      ? (zh ? `已记录睡眠 ${Math.floor(sleep / 60)} 小时 ${Math.round(sleep % 60)} 分；按此刻感受调整节奏。` : `Logged sleep: ${Math.floor(sleep / 60)}h ${Math.round(sleep % 60)}m. Adjust to how you feel now.`)
      : mood != null && Number.isFinite(mood)
        ? (zh ? `已记录情绪 ${mood} 分；留意运动中的感受，不必追求速度。` : `Logged mood: ${mood}. Notice how movement feels; no need to chase speed.`)
        : null;
  const evidence = facts ? `${date} · ${facts}` : (zh ? "依据本次计时与计划；没有实时心率或体力测量。" : "Based on this timer and plan, not live heart-rate or energy measurements.");
  if (!session.runningSince) return { state: "paused", message: zh ? `已经暂停，${minute} 分钟的计时保留。准备好后再继续。` : `Paused at ${minute} minutes. Resume only when you feel ready.`, evidence };
  if (elapsed >= session.plannedMinutes * 60) return { state: "complete", message: zh ? "计划时长已到！可以结束，核对感受后再保存记录。" : "Planned time reached! Finish, review how you feel, then save your entry.", evidence };
  if (caution) return { state: "caution", message: zh ? "我陪你放慢一点。有不适就暂停，不需要勉强完成计划。" : "Let's slow down. Pause if uncomfortable; you do not have to complete this plan.", evidence };
  if (!stage) return { state: "unverified-stage", message: zh ? `已进行 ${minute} 分钟。旧计划未标注各阶段时长，按感受继续或休息。` : `${minute} minutes elapsed. This older plan has no stage timing; continue or rest by feel.`, evidence };
  const messages = stage.index === 0
    ? (zh ? ["先舒展一下，慢慢进入自己的节奏。", "不用急着加速，给身体一点热身时间。"] : ["Ease into movement at your own pace.", "No need to rush. Allow time to warm up."])
    : stage.index === session.steps.length - 1
      ? (zh ? ["进入最后一段，慢慢放松，留意自己的感受。", "节奏放缓一点，舒舒服服地收尾。"] : ["In the final stage, ease off and notice how you feel.", "Slow the pace and finish comfortably."])
      : (zh ? ["正在计划中段，保持舒服的节奏就好。", "我在这里陪你，觉得累了随时暂停。"] : ["In the middle stage, keep a comfortable pace.", "I'm here with you. Pause whenever you need."]);
  return { state: `stage-${stage.index}`, message: messages[minute % messages.length], evidence };
}
