import type { GrowthRewardGrant } from "./productivity";

export function rewardLabel(eventKey: string, locale: "zh" | "en") {
  const key = eventKey.split(":").pop() ?? eventKey;
  const labels: Record<string, [string, string]> = {
    foundation: ["基础画像已完善", "Profile completed"],
    goal: ["节律目标已设定", "Rhythm goal set"],
    sleep: ["睡眠记录完成", "Sleep logged"],
    exercise: ["运动目标完成", "Activity goal completed"],
    mood: ["情绪记录完成", "Mood logged"],
    nutrition: ["饮食记录完成", "Meal logged"],
    focus: ["专注任务完成", "Focus block completed"],
    face: ["面部记录完成", "Face check completed"],
    "bare-face-bonus": ["素颜记录加成", "Bare-face bonus"],
    task: ["今日任务完成", "Daily task completed"],
    checkin: ["今日登录打卡完成", "Daily check-in completed"],
    share: ["报告卡片分享完成", "Report card shared"],
    ai: ["AI 对话任务完成", "AI chat completed"],
  };
  const pair = labels[key] ?? ["今日进度已记录", "Today's progress logged"];
  return pair[locale === "zh" ? 0 : 1];
}

export function rewardPoints(rewards: GrowthRewardGrant[]) {
  return rewards.reduce((sum, reward) => sum + Math.max(0, Math.round(reward.points)), 0);
}
