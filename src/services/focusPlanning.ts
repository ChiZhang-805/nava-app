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

export type { FocusTask as PriorityTask } from "../../supabase/functions/_shared/focus-contract.ts";
