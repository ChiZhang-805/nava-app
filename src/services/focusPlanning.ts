export type FocusPlan = {
  focusMinutes: number;
  focusSessions: number;
};

type PlannedTodo = {
  title: string;
  focusMinutes?: number;
  focusSessions?: number;
};

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

export function suggestedFocusPlan(title: string): FocusPlan {
  if (/论文|报告|方案|项目|编程|代码|复习|学习|写作|作业|research|report|project|code|study|write|homework/i.test(title)) {
    return { focusMinutes: 45, focusSessions: 2 };
  }
  if (/整理|阅读|会议|准备|上课|review|read|meeting|prepare|class/i.test(title)) {
    return { focusMinutes: 25, focusSessions: 2 };
  }
  return { focusMinutes: 25, focusSessions: 1 };
}

export function resolveTodoFocusPlan(todo: PlannedTodo): FocusPlan & { suggested: boolean } {
  const suggestion = suggestedFocusPlan(todo.title);
  const focusMinutes = boundedInteger(todo.focusMinutes, 1, 180);
  const focusSessions = boundedInteger(todo.focusSessions, 1, 12);
  return {
    focusMinutes: focusMinutes ?? suggestion.focusMinutes,
    focusSessions: focusSessions ?? suggestion.focusSessions,
    suggested: focusMinutes == null || focusSessions == null,
  };
}

export function focusDurationChoice(minutes: number): "25" | "45" | "60" | "custom" {
  if (minutes === 25 || minutes === 45 || minutes === 60) return String(minutes) as "25" | "45" | "60";
  return "custom";
}

export function focusDifficultyPrompt(title: string, focusMinutes: number, focusSessions: number | undefined, locale: "zh" | "en") {
  const task = title.trim().slice(0, 160);
  const minutes = boundedInteger(focusMinutes, 1, 180) ?? 25;
  const sessions = boundedInteger(focusSessions, 1, 12);
  if (locale === "zh") {
    return `请评估这项任务的执行难度。任务：${task}。当前计划：每次 ${minutes} 分钟${sessions ? `，共 ${sessions} 次` : ""}。只能依据这些已提供的信息判断，不要虚构截止时间、个人能力或健康状态。按“难度：低/中/高/信息不足；依据：一句话；下一步：一个可执行动作”回答。如果信息不足，请先问我一个关键问题。你的回答只是建议，不要声称已修改或保存我的待办。`;
  }
  return `Assess the difficulty of this task. Task: ${task}. Current plan: ${minutes} minutes per session${sessions ? `, ${sessions} sessions` : ""}. Use only the information provided; do not invent a deadline, ability, or health status. Answer with “Difficulty: low/medium/high/insufficient information; Basis: one sentence; Next step: one concrete action.” If information is insufficient, ask one key question first. This is advice only; do not claim you changed or saved my task.`;
}
