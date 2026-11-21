export function parseTodoDurationEstimate(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid_duration_estimate");
  const text = value.trim();
  const match = text.match(/DURATION_SECONDS\s*[:=]\s*["']?(\d{1,6})(?![\d.])["']?/iu)
    ?? text.match(/["']?(?:duration_?seconds|seconds)["']?\s*:\s*["']?(\d{1,6})(?![\d.])["']?/iu);
  if (!match) throw new Error("invalid_duration_estimate");
  const seconds = Number(match[1]);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 359_999) throw new Error("invalid_duration_estimate");
  return seconds;
}

function boundedDuration(seconds: number) {
  const rounded = Math.round(seconds);
  return Number.isFinite(rounded) && rounded >= 1 && rounded <= 359_999 ? rounded : null;
}

/** Returns an exact duration only when the task itself explicitly states one. */
export function parseExplicitTodoDuration(value: string) {
  const text = value.normalize("NFKC");
  let seconds = 0;
  let matched = false;
  const units: Array<[RegExp, number]> = [
    [/(\d+(?:\.\d+)?)\s*(?:个)?(?:小时|钟头|hours?|hrs?|hr|h)(?![a-z])/giu, 3600],
    [/(\d+(?:\.\d+)?)\s*(?:分钟|minutes?|mins?|min|m)(?![a-z])/giu, 60],
    [/(\d+(?:\.\d+)?)\s*(?:秒钟|秒|seconds?|secs?|sec|s)(?![a-z])/giu, 1],
  ];
  for (const [pattern, multiplier] of units) {
    for (const match of text.matchAll(pattern)) {
      seconds += Number(match[1]) * multiplier;
      matched = true;
    }
  }
  return matched ? boundedDuration(seconds) : null;
}

// 2025 American Time Use Survey, Table 1, all participants who did the
// activity on the diary day. These are daily totals, not single-task times.
const activityReferences = [
  { match: /(?:做饭|备餐|烹饪|食材准备|\bcook(?:ing)?\b|meal prep)/iu, activity: "food preparation and cleanup", hours: 1.09 },
  { match: /(?:做家务|清洁房间|打扫|洗衣|\bhousework\b|\bcleaning\b|\blaundry\b)/iu, activity: "housework", hours: 1.55 },
  { match: /(?:购物|采购|买菜|\bshopping\b|\bgroceries\b)/iu, activity: "consumer goods purchases", hours: 0.87 },
  { match: /(?:家庭财务|账单|\bbills\b|\bhousehold budget\b)/iu, activity: "household management", hours: 0.92 },
  { match: /(?:写作业|课程作业|\bhomework\b)/iu, activity: "homework and research", hours: 3.11 },
  { match: /(?:跑步|有氧|锻炼|健身|\bjog(?:ging)?\b|\bworkout\b|\bexercise\b)/iu, activity: "sports, exercise and recreation", hours: 1.47 },
  { match: /(?:个人邮件|打电话|\bpersonal emails?\b|\bphone calls?\b)/iu, activity: "telephone calls, mail and email", hours: 1.01 },
];

export function durationActivityReference(task: string) {
  const matches = activityReferences.filter(row => row.match.test(task));
  if (matches.length !== 1) return null;
  const { activity, hours } = matches[0];
  return { source: "US BLS ATUS 2025", activity, participantDayMeanMinutes: Math.round(hours * 60) };
}

type FocusDurationRow = { fields: Record<string, unknown> | null; focus: Record<string, unknown> | null };

export function matchedFocusDuration(task: string, rows: FocusDurationRow[]) {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const title = normalize(task);
  if (title.length < 3) return null;
  const durations: number[] = [];
  for (const row of rows) {
    const priorTask = row.fields?.task;
    const elapsedMs = row.focus?.elapsedMs;
    if (typeof priorTask !== "string" || normalize(priorTask) !== title
      || row.focus?.provenance === "self-reported" || !row.focus?.startedAt || !row.focus?.endedAt
      || typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 60_000 || elapsedMs > 480 * 60_000) continue;
    durations.push(Math.round(elapsedMs / 1000));
  }
  if (durations.length < 2) return null;
  durations.sort((a, b) => a - b);
  return {
    samples: durations.length,
    medianSessionSeconds: Math.round((durations[Math.floor(durations.length / 2)] + durations[Math.floor((durations.length - 1) / 2)]) / 2),
  };
}

/** Stable, conservative fallback used only when the authenticated model boundary is unavailable. */
export function fallbackTodoDurationSeconds(value: string) {
  const text = value.trim().toLowerCase();
  const categories: Array<[RegExp, number]> = [
    [/(跑|有氧|锻炼|健身|运动|run|cardio|workout|exercise)/iu, 47],
    [/(论文|阅读|读书|文献|paper|read|article)/iu, 33],
    [/(整理|收拾|清洁|打扫|organize|tidy|clean)/iu, 41],
    [/(报告|方案|写作|撰写|report|proposal|write)/iu, 52],
    [/(学习|复习|练习|study|review|practice)/iu, 43],
    [/(会议|沟通|讨论|meeting|discuss|call)/iu, 37],
    [/(邮件|回复|消息|email|reply|message)/iu, 18],
    [/(购物|采购|买|shop|grocery|buy)/iu, 32],
    [/(做饭|备餐|烹饪|cook|meal prep)/iu, 46],
  ];
  const baseMinutes = categories.find(([pattern]) => pattern.test(text))?.[1] ?? 31;
  const hash = Array.from(text).reduce((total, character) => (total * 31 + (character.codePointAt(0) ?? 0)) % 997, 0);
  let minutes = Math.max(8, Math.min(180, baseMinutes + (hash % 7) - 3));
  if (minutes % 5 === 0) minutes += hash % 2 === 0 ? 1 : -1;
  return minutes * 60;
}
