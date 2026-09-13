import { createClient } from "@supabase/supabase-js";
import { applyProjectPublicEnv } from "./project-env.mjs";

applyProjectPublicEnv();

const email = process.env.NAVA_ACCOUNT_EMAIL;
const password = process.env.NAVA_ACCOUNT_PASSWORD;
const anchorDate = argument("anchor") ?? localDate();
const skipFace = argument("skip-face") === "true";
if (!email || !password) throw new Error("请通过 NAVA_ACCOUNT_EMAIL 和 NAVA_ACCOUNT_PASSWORD 提供目标账号。");
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) throw new Error("请提供 --anchor=YYYY-MM-DD。");

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const auth = await supabase.auth.signInWithPassword({ email, password });
if (auth.error) throw auth.error;
const userId = auth.data.user.id;
const dates = Array.from({ length: 13 }, (_, index) => shiftDate(anchorDate, index - 13));
const startDate = dates[0];
const endDate = dates.at(-1);

const daily = [
  d("00:35",455,76,8240,36,315,105,3,1,2050,2100,80,"周末散步后状态不错"),
  d("01:05",485,81,10320,48,390,80,2,0,2180,2300,83,"睡得较足，白天去公园走了很久"),
  d("23:55",420,72,7180,28,265,145,4,2,1980,2000,77,"工作日恢复正常节奏"),
  d("00:20",405,67,6420,22,235,165,5,3,2110,1900,72,"白天任务偏多，晚上稍累"),
  d("00:05",430,74,7860,32,295,150,4,1,2020,2200,78,"节奏平稳，午后短暂犯困"),
  d("00:45",390,62,5580,16,205,125,4,4,2240,1800,69,"晚睡后专注中断次数增加"),
  d("01:10",365,56,4320,12,170,95,3,4,2320,1650,65,"连续两天睡少，下午明显疲惫"),
  d("00:40",470,78,9120,42,350,75,2,0,2060,2350,81,"周末补足睡眠后精神恢复"),
  d("00:25",480,83,11240,55,420,90,3,1,2210,2400,84,"睡眠充分并完成一次长距离步行"),
  d("23:50",435,75,7540,30,280,155,5,2,2000,2150,79,"新一周开端较顺利"),
  d("00:10",420,69,6840,24,250,175,6,3,2140,1950,74,"会议和任务切换较多"),
  d("00:00",440,77,8360,35,310,160,5,1,2030,2250,80,"午间散步后下午专注更稳定"),
  d("00:15",425,72,7280,27,270,150,4,2,2090,2050,76,"整体平稳，晚间有轻微疲劳"),
];

const mealPlans = [
  meals([f("鸡蛋","2个",140),f("全麦面包","2片",160),f("牛奶","1杯",120)],[f("米饭","1碗",230),f("番茄鸡胸肉","1份",360),f("炒青菜","1份",120)],[f("菌菇豆腐汤","1碗",220),f("杂粮饭","1碗",210),f("橙子","1个",80)]),
  meals([f("燕麦酸奶","1碗",320),f("香蕉","1根",105)],[f("牛肉饭","1份",620),f("蔬菜沙拉","1份",160)],[f("清蒸鱼","1份",330),f("米饭","1碗",230),f("西兰花","1份",100)]),
  meals([f("鸡蛋","1个",70),f("燕麦粥","1碗",240),f("苹果","1个",95)],[f("鸡肉蔬菜盖饭","1份",580)],[f("番茄牛肉面","1碗",560),f("酸奶","1杯",120)]),
  meals([f("全麦面包","2片",160),f("煎蛋","1个",90),f("牛奶","1杯",120)],[f("米饭","1碗",230),f("鱼香肉丝","1份",430),f("青菜","1份",110)],[f("鸡肉卷","1份",480),f("玉米","1根",140)]),
  meals([f("酸奶麦片","1碗",330),f("蓝莓","1份",60)],[f("照烧鸡腿饭","1份",650),f("海带汤","1碗",70)],[f("豆腐蔬菜煲","1份",360),f("杂粮饭","1碗",210),f("猕猴桃","1个",60)]),
  meals([f("鸡蛋","2个",140),f("吐司","2片",150),f("咖啡","1杯",20)],[f("排骨米饭","1份",720),f("青菜","1份",100)],[f("馄饨","1碗",430),f("凉拌黄瓜","1份",90)]),
  meals([f("拿铁","1杯",150),f("面包","2片",170)],[f("咖喱鸡饭","1份",720)],[f("牛肉粉","1碗",620),f("小番茄","1份",60)]),
  meals([f("蔬菜鸡蛋三明治","1份",390),f("牛奶","1杯",120)],[f("三文鱼饭","1份",650),f("蔬菜汤","1碗",90)],[f("鸡丝凉面","1份",500),f("桃子","1个",70)]),
  meals([f("燕麦香蕉碗","1份",410),f("鸡蛋","1个",70)],[f("虾仁炒饭","1份",620),f("紫菜汤","1碗",60)],[f("烤鸡胸","1份",300),f("土豆","1份",220),f("蔬菜沙拉","1份",160)]),
  meals([f("小米粥","1碗",210),f("鸡蛋","2个",140)],[f("番茄牛腩饭","1份",660)],[f("荞麦面","1碗",450),f("豆腐","1份",140),f("青菜","1份",90)]),
  meals([f("酸奶","1杯",120),f("麦片","1份",230),f("苹果","1个",95)],[f("鸡腿饭","1份",680),f("青菜","1份",100)],[f("鱼片粥","1碗",420),f("蒸南瓜","1份",130)]),
  meals([f("鸡蛋蔬菜卷","1份",350),f("豆浆","1杯",110)],[f("牛肉杂粮饭","1份",640),f("凉拌蔬菜","1份",120)],[f("豆腐鱼汤","1碗",330),f("米饭","1碗",230),f("橙子","1个",80)]),
  meals([f("燕麦粥","1碗",250),f("鸡蛋","1个",70),f("牛奶","1杯",120)],[f("香菇鸡肉饭","1份",620),f("蔬菜","1份",110)],[f("番茄意面","1份",520),f("酸奶","1杯",120)]),
];

