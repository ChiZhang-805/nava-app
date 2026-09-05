import type { TodaySnapshot } from "../types";
import type { NavaNotificationItem } from "./notifications";

export interface ContextualNotificationDraft extends Omit<NavaNotificationItem, "createdAt" | "source"> {
  hour: number;
}

function hasCompleteMood(snapshot: TodaySnapshot) {
  return Boolean(snapshot.mood && snapshot.mood.factors.length > 0 && snapshot.mood.diary_content?.trim());
}

export function buildContextualNotificationDrafts(snapshot: TodaySnapshot, hour: number, locale: "zh" | "en" = "zh"): ContextualNotificationDraft[] {
  const zh = locale === "zh";
  const drafts: ContextualNotificationDraft[] = [];
  const add = (draft: ContextualNotificationDraft) => drafts.push(draft);

  if (hour >= 9 && !snapshot.sleep) add({ id: `context:${snapshot.date}:sleep`, category: "sleep", hour: 9, title: zh ? "补充昨晚睡眠" : "Add last night's sleep", body: zh ? "记录睡眠后，NAVA 才能更准确地校准今天的节律。" : "A sleep record helps NAVA calibrate today's rhythm.", target: { tab: "record", module: "sleep", view: "editor" } });
  if (hour >= 12 && !snapshot.nutrition) add({ id: `context:${snapshot.date}:nutrition`, category: "nutrition", hour: 12, title: zh ? "别忘了记录一餐" : "Remember a meal", body: zh ? "拍照或手动补充饮食，之后还能和活动消耗一起查看。" : "Capture or add a meal to compare it with activity.", target: { tab: "record", module: "diet", view: "editor" } });
  if (hour >= 17 && (!snapshot.exercise || (snapshot.exercise.steps ?? 0) < 3_000)) add({ id: `context:${snapshot.date}:exercise`, category: "exercise", hour: 17, title: zh ? "今天动得有点少" : "A little more movement", body: zh ? "如果身体感觉合适，可以安排 10 分钟轻步行。" : "If it feels right, consider a gentle 10-minute walk.", target: { tab: "record", module: "exercise", view: null } });
  if (hour >= 18 && !hasCompleteMood(snapshot)) add({ id: `context:${snapshot.date}:mood`, category: "mood", hour: 18, title: zh ? "给今天的心情留句话" : "Check in with your mood", body: zh ? "选一个感受和主要原因，完成今天的情绪记录。" : "Choose a feeling and its main factor to complete today.", target: { tab: "record", module: "mood", view: "editor" } });
  if (hour >= 10 && snapshot.focusMinutes < 25) add({ id: `context:${snapshot.date}:focus`, category: "focus", hour: 10, title: zh ? "安排一个专注块" : "Plan a focus block", body: zh ? "从 25 分钟开始，让今天的节律更稳定。" : "Start with 25 minutes to steady today's rhythm.", target: { tab: "record", module: "focus", view: null } });
  if (hour >= 20 && !snapshot.face) add({ id: `context:${snapshot.date}:face`, category: "face", hour: 20, title: zh ? "记录今天的面部状态" : "Capture today's face status", body: zh ? "在光线稳定时拍一张，结果只用于非诊断趋势记录。" : "Capture in steady light for non-diagnostic trend tracking.", target: { tab: "record", module: "face", view: "editor" } });
  if (hour >= 11 && (snapshot.rhythmAnomalyCount ?? 0) > 0 && snapshot.nextAction.trim()) add({ id: `context:${snapshot.date}:rhythm`, category: "system", hour: 11, title: zh ? "今天有一项状态值得留意" : "One signal deserves attention", body: snapshot.nextAction, target: { tab: "record", view: "weekly" } });

  return drafts.sort((left, right) => right.hour - left.hour).slice(0, 4);
}
