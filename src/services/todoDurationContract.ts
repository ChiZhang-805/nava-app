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
