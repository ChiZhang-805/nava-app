import { supabase } from "./supabaseClient";

type SeedDay = {
  sleepStart: string;
  sleepMinutes: number;
  mood: number;
  steps: number;
  exerciseMinutes: number;
  activeCalories: number;
  focusMinutes: number;
  focusSessions: number;
  interruptions: number;
  totalCalories: number;
  hydrationMl: number;
  faceScore: number;
  note: string;
  breakfast: Array<{ name: string; amount: string; calories: number }>;
  lunch: Array<{ name: string; amount: string; calories: number }>;
  dinner: Array<{ name: string; amount: string; calories: number }>;
};

const seedDays: SeedDay[] = [
  day("00:35", 455, 76, 8240, 36, 315, 105, 3, 1, 2050, 2100, 80, "周末散步后状态不错", [food("鸡蛋", "2个", 140), food("全麦面包", "2片", 160), food("牛奶", "1杯", 120)], [food("米饭", "1碗", 230), food("番茄鸡胸肉", "1份", 360), food("炒青菜", "1份", 120)], [food("菌菇豆腐汤", "1碗", 220), food("杂粮饭", "1碗", 210), food("橙子", "1个", 80)]),
  day("01:05", 485, 81, 10320, 48, 390, 80, 2, 0, 2180, 2300, 83, "睡得较足，白天去公园走了很久", [food("燕麦酸奶", "1碗", 320), food("香蕉", "1根", 105)], [food("牛肉饭", "1份", 620), food("蔬菜沙拉", "1份", 160)], [food("清蒸鱼", "1份", 330), food("米饭", "1碗", 230), food("西兰花", "1份", 100)]),
  day("23:55", 420, 72, 7180, 28, 265, 145, 4, 2, 1980, 2000, 77, "工作日恢复正常节奏", [food("鸡蛋", "1个", 70), food("燕麦粥", "1碗", 240), food("苹果", "1个", 95)], [food("鸡肉蔬菜盖饭", "1份", 580)], [food("番茄牛肉面", "1碗", 560), food("酸奶", "1杯", 120)]),
  day("00:20", 405, 67, 6420, 22, 235, 165, 5, 3, 2110, 1900, 72, "白天任务偏多，晚上稍累", [food("全麦面包", "2片", 160), food("煎蛋", "1个", 90), food("牛奶", "1杯", 120)], [food("米饭", "1碗", 230), food("鱼香肉丝", "1份", 430), food("青菜", "1份", 110)], [food("鸡肉卷", "1份", 480), food("玉米", "1根", 140)]),
  day("00:05", 430, 74, 7860, 32, 295, 150, 4, 1, 2020, 2200, 78, "节奏平稳，午后短暂犯困", [food("酸奶麦片", "1碗", 330), food("蓝莓", "1份", 60)], [food("照烧鸡腿饭", "1份", 650), food("海带汤", "1碗", 70)], [food("豆腐蔬菜煲", "1份", 360), food("杂粮饭", "1碗", 210), food("猕猴桃", "1个", 60)]),
  day("00:45", 390, 62, 5580, 16, 205, 125, 4, 4, 2240, 1800, 69, "晚睡后专注中断次数增加", [food("鸡蛋", "2个", 140), food("吐司", "2片", 150), food("咖啡", "1杯", 20)], [food("排骨米饭", "1份", 720), food("青菜", "1份", 100)], [food("馄饨", "1碗", 430), food("凉拌黄瓜", "1份", 90)]),
  day("01:10", 365, 56, 4320, 12, 170, 95, 3, 4, 2320, 1650, 65, "连续两天睡少，下午明显疲惫", [food("拿铁", "1杯", 150), food("面包", "2片", 170)], [food("咖喱鸡饭", "1份", 720)], [food("牛肉粉", "1碗", 620), food("小番茄", "1份", 60)]),
  day("00:40", 470, 78, 9120, 42, 350, 75, 2, 0, 2060, 2350, 81, "周末补足睡眠后精神恢复", [food("蔬菜鸡蛋三明治", "1份", 390), food("牛奶", "1杯", 120)], [food("三文鱼饭", "1份", 650), food("蔬菜汤", "1碗", 90)], [food("鸡丝凉面", "1份", 500), food("桃子", "1个", 70)]),
  day("00:25", 480, 83, 11240, 55, 420, 90, 3, 1, 2210, 2400, 84, "睡眠充分并完成一次长距离步行", [food("燕麦香蕉碗", "1份", 410), food("鸡蛋", "1个", 70)], [food("虾仁炒饭", "1份", 620), food("紫菜汤", "1碗", 60)], [food("烤鸡胸", "1份", 300), food("土豆", "1份", 220), food("蔬菜沙拉", "1份", 160)]),
  day("23:50", 435, 75, 7540, 30, 280, 155, 5, 2, 2000, 2150, 79, "新一周开端较顺利", [food("小米粥", "1碗", 210), food("鸡蛋", "2个", 140)], [food("番茄牛腩饭", "1份", 660)], [food("荞麦面", "1碗", 450), food("豆腐", "1份", 140), food("青菜", "1份", 90)]),
  day("00:10", 420, 69, 6840, 24, 250, 175, 6, 3, 2140, 1950, 74, "会议和任务切换较多", [food("酸奶", "1杯", 120), food("麦片", "1份", 230), food("苹果", "1个", 95)], [food("鸡腿饭", "1份", 680), food("青菜", "1份", 100)], [food("鱼片粥", "1碗", 420), food("蒸南瓜", "1份", 130)]),
  day("00:00", 440, 77, 8360, 35, 310, 160, 5, 1, 2030, 2250, 80, "午间散步后下午专注更稳定", [food("鸡蛋蔬菜卷", "1份", 350), food("豆浆", "1杯", 110)], [food("牛肉杂粮饭", "1份", 640), food("凉拌蔬菜", "1份", 120)], [food("豆腐鱼汤", "1碗", 330), food("米饭", "1碗", 230), food("橙子", "1个", 80)]),
  day("00:15", 425, 72, 7280, 27, 270, 150, 4, 2, 2090, 2050, 76, "整体平稳，晚间有轻微疲劳", [food("燕麦粥", "1碗", 250), food("鸡蛋", "1个", 70), food("牛奶", "1杯", 120)], [food("香菇鸡肉饭", "1份", 620), food("蔬菜", "1份", 110)], [food("番茄意面", "1份", 520), food("酸奶", "1杯", 120)]),
];