try {
  const existing = await existingDates();
  const taskResult = await supabase.from("tasks").select("id,scheduled_date").eq("user_id", userId).gte("scheduled_date", startDate).lte("scheduled_date", endDate);
  assertResult(taskResult);
  const taskByDate = new Map((taskResult.data ?? []).map((row) => [row.scheduled_date, row.id]));
  const inserted = {};

  inserted.mood_records = await insertMissing("mood_records", dates.map((date, index) => ({
    user_id: userId, record_date: date, mood_score: daily[index].mood,
    factors: moodFactors(daily[index]), diary_content: daily[index].note,
    created_at: timestamp(date, "21:15"), updated_at: timestamp(date, "21:15"),
  })), existing.mood_records);

  inserted.sleep_records = await insertMissing("sleep_records", dates.map((date, index) => ({
    user_id: userId, record_date: date, sleep_start: daily[index].sleepStart,
    sleep_end: addMinutes(daily[index].sleepStart, daily[index].sleepMinutes),
    sleep_duration_minutes: daily[index].sleepMinutes,
    deep_sleep_minutes: Math.round(daily[index].sleepMinutes * .20),
    light_sleep_minutes: Math.round(daily[index].sleepMinutes * .58),
    rem_minutes: Math.round(daily[index].sleepMinutes * .18),
    self_rating: clamp(Math.round((daily[index].mood - 35) / 10), 1, 5),
    self_note: daily[index].note, device_type: "manual",
    is_night_owl: Number(daily[index].sleepStart.slice(0, 2)) <= 2,
    rhythm_score: Math.round(50 + Math.min(35, Math.max(0, (daily[index].sleepMinutes - 330) / 4))),
    created_at: timestamp(date, "07:40"), updated_at: timestamp(date, "07:40"),
  })), existing.sleep_records);

  inserted.exercise_records = await insertMissing("exercise_records", dates.map((date, index) => ({
    user_id: userId, record_date: date, steps: daily[index].steps, calories: daily[index].activeCalories,
    exercise_minutes: daily[index].exerciseMinutes, heart_rate: String(72 + (index % 5)), spo2: `${97 + index % 2}%`,
    self_rating: daily[index].exerciseMinutes >= 35 ? 5 : daily[index].exerciseMinutes >= 22 ? 4 : 3,
    self_note: daily[index].note, device_type: "manual",
    created_at: timestamp(date, "20:45"), updated_at: timestamp(date, "20:45"),
  })), existing.exercise_records);

  inserted.nutrition_records = await insertMissing("nutrition_records", dates.map((date, index) => ({
    user_id: userId, record_date: date, breakfast_items: mealPlans[index].breakfast,
    lunch_items: mealPlans[index].lunch, dinner_items: mealPlans[index].dinner, pantry_items: [],
    total_calories: daily[index].totalCalories, protein_grams: Math.round(daily[index].totalCalories * .052),
    carbohydrate_grams: Math.round(daily[index].totalCalories * .125), fat_grams: Math.round(daily[index].totalCalories * .032),
    hydration_ml: daily[index].hydrationMl, health_rating: daily[index].totalCalories >= 1900 && daily[index].totalCalories <= 2200 ? 4 : 3,
    created_at: timestamp(date, "20:15"), updated_at: timestamp(date, "20:15"),
  })), existing.nutrition_records);

  inserted.face_records = skipFace ? 0 : await insertMissing("face_records", dates.map((date, index) => ({
    user_id: userId, record_date: date, image_path: null, overall_score: daily[index].faceScore, skin_age: null,
    annotations: [{ label: daily[index].sleepMinutes < 400 ? "轻微疲劳信号" : "状态自然", desc: daily[index].sleepMinutes < 400 ? "眼周状态与近期睡眠偏少一致" : "面部状态与当日自评基本一致", dot_x: .5, dot_y: .42 }],
    feedback: daily[index].sleepMinutes < 400 ? "今天看起来稍有疲劳，优先补水并早点休息。" : "今天的面部状态较平稳，继续保持规律作息。",
    model_version: "nava-manual-history-v1", capture_mode: "bare_face", analysis_confidence: .82,
    derived_features: { fatigue_signal: daily[index].sleepMinutes < 400, overall_score: daily[index].faceScore },
    created_at: timestamp(date, "21:05"), updated_at: timestamp(date, "21:05"),
  })), existing.face_records);

  let taskCount = 0;
  let focusCount = 0;
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    if (existing.focus_records.has(date)) continue;
    let taskId = taskByDate.get(date);
    if (!taskId) {
      taskId = crypto.randomUUID();
      const task = await supabase.from("tasks").insert({
        id: taskId, user_id: userId,
        title: index % 3 === 0 ? "项目整理" : index % 3 === 1 ? "阅读学习" : "课程复习",
        scheduled_date: date, completed: true, category: "学习与工作",
        estimated_minutes: daily[index].focusMinutes,
        created_at: timestamp(date, "08:50"), updated_at: timestamp(date, "18:10"),
      });
      assertResult(task);
      taskCount += 1;
    }
    const startHour = index % 3 === 0 ? 9 : index % 3 === 1 ? 14 : 19;
    const startedAt = `${date}T${String(startHour).padStart(2, "0")}:00:00+08:00`;
    const endedAt = addTimestampMinutes(startedAt, daily[index].focusMinutes);
    const focus = await supabase.from("focus_records").insert({
      user_id: userId, task_id: taskId, record_date: date,
      completed_sessions: daily[index].focusSessions, total_minutes: daily[index].focusMinutes,
      interrupted_sessions: daily[index].interruptions, category: "学习与工作",
      started_at: startedAt, ended_at: endedAt,
      created_at: endedAt, updated_at: endedAt,
    });
    assertResult(focus);
    focusCount += 1;
  }
  inserted.tasks = taskCount;
  inserted.focus_records = focusCount;

  const rhythm = { succeeded: 0, failed: 0 };
  for (const date of dates) {
    const response = await supabase.functions.invoke("rhythm-score", { body: { date } });
    if (response.error) rhythm.failed += 1;
    else rhythm.succeeded += 1;
  }

  const audit = await auditCounts();
  console.log(JSON.stringify({ anchorDate, startDate, endDate, inserted, rhythm, audit }, null, 2));
} finally {
  await supabase.auth.signOut();
}

