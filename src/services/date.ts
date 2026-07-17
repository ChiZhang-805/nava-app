export function todayISO(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return todayISO(d);
}

export function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

export function minutesToText(minutes: number | null | undefined) {
  if (!minutes) return "暂无";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} 分钟`;
  if (m <= 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