export async function seedThirteenDayHistory(userId: string, anchorDate = localDate()) {
  if (!import.meta.env.DEV) throw new Error("测试数据生成器仅可在本地开发环境使用。");
  const dates = Array.from({ length: 13 }, (_, index) => shiftDate(anchorDate, index - 13));
  await assertRangeEmpty(userId, dates[0], dates[dates.length - 1]);

  const moodRows = seedDays.map((item, index) => ({
    user_id: userId,
    record_date: dates[index],
    mood_score: item.mood,
    factors: moodFactors(item),
    diary_content: item.note,
  }));
  const sleepRows = seedDays.map((item, index) => ({
    user_id: userId,
    record_date: dates[index],
    sleep_start: item.sleepStart,
    sleep_end: addMinutes(item.sleepStart, item.sleepMinutes),
    sleep_duration_minutes: item.sleepMinutes,
    deep_sleep_minutes: Math.round(item.sleepMinutes * 0.2),
    light_sleep_minutes: Math.round(item.sleepMinutes * 0.58),
    rem_minutes: Math.round(item.sleepMinutes * 0.18),
    self_rating: Math.max(1, Math.min(5, Math.round((item.mood - 35) / 10))),
    self_note: item.note,
    device_type: "manual",
    is_night_owl: Number(item.sleepStart.slice(0, 2)) <= 2,
    rhythm_score: Math.round(50 + Math.min(35, Math.max(0, (item.sleepMinutes - 330) / 4))),
  }));
  const exerciseRows = seedDays.map((item, index) => ({
    user_id: userId,
    record_date: dates[index],
    steps: item.steps,
    calories: item.activeCalories,
    exercise_minutes: item.exerciseMinutes,
    heart_rate: String(72 + (index % 5)),
    spo2: `${97 + (index % 2)}%`,
    self_rating: item.exerciseMinutes >= 35 ? 5 : item.exerciseMinutes >= 22 ? 4 : 3,
    self_note: item.note,
    device_type: "manual",
  }));
  const nutritionRows = seedDays.map((item, index) => ({
    user_id: userId,
    record_date: dates[index],
    breakfast_items: item.breakfast,
    lunch_items: item.lunch,
    dinner_items: item.dinner,
    pantry_items: [],
    total_calories: item.totalCalories,
    protein_grams: Math.round(item.totalCalories * 0.052),
    carbohydrate_grams: Math.round(item.totalCalories * 0.125),
    fat_grams: Math.round(item.totalCalories * 0.032),
    hydration_ml: item.hydrationMl,
    health_rating: item.totalCalories >= 1900 && item.totalCalories <= 2200 ? 4 : 3,
  }));
  const faceRows = seedDays.map((item, index) => ({
    user_id: userId,
    record_date: dates[index],
    image_path: null,
    overall_score: item.faceScore,
    skin_age: null,
    annotations: [{
      label: item.sleepMinutes < 400 ? "轻微疲劳信号" : "状态自然",
      desc: item.sleepMinutes < 400 ? "眼周状态与近期睡眠偏少一致" : "面部状态与当日自评基本一致",
      dot_x: 0.5,
      dot_y: 0.42,
    }],
    feedback: item.sleepMinutes < 400 ? "今天看起来稍有疲劳，优先补水并早点休息。" : "今天的面部状态较平稳，继续保持规律作息。",
    model_version: "nava-synthetic-history-v1",
    capture_mode: "bare_face",
    analysis_confidence: 0.82,
    derived_features: { synthetic: true, fatigue_signal: item.sleepMinutes < 400 },
  }));
  const tasks = seedDays.map((_, index) => ({
    id: crypto.randomUUID(),
    user_id: userId,
    title: index % 3 === 0 ? "项目整理" : index % 3 === 1 ? "阅读学习" : "课程复习",
    scheduled_date: dates[index],
    completed: true,
  }));
  const focusRows = seedDays.map((item, index) => ({
    user_id: userId,
    task_id: tasks[index].id,
    record_date: dates[index],
    completed_sessions: item.focusSessions,
    total_minutes: item.focusMinutes,
    interrupted_sessions: item.interruptions,
    category: "学习与工作",
    started_at: `${dates[index]}T09:00:00+08:00`,
    ended_at: `${dates[index]}T${String(9 + Math.floor(item.focusMinutes / 60)).padStart(2, "0")}:${String(item.focusMinutes % 60).padStart(2, "0")}:00+08:00`,
  }));

  await upsert("mood_records", moodRows);
  await upsert("sleep_records", sleepRows);
  await upsert("exercise_records", exerciseRows);
  await upsert("nutrition_records", nutritionRows);
  await upsert("face_records", faceRows);
  const taskInsert = await supabase.from("tasks").insert(tasks);
  assertNoError(taskInsert.error);
  const focusInsert = await supabase.from("focus_records").insert(focusRows);
  assertNoError(focusInsert.error);

  const rhythmResults = [];
  for (const date of dates) {
    const response = await supabase.functions.invoke("rhythm-score", { body: { date } });
    assertNoError(response.error);
    rhythmResults.push(response.data);
  }

  return { userId, startDate: dates[0], endDate: dates[dates.length - 1], anchorDate, days: dates.length, rhythmDays: rhythmResults.length };
}