async function existingDates() {
  const tables = ["mood_records", "sleep_records", "exercise_records", "nutrition_records", "face_records", "focus_records"];
  const entries = await Promise.all(tables.map(async (table) => {
    const result = await supabase.from(table).select("record_date").eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate);
    assertResult(result);
    return [table, new Set((result.data ?? []).map((row) => row.record_date))];
  }));
  return Object.fromEntries(entries);
}

async function insertMissing(table, rows, existing) {
  const missing = rows.filter((row) => !existing.has(row.record_date));
  if (missing.length === 0) return 0;
  const result = await supabase.from(table).insert(missing);
  assertResult(result);
  return missing.length;
}

async function auditCounts() {
  const tables = ["mood_records", "sleep_records", "exercise_records", "nutrition_records", "face_records", "focus_records", "focus_time_distribution", "health_metric_snapshots", "rhythm_outcome_feedback"];
  const results = await Promise.all(tables.map(async (table) => {
    const result = await supabase.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("record_date", startDate).lte("record_date", endDate);
    assertResult(result);
    return [table, result.count ?? 0];
  }));
  return Object.fromEntries(results);
}

function d(sleepStart,sleepMinutes,mood,steps,exerciseMinutes,activeCalories,focusMinutes,focusSessions,interruptions,totalCalories,hydrationMl,faceScore,note) {
  return { sleepStart,sleepMinutes,mood,steps,exerciseMinutes,activeCalories,focusMinutes,focusSessions,interruptions,totalCalories,hydrationMl,faceScore,note };
}
function f(name, amount, calories) { return { name, amount, calories }; }
function meals(breakfast, lunch, dinner) { return { breakfast, lunch, dinner }; }
function moodFactors(item) { return [item.sleepMinutes < 400 ? "睡眠偏少" : "睡眠", item.focusMinutes > 150 ? "任务较多" : "日常安排", ...(item.exerciseMinutes >= 30 ? ["运动"] : [])]; }
function addMinutes(clock, minutes) { const [hour, minute] = clock.split(":").map(Number); const total = (hour * 60 + minute + minutes) % 1440; return `${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`; }
function addTimestampMinutes(value, minutes) { return new Date(new Date(value).getTime() + minutes * 60_000).toISOString(); }
function timestamp(date, time) { return `${date}T${time}:00+08:00`; }
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function shiftDate(date, days) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function localDate() { const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10); }
function argument(name) { return process.argv.slice(2).find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3); }
function assertResult(result) { if (result.error) throw result.error; }
