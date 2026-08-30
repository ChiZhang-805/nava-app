export type HistoryReportModule = "mood" | "sleep" | "exercise" | "diet" | "focus" | "face";

export type HistoryReportEntry = {
  date: string;
  value: number | null;
};

const moduleDataLabels: Record<HistoryReportModule, { zh: string; en: string }> = {
  mood: { zh: "情绪数据", en: "mood data" },
  sleep: { zh: "睡眠数据", en: "sleep data" },
  exercise: { zh: "运动数据", en: "activity data" },
  diet: { zh: "饮食数据", en: "diet data" },
  focus: { zh: "专注数据", en: "focus data" },
  face: { zh: "面部数据", en: "face data" },
};

export function hasCurrentDayRecord(entries: readonly HistoryReportEntry[], deviceDate: string) {
  return entries.some((entry) => entry.date === deviceDate && entry.value != null);
}

export function missingCurrentDayCopy(module: HistoryReportModule, locale: "zh" | "en") {
  const label = moduleDataLabels[module][locale];
  return locale === "zh"
    ? `今天的${label}还没填写呀～`
    : `No ${label} has been recorded today yet`;
}

export function currentDayRequiredShareCopy(module: HistoryReportModule, locale: "zh" | "en") {
  const label = moduleDataLabels[module][locale];
  return locale === "zh"
    ? `完成今日${label}后可分享`
    : `Add today's ${label} to share`;
}