async function assertRangeEmpty(userId: string, startDate: string, endDate: string) {
  const tables = ["mood_records", "sleep_records", "exercise_records", "nutrition_records", "focus_records", "face_records"];
  const checks = await Promise.all(tables.map(async (table) => {
    const response = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate);
    assertNoError(response.error);
    return { table, count: response.count ?? 0 };
  }));
  const occupied = checks.filter((item) => item.count > 0);
  if (occupied.length > 0) throw new Error(`前13天已有记录（${occupied.map((item) => item.table).join("、")}），为避免覆盖已停止生成。`);
}

async function upsert(table: string, rows: Array<Record<string, unknown>>) {
  const response = await supabase.from(table).upsert(rows, { onConflict: "user_id,record_date" });
  assertNoError(response.error);
}

function day(
  sleepStart: string,
  sleepMinutes: number,
  mood: number,
  steps: number,
  exerciseMinutes: number,
  activeCalories: number,
  focusMinutes: number,
  focusSessions: number,
  interruptions: number,
  totalCalories: number,
  hydrationMl: number,
  faceScore: number,
  note: string,
  breakfast: SeedDay["breakfast"],
  lunch: SeedDay["lunch"],
  dinner: SeedDay["dinner"],
): SeedDay {
  return { sleepStart, sleepMinutes, mood, steps, exerciseMinutes, activeCalories, focusMinutes, focusSessions, interruptions, totalCalories, hydrationMl, faceScore, note, breakfast, lunch, dinner };
}

function food(name: string, amount: string, calories: number) {
  return { name, amount, calories };
}

function moodFactors(item: SeedDay) {
  const factors = [item.sleepMinutes < 400 ? "睡眠偏少" : "睡眠", item.focusMinutes > 150 ? "任务较多" : "日常安排"];
  if (item.exerciseMinutes >= 30) factors.push("运动");
  return factors;
}

function addMinutes(clock: string, minutes: number) {
  const [hour, minute] = clock.split(":").map(Number);
  const total = (hour * 60 + minute + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function assertNoError(error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : typeof error === "object" ? JSON.stringify(error) : String(error);
  throw new Error(message);
}
