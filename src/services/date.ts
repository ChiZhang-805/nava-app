export function todayISO(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysAgoISO(days: number, reference = new Date()) {
  const d = new Date(reference);
  d.setDate(d.getDate() - days);
  return todayISO(d);
}

export function shiftDateISO(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day, 12, 0, 0);
  value.setDate(value.getDate() + days);
  return todayISO(value);
}

export function rollingDateWindow(endDate: string, days = 7) {
  const count = Math.max(1, Math.round(days));
  return Array.from({ length: count }, (_, index) => shiftDateISO(endDate, index - count + 1));
}

export function sevenDayDateRange(endDate: string) {
  return { startDate: shiftDateISO(endDate, -6), endDate };
}

export function naturalWeekDateRange(reference: Date | string = new Date()) {
  const value = typeof reference === "string"
    ? new Date(`${reference}T12:00:00`)
    : new Date(reference);
  const mondayOffset = (value.getDay() + 6) % 7;
  const monday = new Date(value);
  monday.setDate(value.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { startDate: todayISO(monday), endDate: todayISO(sunday) };
}

export type DateLocale = "zh" | "en";

export function shortDate(date: string, locale: DateLocale = "zh") {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export function minutesToText(minutes: number | null | undefined, locale: DateLocale = "zh") {
  if (!minutes) return locale === "en" ? "--" : "暂无";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (locale === "en") {
    if (h <= 0) return `${m}m`;
    if (m <= 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
  if (h <= 0) return `${m}分`;
  if (m <= 0) return `${h}小时`;
  return `${h}小时 ${m}分`;
}
