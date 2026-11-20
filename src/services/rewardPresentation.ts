import type { GrowthRewardGrant } from "./productivity";

export function rewardLabel(eventKey: string, locale: "zh" | "en") {
  const key = eventKey.split(":").pop() ?? eventKey;
  const labels: Record<string, [string, string]> = {
    foundation: ["基础画像已完善", "Profile completed"],
    goal: ["节律目标已设定", "Rhythm goal set"],
    sleep: ["睡眠记好啦", "Sleep logged"],
    exercise: ["运动目标达成啦", "Activity goal completed"],
    mood: ["心情记好啦", "Mood logged"],
    nutrition: ["这一餐记好啦", "Meal logged"],
    focus: ["这次专注完成啦", "Focus block completed"],
    face: ["面部状态记好啦", "Face check completed"],
    "bare-face-bonus": ["素颜记录加成", "Bare-face bonus"],
    task: ["今天的任务完成啦", "Daily task completed"],
    checkin: ["今天也来啦", "Daily check-in completed"],
    share: ["报告分享好啦", "Report card shared"],
    ai: ["聊完啦，进度也记下了", "AI chat completed"],
  };
  const pair = labels[key] ?? ["今天的进度记好啦", "Today's progress logged"];
  return pair[locale === "zh" ? 0 : 1];
}

export function rewardPoints(rewards: GrowthRewardGrant[]) {
  return rewards.reduce((sum, reward) => sum + Math.max(0, Math.round(reward.points)), 0);
}
/** Only maps already-awarded events to artwork; never changes the ledger. */
export function completionSceneForReward(eventKey: string, hour = new Date().getHours()): string {
  const kind = eventKey.split(":").pop() ?? "";
  const scenes: Record<string, string> = { mood: "08", nutrition: "05", exercise: "06", sleep: "07", face: "04", "bare-face-bonus": "04", focus: "02", task: "03", ai: "03" };
  return scenes[kind] ?? (hour >= 19 || hour < 6 ? "09" : "01");
}
